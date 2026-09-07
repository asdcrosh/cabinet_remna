import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  isFeatureEnabled: vi.fn(),
  assessBonusBoxRisk: vi.fn(),
  openBonusBox: vi.fn(),
  getBonusBoxOverview: vi.fn(),
  retryPendingBonusBoxSyncsForUser: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: mocks.isFeatureEnabled }))
vi.mock('@/lib/bonus-box-engagement', () => ({
  assessBonusBoxRisk: mocks.assessBonusBoxRisk,
  BonusBoxRiskError: class BonusBoxRiskError extends Error {},
}))
vi.mock('@/lib/bonus-box', () => ({
  BonusBoxError: class BonusBoxError extends Error {},
  openBonusBox: mocks.openBonusBox,
  getBonusBoxOverview: mocks.getBonusBoxOverview,
  retryPendingBonusBoxSyncsForUser: mocks.retryPendingBonusBoxSyncsForUser,
}))

import { POST } from './route'

const spinId = '00000000-0000-4000-8000-000000000001'

describe('POST /api/bonus-box', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isFeatureEnabled.mockResolvedValue(true)
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1' })
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.openBonusBox.mockResolvedValue({ id: 'opening-1' })
  })

  it('requires a client-generated spin id and passes it to the idempotent opening', async () => {
    const request = new Request('https://cabinet.example/api/bonus-box', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spinId }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mocks.openBonusBox).toHaveBeenCalledWith('user-1', spinId)
  })

  it.each([
    {},
    { spinId: 'not-a-uuid' },
    { spinId, unexpected: true },
  ])('rejects an invalid spin contract: %j', async (body) => {
    const request = new Request('https://cabinet.example/api/bonus-box', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'INVALID_SPIN_ID' })
    expect(mocks.openBonusBox).not.toHaveBeenCalled()
    expect(mocks.assessBonusBoxRisk).not.toHaveBeenCalled()
  })
})
