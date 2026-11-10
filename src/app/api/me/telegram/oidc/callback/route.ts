import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { verifyTelegramIdToken } from '@/lib/telegram-auth'
import { syncLinkedTelegramUser } from '@/lib/telegram-link-sync'
import { getAppUrlOrRequestOrigin } from '@/lib/app-url'
import {
  exchangeTelegramCode,
  TELEGRAM_OIDC_STATE_COOKIE,
  TELEGRAM_OIDC_VERIFIER_COOKIE,
} from '@/lib/telegram-oidc'
import {
  mergeTechnicalTelegramAccount,
  TelegramAccountMergeError,
} from '@/lib/telegram-account-merge'
import { recordIdentityConflict } from '@/lib/identity-conflicts'
import { writeAuditLog } from '@/lib/audit-log'
import { logError } from '@/lib/logger'
import { completeMobileTelegramOAuth, isMobileTelegramState } from '@/lib/auth/mobile-telegram-oauth'

export const runtime = 'nodejs'
const completeLink = withAuth(async (req: Request) => {
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
    const telegramUser = await verifyTelegramIdToken(await exchangeTelegramCode(code, verifier))

    const currentUser = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { id: true, emailVerifiedAt: true, telegramId: true },
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
        await recordIdentityConflict({
          targetUserId: session.uid,
          telegramId: telegramUser.id,
          code: error.code,
          request: req,
        })
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
      await writeAuditLog({
        actorId: session.uid,
        targetId: session.uid,
        action: 'ADMIN_PROFILE_UPDATED',
        message: currentUser.telegramId
          ? 'Пользователь изменил привязку Telegram'
          : 'Пользователь привязал Telegram',
        metadata: {
          previousTelegramId: currentUser.telegramId?.toString() ?? null,
          telegramId: telegramUser.id.toString(),
          username: telegramUser.username,
        },
        request: req,
      })
    } catch (error) {
      logError('telegram_link.audit_failed', error, { userId: session.uid })
    }

    try {
      const sync = await syncLinkedTelegramUser({
        localUserId: session.uid,
        telegramId: telegramUser.id,
      })
      settingsUrl.searchParams.set('telegram_linked', '1')
      if (sync.alreadyRunning) settingsUrl.searchParams.set('telegram_sync', 'running')
    } catch {
      settingsUrl.searchParams.set('telegram_linked', '1')
      settingsUrl.searchParams.set('telegram_sync', 'failed')
    }

    return clearOidcCookies(NextResponse.redirect(settingsUrl))
  } catch {
    settingsUrl.searchParams.set('telegram_error', 'telegram_oidc_failed')
    return clearOidcCookies(NextResponse.redirect(settingsUrl))
  }
})

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams
  return isMobileTelegramState(params.get('state'))
    ? completeMobileTelegramOAuth(req, params)
    : completeLink(req)
}

function clearOidcCookies(response: NextResponse) {
  response.cookies.delete(TELEGRAM_OIDC_STATE_COOKIE)
  response.cookies.delete(TELEGRAM_OIDC_VERIFIER_COOKIE)
  return response
}
