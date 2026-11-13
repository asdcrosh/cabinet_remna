import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  rateLimit: vi.fn(),
  isFeatureEnabled: vi.fn(),
  getPromoMergeSettings: vi.fn(),
  mergePromoCodes: vi.fn(),
  deactivate: vi.fn(),
  writeAuditLog: vi.fn(),
  findMerge: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: mocks.isFeatureEnabled }))
vi.mock('@/lib/bonus-box', () => ({ getPromoMergeSettings: mocks.getPromoMergeSettings }))
vi.mock('@/lib/remnashop-promo-sync', () => ({ deactivateCabinetPromoCodesInRemnashopBestEffort: mocks.deactivate }))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/prisma', () => ({ prisma: { promoCodeMerge: { findUnique: mocks.findMerge } } }))
vi.mock('@/lib/promo-code-merge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/promo-code-merge')>()),
  mergePromoCodes: mocks.mergePromoCodes,
}))

import { POST } from './route'
import { PromoMergeError } from '@/lib/promo-code-merge'

const idempotencyKey = '00000000-0000-4000-8000-000000000001'
const settings = { enabled: true, coefficientPercent: 70, capPercent: 30, ttlDays: 7 }

function request(body: unknown) {
  return new Request('https://cabinet.example/api/bonus-box/promo-merge', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/bonus-box/promo-merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isFeatureEnabled.mockResolvedValue(true)
    mocks.requireAuth.mockResolvedValue({ uid: 'user-1' })
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.getPromoMergeSettings.mockResolvedValue(settings)
    mocks.findMerge.mockResolvedValue({ sourceCodes: ['BOX-A', 'BOX-B'] })
    mocks.mergePromoCodes.mockResolvedValue({
      promoCode: { id: 'merged-1', code: 'BOX-NEW', discountPercent: 7 },
      sourcePercents: [5, 5],
      bestSourcePercent: 5,
      replayed: false,
    })
  })

  it('merges the codes of the signed-in user and turns the sources off in the bot', async () => {
    const response = await POST(request({ promoCodeIds: ['a', 'b'], idempotencyKey }))

    expect(response.status).toBe(200)
    expect(mocks.mergePromoCodes).toHaveBeenCalledWith({
      userId: 'user-1',
      promoCodeIds: ['a', 'b'],
      idempotencyKey,
      settings,
    })
    expect(mocks.deactivate).toHaveBeenCalledWith(['BOX-A', 'BOX-B'])
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'PROMO_CODE_MERGED' }))
    await expect(response.json()).resolves.toMatchObject({ promoCode: { code: 'BOX-NEW' } })
  })

  it('does not repeat side effects for a replayed request', async () => {
    mocks.mergePromoCodes.mockResolvedValue({
      promoCode: { id: 'merged-1', code: 'BOX-NEW', discountPercent: 7 },
      sourcePercents: [5, 5],
      bestSourcePercent: 5,
      replayed: true,
    })

    const response = await POST(request({ promoCodeIds: ['a', 'b'], idempotencyKey }))

    expect(response.status).toBe(200)
    expect(mocks.deactivate).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { promoCodeIds: ['a', 'b'] },
    { promoCodeIds: ['a', 'b'], idempotencyKey: 'nope' },
    { promoCodeIds: ['1', '2', '3', '4', '5', '6', '7'], idempotencyKey },
    { promoCodeIds: ['a', 'b'], idempotencyKey, extra: 1 },
  ])('rejects an invalid request: %j', async (body) => {
    const response = await POST(request(body))

    expect(response.status).toBe(400)
    expect(mocks.mergePromoCodes).not.toHaveBeenCalled()
  })

  it('returns merge errors with their status', async () => {
    mocks.mergePromoCodes.mockRejectedValue(
      new PromoMergeError('Этот промокод уже сильнее любого объединения', 400, 'PROMO_MERGE_NOT_ALLOWED')
    )

    const response = await POST(request({ promoCodeIds: ['a', 'f'], idempotencyKey }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'PROMO_MERGE_NOT_ALLOWED' })
  })

  it('limits the request rate', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })

    const response = await POST(request({ promoCodeIds: ['a', 'b'], idempotencyKey }))

    expect(response.status).toBe(429)
  })
})
