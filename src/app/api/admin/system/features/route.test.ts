import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getFeatureFlags: vi.fn(),
  updateFeatureFlags: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/feature-flags', () => ({
  getFeatureFlags: mocks.getFeatureFlags,
  updateFeatureFlags: mocks.updateFeatureFlags,
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { GET, PATCH } from './route'

const features = {
  referrals: true,
  bonusBox: false,
  support: true,
  broadcasts: false,
}

describe('admin feature settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1' })
    mocks.getFeatureFlags.mockResolvedValue(features)
    mocks.updateFeatureFlags.mockResolvedValue(features)
  })

  it('returns current settings', async () => {
    const response = await GET()
    await expect(response.json()).resolves.toEqual({ features })
  })

  it('saves exact settings and writes an audit record', async () => {
    const request = new Request('https://cabinet.example/api/admin/system/features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features),
    })
    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(mocks.updateFeatureFlags).toHaveBeenCalledWith(features)
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      action: 'ADMIN_FEATURES_UPDATED',
      metadata: features,
    }))
  })

  it('rejects incomplete settings', async () => {
    const request = new Request('https://cabinet.example/api/admin/system/features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ support: true }),
    })
    const response = await PATCH(request)

    expect(response.status).toBe(422)
    expect(mocks.updateFeatureFlags).not.toHaveBeenCalled()
  })
})
