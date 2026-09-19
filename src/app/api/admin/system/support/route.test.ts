import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getSupportSettings: vi.fn(),
  updateSupportSettings: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireAdmin: mocks.requireAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/support-settings', () => ({
  getSupportSettings: mocks.getSupportSettings,
  updateSupportSettings: mocks.updateSupportSettings,
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { GET, PATCH } from './route'

const settings = {
  slaWarningMinutes: 60,
  slaBreachMinutes: 240,
  quickReplies: ['Проверяю.', 'Готово.'],
}

describe('admin support settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdmin.mockResolvedValue({ uid: 'admin-1' })
    mocks.getSupportSettings.mockResolvedValue(settings)
    mocks.updateSupportSettings.mockResolvedValue(settings)
  })

  it('returns current settings', async () => {
    const response = await GET()
    await expect(response.json()).resolves.toEqual({ settings })
  })

  it('saves settings and audits the change', async () => {
    const request = new Request('https://cabinet.example/api/admin/system/support', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    const response = await PATCH(request)

    expect(response.status).toBe(200)
    expect(mocks.updateSupportSettings).toHaveBeenCalledWith(settings)
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      action: 'ADMIN_SUPPORT_UPDATED',
      metadata: { type: 'support_settings', ...settings },
    }))
  })

  it('rejects a breach threshold before the warning threshold', async () => {
    const request = new Request('https://cabinet.example/api/admin/system/support', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, slaBreachMinutes: 30 }),
    })
    const response = await PATCH(request)

    expect(response.status).toBe(422)
    expect(mocks.updateSupportSettings).not.toHaveBeenCalled()
  })
})
