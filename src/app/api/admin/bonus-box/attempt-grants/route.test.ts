import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  grantManualBonusBoxAttemptsBulk: vi.fn(),
  notifyBonusGrantedInAppBulk: vi.fn(),
  writeAuditLog: vi.fn(),
  userFindMany: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  requireSuperAdmin: mocks.requireSuperAdmin,
  withAuth: (handler: (...args: any[]) => Promise<Response>) => handler,
}))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/bonus-box', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/bonus-box')>()
  return {
    BonusBoxError: original.BonusBoxError,
    grantManualBonusBoxAttemptsBulk: mocks.grantManualBonusBoxAttemptsBulk,
  }
})
vi.mock('@/lib/notifications', () => ({
  notifyBonusGrantedInAppBulk: mocks.notifyBonusGrantedInAppBulk,
}))
vi.mock('@/lib/audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
  },
}))

import { POST } from './route'

describe('bonus attempt grants route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSuperAdmin.mockResolvedValue({ uid: 'admin-1' })
    mocks.notifyBonusGrantedInAppBulk.mockResolvedValue(undefined)
    mocks.grantManualBonusBoxAttemptsBulk.mockResolvedValue({
      recipientsCount: 2,
      recipientsGranted: 2,
      attemptsGranted: 6,
      attemptsPerUser: 3,
      grantedUserIds: ['user-1', 'user-2'],
      alreadyProcessed: false,
    })
  })

  it('grants selected users, notifies them in-app and writes one audit record', async () => {
    const request = new Request('https://cabinet.example/api/admin/bonus-box/attempt-grants', {
      method: 'POST',
      body: JSON.stringify({
        audience: 'SELECTED',
        userIds: ['user-1', 'user-2'],
        attemptsCount: 3,
        operationId: '11111111-1111-4111-8111-111111111111',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      recipientsGranted: 2,
      attemptsGranted: 6,
    })
    expect(mocks.grantManualBonusBoxAttemptsBulk).toHaveBeenCalledWith({
      audience: 'SELECTED',
      userIds: ['user-1', 'user-2'],
      adminId: 'admin-1',
      attemptsCount: 3,
      operationId: '11111111-1111-4111-8111-111111111111',
    })
    expect(mocks.notifyBonusGrantedInAppBulk).toHaveBeenCalledWith({
      userIds: ['user-1', 'user-2'],
      attemptsCount: 3,
      operationId: '11111111-1111-4111-8111-111111111111',
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-1',
      action: 'ADMIN_BONUS_ATTEMPTS_GRANTED',
    }))
  })

  it('rejects an empty selected audience', async () => {
    const request = new Request('https://cabinet.example/api/admin/bonus-box/attempt-grants', {
      method: 'POST',
      body: JSON.stringify({
        audience: 'SELECTED',
        userIds: [],
        attemptsCount: 3,
        operationId: '11111111-1111-4111-8111-111111111111',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mocks.grantManualBonusBoxAttemptsBulk).not.toHaveBeenCalled()
  })

  it('keeps a successful grant successful when the in-app notification fails', async () => {
    mocks.notifyBonusGrantedInAppBulk.mockRejectedValueOnce(new Error('notification unavailable'))
    const request = new Request('https://cabinet.example/api/admin/bonus-box/attempt-grants', {
      method: 'POST',
      body: JSON.stringify({
        audience: 'ALL',
        userIds: [],
        attemptsCount: 3,
        operationId: '11111111-1111-4111-8111-111111111111',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mocks.writeAuditLog).toHaveBeenCalled()
  })
})
