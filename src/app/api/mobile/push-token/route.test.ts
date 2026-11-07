import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({ requireAuth: mocks.requireAuth, withAuth: (h: unknown) => h }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/prisma', () => ({
  prisma: { mobilePushToken: { upsert: mocks.upsert, deleteMany: mocks.deleteMany } },
}))

import { DELETE, PUT } from './route'

const mobile = { uid: 'u1', aud: 'mobile', sid: 's1' }
const token = 'fcm-token-'.padEnd(60, 'x')

function req(method: string, body: unknown) {
  return new Request('https://lk.example/api/mobile/push-token', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/mobile/push-token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue(mobile)
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.upsert.mockResolvedValue({})
    mocks.deleteMany.mockResolvedValue({ count: 0 })
  })

  it('сохраняет токен за текущей сессией с категориями', async () => {
    const res = await PUT(req('PUT', { token, subscription: true, payments: false, news: true }))
    expect(res.status).toBe(200)
    const data = { userId: 'u1', mobileSessionId: 's1', platform: 'android', subscriptionAlerts: true, paymentAlerts: false, newsAlerts: true }
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { token }, create: { token, ...data }, update: data })
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { mobileSessionId: 's1', token: { not: token } } })
  })

  it('только для сессии приложения', async () => {
    mocks.requireAuth.mockResolvedValue({ uid: 'u1', aud: 'web' })
    const res = await PUT(req('PUT', { token, subscription: true, payments: true, news: true }))
    expect(res.status).toBe(403)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('отклоняет кривые данные и лишние поля', async () => {
    expect((await PUT(req('PUT', { token: 'short', subscription: true, payments: true, news: true }))).status).toBe(400)
    expect((await PUT(req('PUT', { token, subscription: true, payments: true, news: true, userId: 'u2' }))).status).toBe(400)
  })

  it('удаляет только свой токен', async () => {
    const res = await DELETE(req('DELETE', { token }))
    expect(res.status).toBe(200)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { token, userId: 'u1' } })
  })
})
