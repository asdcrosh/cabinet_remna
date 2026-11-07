import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  authenticatePassword: vi.fn(),
  checkPasswordLoginByEmail: vi.fn(),
  recordFailedPasswordLogin: vi.fn(),
  createMobileSession: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/auth/password-login', () => ({
  authenticatePassword: mocks.authenticatePassword,
  checkPasswordLoginByEmail: mocks.checkPasswordLoginByEmail,
  recordFailedPasswordLogin: mocks.recordFailedPasswordLogin,
}))
vi.mock('@/lib/auth/mobile-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/mobile-session')>()
  return { ...actual, createMobileSession: mocks.createMobileSession }
})

import { POST } from './route'

const device = { hwid: 'hwid-abcdef123456', name: 'Pixel 8', platform: 'android', appVersion: '1.0.0' }
const user = { id: 'user-1', email: 'user@example.com', name: 'User', role: 'USER' }
const tokens = { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 900, sessionId: 'ms-1' }

function request(body: unknown) {
  return new Request('https://cabinet.example/api/mobile/auth/login', { method: 'POST', body: JSON.stringify(body) })
}

describe('POST /api/mobile/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.checkPasswordLoginByEmail.mockResolvedValue({ ok: true })
    mocks.authenticatePassword.mockResolvedValue({ ok: true, user })
    mocks.createMobileSession.mockResolvedValue(tokens)
  })

  it('выдаёт токены приложения без Origin и запрещает кэширование', async () => {
    const res = await POST(request({ email: 'User@Example.com', password: 'secret', device }))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ ...tokens, user })
    expect(mocks.authenticatePassword).toHaveBeenCalledWith('user@example.com', 'secret')
    expect(mocks.createMobileSession).toHaveBeenCalledWith(user, device, expect.any(Request))
  })

  it('возвращает ошибку общей проверки пароля как есть', async () => {
    mocks.authenticatePassword.mockResolvedValue({ ok: false, status: 403, body: { error: 'Подтвердите email перед входом', code: 'EMAIL_NOT_VERIFIED' } })
    const res = await POST(request({ email: 'user@example.com', password: 'secret', device }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('EMAIL_NOT_VERIFIED')
    expect(mocks.createMobileSession).not.toHaveBeenCalled()
  })

  it('требует корректный идентификатор устройства', async () => {
    const res = await POST(request({ email: 'user@example.com', password: 'secret', device: { hwid: 'bad id!' } }))
    expect(res.status).toBe(400)
    expect(mocks.authenticatePassword).not.toHaveBeenCalled()
  })

  it('ограничивает частоту попыток', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    const res = await POST(request({ email: 'user@example.com', password: 'secret', device }))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('30')
  })

  it('ограничивает попытки входа в один аккаунт с разных IP', async () => {
    mocks.checkPasswordLoginByEmail.mockResolvedValue({ ok: false, retryAfter: 600 })
    const res = await POST(request({ email: 'User@Example.com', password: 'secret', device }))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('600')
    expect(mocks.checkPasswordLoginByEmail).toHaveBeenCalledWith('user@example.com')
    expect(mocks.authenticatePassword).not.toHaveBeenCalled()
  })

  it('учитывает в лимите по почте только неверный пароль', async () => {
    await POST(request({ email: 'user@example.com', password: 'secret', device }))
    expect(mocks.recordFailedPasswordLogin).not.toHaveBeenCalled()
    mocks.authenticatePassword.mockResolvedValue({ ok: false, status: 401, body: { error: 'Неверный email или пароль' } })
    await POST(request({ email: 'user@example.com', password: 'secret', device }))
    expect(mocks.recordFailedPasswordLogin).toHaveBeenCalledWith('user@example.com')
  })
})
