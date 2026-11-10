import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { getAppUrlOrRequestOrigin } from '@/lib/app-url'
import { PERSONAL_DATA_CONSENT_VERSION, TERMS_VERSION } from '@/lib/legal'
import { logWarn } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { generateUniqueReferralCode } from '@/lib/referrals'
import { syncMobileTelegramSubscription } from '@/lib/remnashop-users'
import { verifyTelegramIdToken } from '@/lib/telegram-auth'
import {
  createTelegramCodeChallenge,
  createTelegramCodeVerifier,
  createTelegramOidcState,
  exchangeTelegramCode,
  getTelegramOidcCookieOptions,
  getTelegramRedirectUri,
} from '@/lib/telegram-oidc'
import { findCanonicalTelegramSessionUser } from '@/lib/telegram-session'
import { createMobileAuthCode, signMobileOAuthIntent, verifyMobileOAuthIntent, type MobileOAuthIntent } from './mobile-oauth'

export const MOBILE_TELEGRAM_INTENT_COOKIE = 'mobile_telegram_intent'
const STATE_PREFIX = 'mobile.'
const privateHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

export function isMobileTelegramState(state: string | null) {
  return state?.startsWith(STATE_PREFIX) === true
}

export async function startMobileTelegramOAuth(req: Request, intent: MobileOAuthIntent) {
  const clientId = process.env.TELEGRAM_CLIENT_ID
  if (!clientId || !process.env.TELEGRAM_CLIENT_SECRET) return returnError(req, 'telegram_unavailable')

  const telegram = { state: STATE_PREFIX + createTelegramOidcState(), verifier: createTelegramCodeVerifier() }
  const url = new URL('https://oauth.telegram.org/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getTelegramRedirectUri(),
    response_type: 'code',
    scope: 'openid profile',
    state: telegram.state,
    code_challenge: createTelegramCodeChallenge(telegram.verifier),
    code_challenge_method: 'S256',
  }).toString()
  const response = NextResponse.redirect(url, { headers: privateHeaders })
  response.cookies.set(
    MOBILE_TELEGRAM_INTENT_COOKIE,
    await signMobileOAuthIntent({ ...intent, telegram }),
    getTelegramOidcCookieOptions(),
  )
  return response
}

export async function completeMobileTelegramOAuth(req: Request, params: URLSearchParams) {
  const cookieStore = await cookies()
  const intent = await verifyMobileOAuthIntent(cookieStore.get(MOBILE_TELEGRAM_INTENT_COOKIE)?.value)
  if (!intent?.telegram || params.get('state') !== intent.telegram.state) return returnError(req, 'expired', false)
  if (params.get('error') === 'access_denied') return returnError(req, 'telegram_cancelled')
  const code = params.get('code')
  if (!code || params.has('error')) return returnError(req, 'telegram_failed')

  try {
    const idToken = await exchangeTelegramCode(code, intent.telegram.verifier)
    const telegram = await verifyTelegramIdToken(idToken, { requireNumericId: true })
    const existing = await findCanonicalTelegramSessionUser({ telegramId: telegram.id })
    if (!existing && !intent.legalAccepted) return returnError(req, 'telegram_consent_required')
    const user = existing ?? await createTelegramUser(telegram)
    try {
      await syncMobileTelegramSubscription(user.id, telegram.id)
    } catch {
      logWarn('auth.mobile_telegram.subscription_sync_failed', { userId: user.id })
    }
    const appCode = await createMobileAuthCode(user.id, intent, telegram.id)
    return returnToApp(req, { code: appCode })
  } catch {
    logWarn('auth.mobile_telegram.failed')
    return returnError(req, 'telegram_failed')
  }
}

async function createTelegramUser(telegram: { id: bigint; name: string | null; username: string | null }) {
  const now = new Date()
  try {
    return await prisma.user.create({
      data: {
        email: `telegram-${telegram.id}@pending.invalid`,
        passwordHash: await hash(randomBytes(48).toString('base64url'), 12),
        telegramId: telegram.id,
        telegramUsername: telegram.username,
        telegramLinkedAt: now,
        name: telegram.name,
        referralCode: await generateUniqueReferralCode(),
        agreedToTermsAt: now,
        agreedToTermsVersion: TERMS_VERSION,
        personalDataConsentAt: now,
        personalDataConsentVersion: PERSONAL_DATA_CONSENT_VERSION,
      },
      select: { id: true },
    })
  } catch (error) {
    // Два входа с разных устройств могут прийти одновременно.
    const existing = await findCanonicalTelegramSessionUser({ telegramId: telegram.id })
    if (existing) return existing
    throw error
  }
}

function returnError(req: Request, error: string, clear = true) {
  return returnToApp(req, { error }, clear)
}

function returnToApp(req: Request, result: { code: string } | { error: string }, clear = true) {
  const url = new URL('/app/oauth-return', getAppUrlOrRequestOrigin(req))
  url.search = new URLSearchParams(result).toString()
  const response = NextResponse.redirect(url, { status: 302, headers: privateHeaders })
  if (clear) response.cookies.delete(MOBILE_TELEGRAM_INTENT_COOKIE)
  return response
}
