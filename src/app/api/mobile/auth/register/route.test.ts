import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rateLimit: vi.fn(), registerWithPassword: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/auth/password-register', () => ({ registerWithPassword: mocks.registerWithPassword }))

import { POST } from './route'

const valid = {
  email: 'new@example.com',
  password: 'Str0ng-pass-123',
  agreeToTerms: true,
  agreeToPersonalData: true,
}
const request = (body: unknown) =>
  new Request('https://cabinet.example/api/mobile/auth/register', { method: 'POST', body: JSON.stringify(body) })

describe('POST /api/mobile/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimit.mockResolvedValue({ ok: true })
  })

  it('одинаковый ответ 202 для новой и уже занятой почты', async () => {
    mocks.registerWithPassword.mockResolvedValueOnce({ kind: 'created', user: { id: 'u' }, emailDelivery: 'sent', remnashopSync: 'synced' })
    const created = await POST(request(valid))
    mocks.registerWithPassword.mockResolvedValueOnce({ kind: 'existing' })
    const existing = await POST(request(valid))
    expect(created.status).toBe(202)
    expect(existing.status).toBe(202)
    expect(await created.json()).toEqual(await existing.json())
  })

  it('не передаёт next и требует согласия', async () => {
    mocks.registerWithPassword.mockResolvedValue({ kind: 'existing' })
    await POST(request({ ...valid, next: '/dashboard/evil' }))
    expect(mocks.registerWithPassword).toHaveBeenCalledWith(expect.not.objectContaining({ next: expect.anything() }))
    const res = await POST(request({ ...valid, agreeToTerms: false }))
    expect(res.status).toBe(400)
  })

  it('сообщает о неверном реферальном коде', async () => {
    mocks.registerWithPassword.mockResolvedValue({ kind: 'referral_not_found' })
    const res = await POST(request({ ...valid, referralCode: 'NOPE123' }))
    expect(res.status).toBe(404)
  })

  it('ограничивает частоту регистраций', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 60 })
    expect((await POST(request(valid))).status).toBe(429)
  })
})
