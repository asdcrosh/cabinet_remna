import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { rateLimit } from '@/lib/rate-limit'
import {
  buildYandexAuthUrl,
  createYandexOAuthState,
  getYandexOAuthCookieOptions,
  sanitizeOAuthNext,
  sanitizeOAuthReferral,
  YANDEX_OAUTH_LEGAL_COOKIE,
  YANDEX_OAUTH_NEXT_COOKIE,
  YANDEX_OAUTH_REF_COOKIE,
  YANDEX_OAUTH_STATE_COOKIE,
} from '@/lib/yandex-oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const limited = await rateLimit(req, 'yandex-oauth-start', 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const requestUrl = new URL(req.url)
  const state = createYandexOAuthState()
  const next = sanitizeOAuthNext(requestUrl.searchParams.get('next'))
  const referralCode = sanitizeOAuthReferral(requestUrl.searchParams.get('ref'))
  const legalAccepted = requestUrl.searchParams.get('legal') === '1'

  let yandexUrl: URL
  try {
    yandexUrl = buildYandexAuthUrl({ state })
  } catch {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('yandex_error', 'not_configured')
    return NextResponse.redirect(loginUrl)
  }

  const cookieOptions = getYandexOAuthCookieOptions()
  const cookieStore = await cookies()
  cookieStore.set(YANDEX_OAUTH_STATE_COOKIE, state, cookieOptions)
  cookieStore.set(YANDEX_OAUTH_NEXT_COOKIE, next, cookieOptions)
  if (legalAccepted) {
    cookieStore.set(YANDEX_OAUTH_LEGAL_COOKIE, '1', cookieOptions)
  } else {
    cookieStore.delete(YANDEX_OAUTH_LEGAL_COOKIE)
  }
  if (referralCode) {
    cookieStore.set(YANDEX_OAUTH_REF_COOKIE, referralCode, cookieOptions)
  } else {
    cookieStore.delete(YANDEX_OAUTH_REF_COOKIE)
  }

  return NextResponse.redirect(yandexUrl)
}
