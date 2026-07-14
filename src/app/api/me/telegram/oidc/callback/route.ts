import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { verifyTelegramIdToken } from '@/lib/telegram-auth'
import { attachRemnashopIdentityToCabinetUser } from '@/lib/telegram-link-sync'
import { getAppUrlOrRequestOrigin } from '@/lib/app-url'
import {
  getTelegramRedirectUri,
  TELEGRAM_OIDC_STATE_COOKIE,
  TELEGRAM_OIDC_VERIFIER_COOKIE,
} from '@/lib/telegram-oidc'
import {
  mergeTechnicalTelegramAccount,
  TelegramAccountMergeError,
} from '@/lib/telegram-account-merge'

export const runtime = 'nodejs'
const OAUTH_TIMEOUT_MS = 10_000

export const GET = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const url = new URL(req.url)
  const settingsUrl = new URL('/dashboard/settings', getAppUrlOrRequestOrigin(req))

  const error = url.searchParams.get('error')
  if (error) {
    settingsUrl.searchParams.set('telegram_error', error)
    return NextResponse.redirect(settingsUrl)
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieStore = await cookies()
  const expectedState = cookieStore.get(TELEGRAM_OIDC_STATE_COOKIE)?.value
  const verifier = cookieStore.get(TELEGRAM_OIDC_VERIFIER_COOKIE)?.value

  if (!code || !state || !expectedState || !verifier || state !== expectedState) {
    settingsUrl.searchParams.set('telegram_error', 'invalid_state')
    return clearOidcCookies(NextResponse.redirect(settingsUrl))
  }

  try {
    const tokenResponse = await exchangeTelegramCode(code, verifier)
    const telegramUser = await verifyTelegramIdToken(tokenResponse.id_token)

    const currentUser = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { id: true, emailVerifiedAt: true },
    })
    if (!currentUser) {
      settingsUrl.searchParams.set('telegram_error', 'user_not_found')
      return clearOidcCookies(NextResponse.redirect(settingsUrl))
    }
    if (!currentUser.emailVerifiedAt) {
      settingsUrl.searchParams.set('telegram_error', 'email_not_verified')
      return clearOidcCookies(NextResponse.redirect(settingsUrl))
    }

    try {
      await mergeTechnicalTelegramAccount({
        targetUserId: session.uid,
        telegramId: telegramUser.id,
        telegramUsername: telegramUser.username,
        telegramName: telegramUser.name,
      })
    } catch (error) {
      if (error instanceof TelegramAccountMergeError) {
        settingsUrl.searchParams.set(
          'telegram_error',
          error.code === 'PRIVILEGED_SOURCE'
            ? 'telegram_privileged_source'
            : 'telegram_identity_conflict'
        )
        return clearOidcCookies(NextResponse.redirect(settingsUrl))
      }
      throw error
    }

    await prisma.user.update({
      where: { id: session.uid },
      data: {
        telegramId: telegramUser.id,
        telegramUsername: telegramUser.username,
        telegramLinkedAt: new Date(),
        name: telegramUser.name ?? undefined,
      },
    })

    try {
      const remnashopUser = await attachRemnashopIdentityToCabinetUser({
        localUserId: session.uid,
        telegramId: telegramUser.id,
      })
      settingsUrl.searchParams.set('telegram_linked', '1')
      if (remnashopUser?.user_remna_id) settingsUrl.searchParams.set('telegram_sync', 'pending')
    } catch {
      settingsUrl.searchParams.set('telegram_linked', '1')
      settingsUrl.searchParams.set('telegram_sync', 'failed')
    }

    return clearOidcCookies(NextResponse.redirect(settingsUrl))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'telegram_oidc_failed'
    settingsUrl.searchParams.set('telegram_error', message)
    return clearOidcCookies(NextResponse.redirect(settingsUrl))
  }
})

async function exchangeTelegramCode(code: string, codeVerifier: string) {
  const clientId = process.env.TELEGRAM_CLIENT_ID
  const clientSecret = process.env.TELEGRAM_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('TELEGRAM_CLIENT_ID or TELEGRAM_CLIENT_SECRET is not configured')
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getTelegramRedirectUri(),
    client_id: clientId,
    code_verifier: codeVerifier,
  })

  const response = await fetch('https://oauth.telegram.org/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  })

  const data = (await response.json().catch(() => null)) as { id_token?: string; error?: string } | null
  if (!response.ok || !data?.id_token) {
    throw new Error(data?.error || 'telegram_token_exchange_failed')
  }

  return { id_token: data.id_token }
}

function clearOidcCookies(response: NextResponse) {
  response.cookies.delete(TELEGRAM_OIDC_STATE_COOKIE)
  response.cookies.delete(TELEGRAM_OIDC_VERIFIER_COOKIE)
  return response
}
