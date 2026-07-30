import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bcryptHash: vi.fn(),
  syncRemnashop: vi.fn(),
  createAdminNotification: vi.fn(),
  passwordResetToken: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  transaction: vi.fn(),
}))

vi.mock('bcryptjs', () => ({ default: { hash: mocks.bcryptHash } }))
vi.mock('./prisma', () => ({
  prisma: {
    passwordResetToken: mocks.passwordResetToken,
    user: mocks.user,
    $transaction: mocks.transaction,
  },
}))
vi.mock('./admin-notifications', () => ({
  createAdminNotification: mocks.createAdminNotification,
}))
vi.mock('./remnashop-password-sync', () => ({
  syncResetPasswordToRemnashop: mocks.syncRemnashop,
}))
vi.mock('./logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

import { resetPasswordByToken } from './password-reset'

describe('password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.bcryptHash.mockResolvedValue('local-password-hash')
    mocks.transaction.mockResolvedValue([])
    mocks.passwordResetToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        email: 'user@example.com',
        remnashopUserId: 42,
      },
    })
    mocks.syncRemnashop.mockResolvedValue({ ok: true, sessionsRevoked: true })
  })

  it('updates both Cabinet and the linked Remnashop password', async () => {
    await expect(resetPasswordByToken({
      token: 'reset-token',
      password: 'Password2',
    })).resolves.toEqual({ ok: true, remnashopSync: 'synced' })

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.syncRemnashop).toHaveBeenCalledWith({
      remnashopUserId: 42,
      email: 'user@example.com',
      password: 'Password2',
    })
    expect(mocks.createAdminNotification).not.toHaveBeenCalled()
  })

  it('keeps the Cabinet reset valid and warns the administrator when remote sync is unavailable', async () => {
    mocks.syncRemnashop.mockResolvedValue({
      ok: false,
      reason: 'redis_not_configured',
    })

    await expect(resetPasswordByToken({
      token: 'reset-token',
      password: 'Password2',
    })).resolves.toEqual({ ok: true, remnashopSync: 'failed' })
    expect(mocks.createAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'remnashop_sync_error',
        severity: 'WARNING',
        entityId: 'user-1',
        actionHref: '/dashboard/admin/remnashop-sync',
      })
    )
  })
})
