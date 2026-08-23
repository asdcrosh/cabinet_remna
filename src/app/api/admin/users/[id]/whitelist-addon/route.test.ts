import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  grantWhitelistAddonManually: vi.fn(),
  revokeWhitelistAddonManually: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/whitelist-addon', () => ({
  WhitelistAddonManagementError: class WhitelistAddonManagementError extends Error {},
  grantWhitelistAddonManually: mocks.grantWhitelistAddonManually,
  revokeWhitelistAddonManually: mocks.revokeWhitelistAddonManually,
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))

import { DELETE, PUT } from './route'

const context = { params: Promise.resolve({ id: 'user-1' }) }

describe('manual whitelist add-on admin route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSuperAdmin.mockResolvedValue({ uid: 'super-admin-1' })
    mocks.grantWhitelistAddonManually.mockResolvedValue({
      subscription: {
        id: 'subscription-1',
        whitelistAddonExpireAt: new Date('2026-10-01T20:59:59.999Z'),
      },
    })
    mocks.revokeWhitelistAddonManually.mockResolvedValue({ revoked: true })
  })

  it('grants access through the super admin service and records the date', async () => {
    const request = new Request('https://cabinet.example/api/admin/users/user-1/whitelist-addon', {
      method: 'PUT',
      body: JSON.stringify({ expiresOn: '2026-10-01' }),
    })

    const response = await PUT(request, context)

    expect(response.status).toBe(200)
    expect(mocks.grantWhitelistAddonManually).toHaveBeenCalledWith({
      userId: 'user-1',
      expireAt: new Date('2026-10-01T20:59:59.999Z'),
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'super-admin-1',
      targetId: 'user-1',
      message: 'Главный администратор вручную выдал доступ к БС',
    }))
  })

  it('revokes manually managed access', async () => {
    const request = new Request('https://cabinet.example/api/admin/users/user-1/whitelist-addon', {
      method: 'DELETE',
    })

    const response = await DELETE(request, context)

    expect(response.status).toBe(200)
    expect(mocks.revokeWhitelistAddonManually).toHaveBeenCalledWith('user-1')
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'super-admin-1',
      targetId: 'user-1',
      message: 'Главный администратор вручную снял доступ к БС',
    }))
  })
})
