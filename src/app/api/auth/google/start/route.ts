import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { rateLimit } from '@/lib/rate-limit'
import {
  buildGoogleAuthUrl,
  createGoogleOAuthState,
  getGoogleOAuthCookieOptions,
  GOOGLE_OAUTH_NEXT_COOKIE,
  GOOGLE_OAUTH_REF_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  sanitizeOAuthNext,
  sanitizeOAuthReferral,
} from '@/lib/google-oauth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const limited = await rateLimit(req, 'google-oauth-start', 30, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток входа. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const requestUrl = new URL(req.url)
  const state = createGoogleOAuthState()
  const next = sanitizeOAuthNext(requestUrl.searchParams.get('next'))
  const referralCode = sanitizeOAuthReferral(requestUrl.searchParams.get('ref'))

  let googleUrl: URL
  try {
    googleUrl = buildGoogleAuthUrl({ state })
  } catch {
    const loginUrl = new URL('/login', requestUrl.origin)
    loginUrl.searchParams.set('google_error', 'not_configured')
    return NextResponse.redirect(loginUrl)
  }

  const cookieOptions = getGoogleOAuthCookieOptions()
  cookies().set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOptions)
  cookies().set(GOOGLE_OAUTH_NEXT_COOKIE, next, cookieOptions)
  if (referralCode) {
    cookies().set(GOOGLE_OAUTH_REF_COOKIE, referralCode, cookieOptions)
  } else {
    cookies().delete(GOOGLE_OAUTH_REF_COOKIE)
  }

  return NextResponse.redirect(googleUrl)
}
