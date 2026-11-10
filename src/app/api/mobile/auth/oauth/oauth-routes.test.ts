import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-chars'
process.env.APP_URL = 'https://cabinet.example'

const mocks = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  rateLimit: vi.fn(),
  getSession: vi.fn(),
  createMobileAuthCode: vi.fn(),
  exchangeMobileAuthCode: vi.fn(),
  createMobileSession: vi.fn(),
  findTelegramUser: vi.fn(),
  syncMobileTelegramSubscription: vi.fn(),
  createTelegramUser: vi.fn(),
  verifyTelegramIdToken: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (mocks.cookieJar.has(name) ? { value: mocks.cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => mocks.cookieJar.set(name, value),
    delete: (name: string) => mocks.cookieJar.delete(name),
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/auth/cookies', () => ({ getSession: mocks.getSession }))
vi.mock('@/lib/telegram-auth', () => ({ verifyTelegramIdToken: mocks.verifyTelegramIdToken }))
vi.mock('@/lib/remnashop-users', () => ({ syncMobileTelegramSubscription: mocks.syncMobileTelegramSubscription }))
vi.mock('@/lib/telegram-session', () => ({ findCanonicalTelegramSessionUser: mocks.findTelegramUser }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { create: mocks.createTelegramUser } } }))
vi.mock('@/lib/referrals', () => ({ generateUniqueReferralCode: vi.fn().mockResolvedValue('REF123') }))
vi.mock('@/lib/auth/mobile-oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/mobile-oauth')>()
  return { ...actual, createMobileAuthCode: mocks.createMobileAuthCode, exchangeMobileAuthCode: mocks.exchangeMobileAuthCode }
})
vi.mock('@/lib/auth/mobile-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/mobile-session')>()
  return { ...actual, createMobileSession: mocks.createMobileSession }
})

import { GET as start } from './start/route'
import { GET as complete } from './complete/route'
import { POST as exchange } from './exchange/route'
import { GET as telegramCallback } from '@/app/api/me/telegram/oidc/callback/route'
import { MOBILE_OAUTH_INTENT_COOKIE } from '@/lib/auth/mobile-oauth'
import { MOBILE_TELEGRAM_INTENT_COOKIE } from '@/lib/auth/mobile-telegram-oauth'

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const startUrl = (params: Record<string, string>) =>
  new Request(`https://cabinet.example/api/mobile/auth/oauth/start?${new URLSearchParams(params)}`)
const goodStart = { provider: 'yandex', code_challenge: CHALLENGE, code_challenge_method: 'S256', hwid: 'hwid-abcdef123456', platform: 'android' }

describe('вход в приложение через браузер', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookieJar.clear()
    mocks.rateLimit.mockResolvedValue({ ok: true })
  })

  it('start: сохраняет намерение и уводит в Яндекс с возвратом на complete', async () => {
    const res = await start(startUrl({ ...goodStart, legal: '1', ref: 'FRIEND-1' }))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/api/auth/yandex/start')
    expect(location.searchParams.get('next')).toBe('/api/mobile/auth/oauth/complete')
    expect(location.searchParams.get('legal')).toBe('1')
    expect(location.searchParams.get('ref')).toBe('FRIEND-1')
    expect(mocks.cookieJar.get(MOBILE_OAUTH_INTENT_COOKIE)).toBeTruthy()
  })

  it('start: отклоняет неизвестный способ входа, plain-PKCE и плохой challenge', async () => {
    expect((await start(startUrl({ ...goodStart, provider: 'google' }))).status).toBe(400)
    expect((await start(startUrl({ ...goodStart, code_challenge_method: 'plain' }))).status).toBe(400)
    expect((await start(startUrl({ ...goodStart, code_challenge: 'short' }))).status).toBe(400)
    expect(mocks.cookieJar.size).toBe(0)
  })

  it('complete: без намерения или без входа возвращает на /app/oauth-return с ошибкой', async () => {
    let res = await complete(new Request('https://cabinet.example/api/mobile/auth/oauth/complete'))
    expect(res.headers.get('location')).toBe('https://cabinet.example/app/oauth-return?error=expired')

    await start(startUrl(goodStart))
    mocks.getSession.mockResolvedValue(null)
    res = await complete(new Request('https://cabinet.example/api/mobile/auth/oauth/complete'))
    expect(res.headers.get('location')).toBe('https://cabinet.example/app/oauth-return?error=login_failed')
    expect(mocks.createMobileAuthCode).not.toHaveBeenCalled()
  })

  it('complete: выдаёт одноразовый код и не даёт его кэшировать', async () => {
    await start(startUrl(goodStart))
    mocks.getSession.mockResolvedValue({ uid: 'user-1', stage: 'FULL' })
    mocks.createMobileAuthCode.mockResolvedValue('one-time-code-value')
    const res = await complete(new Request('https://cabinet.example/api/mobile/auth/oauth/complete'))
    expect(res.headers.get('location')).toBe('https://cabinet.example/app/oauth-return?code=one-time-code-value')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.createMobileAuthCode).toHaveBeenCalledWith('user-1', expect.objectContaining({ codeChallenge: CHALLENGE }))
  })

  it('exchange: выдаёт токены по коду и verifier', async () => {
    const user = { id: 'user-1', email: 'u@example.com', name: null, role: 'USER' }
    const device = { hwid: 'hwid-abcdef123456' }
    mocks.exchangeMobileAuthCode.mockResolvedValue({ ok: true, user, device })
    mocks.createMobileSession.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900, sessionId: 'ms-1' })
    const res = await exchange(new Request('https://cabinet.example/api/mobile/auth/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code: 'one-time-code-value-xx', codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', hwid: 'hwid-abcdef123456' }),
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).user).toEqual(user)
    expect(mocks.createMobileSession).toHaveBeenCalledWith(user, device, expect.any(Request))
  })

  it('exchange: ошибка обмена — 401 с кодом причины', async () => {
    mocks.exchangeMobileAuthCode.mockResolvedValue({ ok: false, reason: 'verifier_mismatch' })
    const res = await exchange(new Request('https://cabinet.example/api/mobile/auth/oauth/exchange', {
      method: 'POST',
      body: JSON.stringify({ code: 'one-time-code-value-xx', codeVerifier: 'x'.repeat(43), hwid: 'hwid-abcdef123456' }),
    }))
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('VERIFIER_MISMATCH')
    expect(mocks.createMobileSession).not.toHaveBeenCalled()
  })
})

describe('мобильный вход через Telegram', () => {
  const tokenRequest = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    mocks.cookieJar.clear()
    mocks.rateLimit.mockResolvedValue({ ok: true })
    vi.stubEnv('TELEGRAM_CLIENT_ID', '12345')
    vi.stubEnv('TELEGRAM_CLIENT_SECRET', 'test-secret')
    vi.stubGlobal('fetch', tokenRequest)
    tokenRequest.mockResolvedValue(Response.json({ id_token: 'signed-id-token' }))
    mocks.verifyTelegramIdToken.mockResolvedValue({ id: 98765n })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function begin(legal = '0') {
    const res = await start(startUrl({ ...goodStart, provider: 'telegram', device_name: '<Pixel> & tablet', legal }))
    expect(res.status).toBe(307)
    const location = new URL(res.headers.get('location')!)
    expect(location.origin + location.pathname).toBe('https://oauth.telegram.org/auth')
    expect(location.searchParams.get('redirect_uri')).toBe('https://cabinet.example/api/me/telegram/oidc/callback')
    expect(location.searchParams.get('scope')).toBe('openid profile')
    expect(location.searchParams.get('code_challenge')).not.toBe(CHALLENGE)
    const cookie = res.cookies.get(MOBILE_TELEGRAM_INTENT_COOKIE)
    expect(cookie?.httpOnly).toBe(true)
    mocks.cookieJar.set(MOBILE_TELEGRAM_INTENT_COOKIE, cookie!.value)
    return location.searchParams.get('state')!
  }

  function callback(params: Record<string, string>) {
    return telegramCallback(new Request(`https://cabinet.example/api/me/telegram/oidc/callback?${new URLSearchParams(params)}`))
  }

  it('привязанный Telegram получает код для того же аккаунта через App Link', async () => {
    mocks.findTelegramUser.mockResolvedValue({ id: 'existing-user' })
    mocks.createMobileAuthCode.mockResolvedValue('one-time-code')
    const response = await callback({ code: 'telegram-code', state: await begin() })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://cabinet.example/app/oauth-return?code=one-time-code')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.cookies.getAll().map(cookie => cookie.name)).toEqual([MOBILE_TELEGRAM_INTENT_COOKIE])
    expect(mocks.verifyTelegramIdToken).toHaveBeenCalledWith('signed-id-token', { requireNumericId: true })
    expect(mocks.findTelegramUser).toHaveBeenCalledWith({ telegramId: 98765n })
    expect(mocks.syncMobileTelegramSubscription).toHaveBeenCalledWith('existing-user', 98765n)
    expect(mocks.createMobileAuthCode).toHaveBeenCalledWith('existing-user', expect.objectContaining({
      codeChallenge: CHALLENGE, device: expect.objectContaining({ hwid: goodStart.hwid }),
    }), 98765n)
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.createMobileSession).not.toHaveBeenCalled()
  })

  it('не обменивает код при несовпадении state', async () => {
    await begin()
    const response = await callback({ code: 'telegram-code', state: 'mobile.other' })
    expect(response.headers.get('location')).toContain('error=expired')
    expect(tokenRequest).not.toHaveBeenCalled()
    expect(mocks.createMobileAuthCode).not.toHaveBeenCalled()
  })

  it('сначала требует согласие для нового аккаунта', async () => {
    mocks.findTelegramUser.mockResolvedValue(null)
    const response = await callback({ code: 'telegram-code', state: await begin() })
    expect(response.headers.get('location')).toContain('error=telegram_consent_required')
    expect(mocks.createTelegramUser).not.toHaveBeenCalled()
    expect(mocks.createMobileAuthCode).not.toHaveBeenCalled()
  })

  it('после согласия создаёт аккаунт без почты и выдаёт код только для приложения', async () => {
    mocks.findTelegramUser.mockResolvedValue(null)
    mocks.createTelegramUser.mockResolvedValue({ id: 'new-telegram-user' })
    mocks.createMobileAuthCode.mockResolvedValue('one-time-code')
    const response = await callback({ code: 'telegram-code', state: await begin('1') })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://cabinet.example/app/oauth-return?code=one-time-code')
    expect(mocks.createTelegramUser).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'telegram-98765@pending.invalid', telegramId: 98765n }),
    }))
    expect(mocks.createMobileAuthCode).toHaveBeenCalledWith('new-telegram-user', expect.any(Object), 98765n)
    expect(response.cookies.get('cabinet_session')).toBeUndefined()
  })
})
