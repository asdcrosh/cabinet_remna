import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-chars'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rate: vi.fn(),
  send: vi.fn(),
  password: vi.fn(),
  failedPassword: vi.fn(),
  merge: vi.fn(),
  createSession: vi.fn(),
  exchange: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    mobileSession: { findUnique: vi.fn() },
    mobileEmailChallenge: { upsert: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
    emailVerificationToken: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth/guard', () => ({ requireAuth: mocks.session, withAuth: <T>(handler: T) => handler }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rate, rateLimitKey: mocks.rate }))
vi.mock('@/lib/email-verification', () => ({ sendMobileEmailCode: mocks.send }))
vi.mock('@/lib/distributed-lock', () => ({ withDistributedLock: async (_: string, task: () => Promise<unknown>) => ({ acquired: true, value: await task() }) }))
vi.mock('@/lib/auth/password-login', () => ({
  authenticatePassword: mocks.password, checkPasswordLoginByEmail: mocks.rate,
  recordFailedPasswordLogin: mocks.failedPassword,
}))
vi.mock('@/lib/auth/mobile-session', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/auth/mobile-session')>(), createMobileSession: mocks.createSession,
}))
vi.mock('@/lib/auth/mobile-oauth', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/auth/mobile-oauth')>(), exchangeMobileAuthCode: mocks.exchange,
}))
vi.mock('@/lib/telegram-account-merge', () => ({
  mergeTechnicalTelegramAccount: mocks.merge,
  TelegramAccountMergeError: class extends Error {},
}))

import { POST } from './route'
import { TelegramAccountMergeError } from '@/lib/telegram-account-merge'

const email = 'user@example.com'
const owner = {
  id: 'telegram-user', email: 'telegram-123@pending.invalid', telegramId: 123n, role: 'USER',
  emailVerifiedAt: null, mobileTelegramEmailDueAt: new Date('2020-01-01'),
}
const mobileSession = { uid: owner.id, sid: 'mobile-session-1', aud: 'mobile' }

function request(body: object) {
  return POST(new Request('https://cabinet.example/api/mobile/auth/telegram/email', {
    method: 'POST', body: JSON.stringify(body),
  }))
}

describe('подтверждение почты после входа через Telegram', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.session.mockResolvedValue(mobileSession)
    mocks.rate.mockResolvedValue({ ok: true })
    mocks.send.mockResolvedValue({ sent: true })
    mocks.prisma.user.findUnique.mockImplementation(async ({ where }) => where.id === owner.id ? owner : null)
    mocks.prisma.mobileSession.findUnique.mockResolvedValue({ userId: owner.id, hwid: 'android-12345', expiresAt: new Date(Date.now() + 60_000) })
    mocks.prisma.$transaction.mockImplementation(fn => fn(mocks.prisma))
  })

  it('после истечения трёх дней принимает код, записывает почту и не принимает код повторно', async () => {
    expect((await request({ action: 'send', email })).status).toBe(200)
    const [, code] = mocks.send.mock.calls[0]!
    const challenge = mocks.prisma.mobileEmailChallenge.upsert.mock.calls[0]![0].create
    expect(code).toMatch(/^\d{6}$/)
    expect(challenge.codeHash).toMatch(/^[a-f0-9]{64}$/)
    expect(challenge.codeHash).not.toBe(code)
    mocks.prisma.mobileEmailChallenge.findUnique.mockResolvedValue(challenge)
    mocks.prisma.mobileEmailChallenge.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    mocks.prisma.user.updateMany.mockResolvedValue({ count: 1 })

    const wrong = code === '000000' ? '000001' : '000000'
    expect((await request({ action: 'confirm', code: wrong })).status).toBe(400)
    expect(mocks.prisma.mobileEmailChallenge.updateMany).toHaveBeenCalled()
    expect((await request({ action: 'confirm', code })).status).toBe(200)
    expect((await request({ action: 'confirm', code })).status).toBe(400)
    expect(mocks.prisma.user.updateMany).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      data: { email, emailVerifiedAt: expect.any(Date) },
    }))
  })

  it('занятая почта требует подтверждения пароля и не уничтожает мобильную сессию при ошибке', async () => {
    mocks.prisma.user.findUnique.mockResolvedValueOnce(owner).mockResolvedValueOnce({ id: 'existing' })
    const occupied = await request({ action: 'send', email })
    expect(occupied.status).toBe(409)
    expect((await occupied.json()).code).toBe('EMAIL_IN_USE')
    expect(mocks.send).not.toHaveBeenCalled()
    mocks.password.mockResolvedValue({ ok: false, status: 401, body: { error: 'Неверный пароль' } })
    expect((await request({ action: 'link', email, password: 'bad' })).status).toBe(422)
    expect(mocks.failedPassword).toHaveBeenCalledWith(email)
    expect(mocks.merge).not.toHaveBeenCalled()
  })

  it('выдаёт мобильную сессию существующего аккаунта только после успешной привязки', async () => {
    const target = { id: 'existing', role: 'USER', email, emailVerifiedAt: new Date() }
    mocks.password.mockResolvedValue({ ok: true, user: target })
    mocks.merge.mockRejectedValueOnce(new TelegramAccountMergeError('TELEGRAM_ALREADY_LINKED'))
    const conflict = await request({ action: 'link', email, password: 'correct' })
    expect(conflict.status).toBe(409)
    expect((await conflict.json()).code).toBe('TELEGRAM_LINK_CONFLICT')
    expect(mocks.createSession).not.toHaveBeenCalled()

    mocks.merge.mockResolvedValue({ merged: true })
    mocks.createSession.mockResolvedValue({ accessToken: 'new-access', refreshToken: 'new-refresh' })
    const linked = await request({ action: 'link', email, password: 'correct' })
    expect(await linked.json()).toEqual({ ok: true, accessToken: 'new-access', refreshToken: 'new-refresh' })
    expect(mocks.merge).toHaveBeenLastCalledWith(expect.objectContaining({ targetUserId: target.id, expectedSourceUserId: owner.id }))
    expect(mocks.createSession).toHaveBeenCalledWith(target, expect.objectContaining({ hwid: 'android-12345' }), expect.any(Request))
  })

  it('сессия веб-кабинета не может вызвать мобильное подтверждение', async () => {
    mocks.session.mockResolvedValue({ uid: owner.id })
    expect((await request({ action: 'send', email })).status).toBe(403)
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('Яндекс подтверждает именно аккаунт с указанной почтой на том же устройстве', async () => {
    const body = { action: 'link_oauth', email, code: 'one-time-code-12345', codeVerifier: 'a'.repeat(43) }
    const target = { id: 'existing', role: 'USER', email, emailVerifiedAt: new Date() }
    mocks.exchange.mockResolvedValueOnce({ ok: true, user: { ...target, email: 'other@example.com' } })
    expect((await request(body)).status).toBe(422)
    expect(mocks.merge).not.toHaveBeenCalled()

    mocks.exchange.mockResolvedValue({ ok: true, user: target })
    mocks.prisma.user.findUnique.mockResolvedValueOnce(owner).mockResolvedValueOnce(target)
    mocks.merge.mockResolvedValue({ merged: true })
    mocks.createSession.mockResolvedValue({ accessToken: 'new-access' })
    expect((await request(body)).status).toBe(200)
    expect(mocks.exchange).toHaveBeenLastCalledWith(body.code, body.codeVerifier, 'android-12345')
    expect(mocks.createSession).toHaveBeenCalledWith(target, expect.any(Object), expect.any(Request))
  })
})
