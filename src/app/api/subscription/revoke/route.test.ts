import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  revokeSubscription: vi.fn(),
  RemnawaveError: class TestRemnawaveError extends Error {},
  prisma: {
    user: { findUnique: vi.fn() },
    subscription: { updateMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/remnawave', () => ({
  remnawave: { revokeSubscription: mocks.revokeSubscription },
  RemnawaveError: mocks.RemnawaveError,
}))

import { POST } from './route'

function revokeRequest() {
  return new Request('https://cabinet.example/api/subscription/revoke', { method: 'POST' })
}

describe('subscription revoke route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1', email: 'user@example.com', role: 'USER' })
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      remnawaveUuid: 'uuid-1',
    })
    mocks.revokeSubscription.mockResolvedValue(undefined)
    mocks.prisma.subscription.updateMany.mockResolvedValue({ count: 1 })
  })

  it('returns 404 when user has no Remnawave profile', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', remnawaveUuid: null })

    const response = await POST(revokeRequest())
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Нет активной подписки')
    expect(mocks.revokeSubscription).not.toHaveBeenCalled()
  })

  it('revokes keys and marks active subscriptions for sync', async () => {
    const response = await POST(revokeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mocks.revokeSubscription).toHaveBeenCalledWith('uuid-1')
    expect(mocks.prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: { in: ['ACTIVE', 'LIMITED'] } },
      data: { pendingSync: true },
    })
  })

  it('maps Remnawave failures to 502', async () => {
    mocks.revokeSubscription.mockRejectedValue(new mocks.RemnawaveError('panel unavailable'))

    const response = await POST(revokeRequest())
    const body = await response.json()

    expect(response.status).toBe(502)
    expect(body.error).toContain('Не удалось перевыпустить ключи')
  })
})
