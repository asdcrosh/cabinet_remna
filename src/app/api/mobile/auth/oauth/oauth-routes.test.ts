import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-chars'
process.env.APP_URL = 'https://cabinet.example'

const mocks = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  rateLimit: vi.fn(),
  getSession: vi.fn(),
  createMobileAuthCode: vi.fn(),
  exchangeMobileAuthCode: vi.fn(),
  createMobileSession: vi.fn(),
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
import { MOBILE_OAUTH_INTENT_COOKIE } from '@/lib/auth/mobile-oauth'

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

  it('complete: без намерения или без входа возвращает в приложение с ошибкой', async () => {
    let res = await complete()
    expect(res.headers.get('location')).toBe('stealthnet://oauth?error=expired')

    await start(startUrl(goodStart))
    mocks.getSession.mockResolvedValue(null)
    res = await complete()
    expect(res.headers.get('location')).toBe('stealthnet://oauth?error=login_failed')
    expect(mocks.createMobileAuthCode).not.toHaveBeenCalled()
  })

  it('complete: выдаёт одноразовый код и не даёт его кэшировать', async () => {
    await start(startUrl(goodStart))
    mocks.getSession.mockResolvedValue({ uid: 'user-1', stage: 'FULL' })
    mocks.createMobileAuthCode.mockResolvedValue('one-time-code-value')
    const res = await complete()
    expect(res.headers.get('location')).toBe('stealthnet://oauth?code=one-time-code-value')
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
