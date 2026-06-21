import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import {
  createTelegramCodeChallenge,
  createTelegramCodeVerifier,
  createTelegramOidcState,
  getTelegramOidcCookieOptions,
  getTelegramRedirectUri,
  TELEGRAM_OIDC_STATE_COOKIE,
  TELEGRAM_OIDC_VERIFIER_COOKIE,
} from '@/lib/telegram-oidc'

export const runtime = 'nodejs'

export const GET = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `telegram-oidc-start:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много попыток привязки Telegram. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const clientId = process.env.TELEGRAM_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'TELEGRAM_CLIENT_ID is not configured' }, { status: 500 })
  }

  const state = createTelegramOidcState()
  const verifier = createTelegramCodeVerifier()
  const url = new URL('https://oauth.telegram.org/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', getTelegramRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid profile telegram:bot_access')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', createTelegramCodeChallenge(verifier))
  url.searchParams.set('code_challenge_method', 'S256')

  const cookieOptions = getTelegramOidcCookieOptions()
  cookies().set(TELEGRAM_OIDC_STATE_COOKIE, state, cookieOptions)
  cookies().set(TELEGRAM_OIDC_VERIFIER_COOKIE, verifier, cookieOptions)

  return NextResponse.redirect(url)
})
