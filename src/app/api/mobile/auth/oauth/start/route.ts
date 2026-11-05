// GET /api/mobile/auth/oauth/start — начало входа в приложение через браузер.
// Приложение открывает этот адрес во встроенном браузере (Custom Tabs) с параметрами:
//   provider=yandex, code_challenge=<S256>, code_challenge_method=S256,
//   hwid, device_name?, platform?, app_version?, legal=1 (согласие при регистрации), ref?
// Намерение входа сохраняется в подписанной httpOnly-cookie и дальше идёт обычный OAuth кабинета.
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { jsonResponse } from '@/lib/json-response'
import { rateLimit } from '@/lib/rate-limit'
import { getAppUrlOrRequestOrigin } from '@/lib/app-url'
import { getYandexOAuthCookieOptions, sanitizeOAuthReferral } from '@/lib/yandex-oauth'
import { mobileDeviceSchema } from '@/lib/auth/mobile-session'
import {
  codeChallengeSchema,
  MOBILE_OAUTH_INTENT_COOKIE,
  MOBILE_OAUTH_INTENT_TTL_SECONDS,
  signMobileOAuthIntent,
} from '@/lib/auth/mobile-oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COMPLETE_PATH = '/api/mobile/auth/oauth/complete'
const PROVIDERS = { yandex: '/api/auth/yandex/start' } as const

export async function GET(req: Request) {
  const limited = await rateLimit(req, 'mobile-oauth-start', 30, 60_000)
  if (!limited.ok) {
    return jsonResponse(
      { error: 'Слишком много попыток входа. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  const q = new URL(req.url).searchParams
  const provider = q.get('provider') as keyof typeof PROVIDERS | null
  if (!provider || !(provider in PROVIDERS)) {
    return jsonResponse({ error: 'Неизвестный способ входа' }, { status: 400 })
  }
  if (q.get('code_challenge_method') !== 'S256') {
    return jsonResponse({ error: 'Поддерживается только code_challenge_method=S256' }, { status: 400 })
  }
  const challenge = codeChallengeSchema.safeParse(q.get('code_challenge'))
  const device = mobileDeviceSchema.safeParse({
    hwid: q.get('hwid') ?? '',
    name: q.get('device_name') ?? undefined,
    platform: q.get('platform') ?? undefined,
    appVersion: q.get('app_version') ?? undefined,
  })
  if (!challenge.success || !device.success) {
    return jsonResponse({ error: 'Некорректные параметры входа' }, { status: 400 })
  }

  const intent = await signMobileOAuthIntent({ codeChallenge: challenge.data, device: device.data })
  const cookieStore = await cookies()
  cookieStore.set(MOBILE_OAUTH_INTENT_COOKIE, intent, {
    ...getYandexOAuthCookieOptions(),
    maxAge: MOBILE_OAUTH_INTENT_TTL_SECONDS,
  })

  const target = new URL(PROVIDERS[provider], getAppUrlOrRequestOrigin(req))
  target.searchParams.set('next', COMPLETE_PATH)
  if (q.get('legal') === '1') target.searchParams.set('legal', '1')
  const ref = sanitizeOAuthReferral(q.get('ref'))
  if (ref) target.searchParams.set('ref', ref)
  return NextResponse.redirect(target)
}
