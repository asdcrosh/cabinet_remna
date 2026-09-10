import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bcryptHash: vi.fn(),
  syncRemnashop: vi.fn(),
  createAdminNotification: vi.fn(),
  writeAuditLog: vi.fn(),
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
vi.mock('./audit-log', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('./remnashop-password-sync', () => ({
  syncResetPasswordToRemnashop: mocks.syncRemnashop,
}))
vi.mock('./logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}))

import {
  createPasswordResetToken,
  resetPasswordByToken,
  sendPasswordResetLink,
} from './password-reset'

describe('password reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.bcryptHash.mockResolvedValue('local-password-hash')
    mocks.transaction.mockImplementation(async (operation) => {
      if (typeof operation !== 'function') return operation
      return operation({
        passwordResetToken: mocks.passwordResetToken,
        user: mocks.user,
      })
    })
    mocks.passwordResetToken.updateMany.mockResolvedValue({ count: 1 })
    mocks.passwordResetToken.create.mockResolvedValue({ id: 'token-new' })
    mocks.user.update.mockResolvedValue({ id: 'user-1' })
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

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('updates both Cabinet and the linked Remnashop password', async () => {
    await expect(resetPasswordByToken({
      token: 'reset-token',
      password: 'Password2',
    })).resolves.toEqual({ ok: true, remnashopSync: 'synced' })

    expect(mocks.transaction).toHaveBeenCalledOnce()
    expect(mocks.passwordResetToken.updateMany).toHaveBeenCalledTimes(2)
    expect(mocks.passwordResetToken.updateMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    })
    expect(mocks.syncRemnashop).toHaveBeenCalledWith({
      remnashopUserId: 42,
      email: 'user@example.com',
      password: 'Password2',
    })
    expect(mocks.createAdminNotification).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith({
      actorId: 'user-1',
      targetId: 'user-1',
      action: 'USER_PASSWORD_CHANGED',
      message: 'Пользователь восстановил пароль по ссылке',
    })
  })

  it('keeps earlier reset links valid until a password is actually changed', async () => {
    await expect(createPasswordResetToken('user-1')).resolves.toEqual(expect.any(String))

    expect(mocks.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      },
    })
    expect(mocks.passwordResetToken.updateMany).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects a token claimed by another concurrent request', async () => {
    mocks.passwordResetToken.updateMany.mockResolvedValue({ count: 0 })

    await expect(resetPasswordByToken({
      token: 'reset-token',
      password: 'Password2',
    })).resolves.toEqual({ ok: false })

    expect(mocks.user.update).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.syncRemnashop).not.toHaveBeenCalled()
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

  it('keeps a completed reset successful when audit logging is unavailable', async () => {
    mocks.writeAuditLog.mockRejectedValue(new Error('audit unavailable'))

    await expect(resetPasswordByToken({
      token: 'reset-token',
      password: 'Password2',
    })).resolves.toEqual({ ok: true, remnashopSync: 'synced' })

    expect(mocks.user.update).toHaveBeenCalledOnce()
    expect(mocks.syncRemnashop).toHaveBeenCalledOnce()
  })

  it('does not expose a delivery outage and alerts administrators in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_URL', 'https://cabinet.example')
    vi.stubEnv('EMAIL_VERIFICATION_WEBHOOK_URL', 'https://mailer.example/reset')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('mailer unavailable')))

    await expect(sendPasswordResetLink({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'User',
      token: 'reset-token',
    })).resolves.toEqual({ sent: false, reason: 'failed' })

    expect(mocks.createAdminNotification).toHaveBeenCalledWith(expect.objectContaining({
      type: 'password_reset_delivery_error',
      severity: 'ERROR',
      entityId: 'user-1',
      actionHref: '/dashboard/admin/recovery',
    }))
  })
})
