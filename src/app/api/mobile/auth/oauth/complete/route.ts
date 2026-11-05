// GET /api/mobile/auth/oauth/complete — завершение входа через браузер.
// Сюда провайдер кабинета (Яндекс ID) возвращает пользователя после входа.
// Выдаём одноразовый код и возвращаем браузер в приложение: stealthnet://oauth?code=…
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth/cookies'
import { logWarn } from '@/lib/logger'
import {
  createMobileAuthCode,
  MOBILE_APP_RETURN_URL,
  MOBILE_OAUTH_INTENT_COOKIE,
  verifyMobileOAuthIntent,
} from '@/lib/auth/mobile-oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function backToApp(params: Record<string, string>) {
  const url = new URL(MOBILE_APP_RETURN_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = NextResponse.redirect(url, 302)
  // Код в адресе: не кэшировать и не передавать как Referer.
  res.headers.set('Cache-Control', 'no-store')
  res.headers.set('Referrer-Policy', 'no-referrer')
  res.cookies.delete(MOBILE_OAUTH_INTENT_COOKIE)
  return res
}

export async function GET() {
  const cookieStore = await cookies()
  const intent = await verifyMobileOAuthIntent(cookieStore.get(MOBILE_OAUTH_INTENT_COOKIE)?.value)
  if (!intent) return backToApp({ error: 'expired' })

  const session = await getSession()
  if (!session || session.stage === 'EMAIL_PENDING') return backToApp({ error: 'login_failed' })

  try {
    const code = await createMobileAuthCode(session.uid, intent)
    return backToApp({ code })
  } catch (error) {
    logWarn('auth.mobile_oauth.complete_failed', {
      userId: session.uid,
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return backToApp({ error: 'server_error' })
  }
}
