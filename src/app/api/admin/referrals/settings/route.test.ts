import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getReferralSettings: vi.fn(),
  updateReferralSettings: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/referral-settings', () => ({
  getReferralSettings: mocks.getReferralSettings,
  updateReferralSettings: mocks.updateReferralSettings,
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { GET, PATCH } from './route'

const settings = {
  trigger: 'FIRST_PAYMENT',
  minimumPaymentKopecks: 30_000,
  maxRewardsPerReferrer: 20,
  referrerBonusDays: 7,
  referredBonusDays: 3,
  referrerAttempts: 2,
  referredAttempts: 1,
  promotionEndsAt: null,
} as const

describe('admin referral settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1' })
    mocks.getReferralSettings.mockResolvedValue(settings)
    mocks.updateReferralSettings.mockResolvedValue(settings)
  })

  it('returns current conditions', async () => {
    const response = await GET()
    await expect(response.json()).resolves.toEqual({ settings })
  })

  it('saves rewards for both participants and writes audit', async () => {
    const request = referralSettingsRequest(settings)
    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(mocks.updateReferralSettings).toHaveBeenCalledWith(settings)
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      action: 'ADMIN_REFERRAL_SETTINGS_UPDATED',
    }))
  })

  it('clears the payment threshold for registration trigger', async () => {
    const request = referralSettingsRequest({
      ...settings,
      trigger: 'REGISTRATION',
    })
    await PATCH(request)

    expect(mocks.updateReferralSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: 'REGISTRATION',
        minimumPaymentKopecks: 0,
      })
    )
  })

  it('saves the promotion end date', async () => {
    const promotionEndsAt = '2026-08-31T20:59:59.999Z'
    await PATCH(referralSettingsRequest({ ...settings, promotionEndsAt }))

    expect(mocks.updateReferralSettings).toHaveBeenCalledWith(
      expect.objectContaining({ promotionEndsAt })
    )
  })

  it('rejects conditions without any reward', async () => {
    const response = await PATCH(referralSettingsRequest({
      ...settings,
      referrerBonusDays: 0,
      referredBonusDays: 0,
      referrerAttempts: 0,
      referredAttempts: 0,
    }))

    expect(response.status).toBe(422)
    expect(mocks.updateReferralSettings).not.toHaveBeenCalled()
  })
})

function referralSettingsRequest(body: unknown) {
  return new Request('https://cabinet.example/api/admin/referrals/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
