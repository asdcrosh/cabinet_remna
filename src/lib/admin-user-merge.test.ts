import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  writeAuditLog: vi.fn(),
  sourceFindUnique: vi.fn(),
  targetFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  relationUpdateMany: vi.fn(),
  relationFindMany: vi.fn(),
  relationFindUnique: vi.fn(),
  relationDelete: vi.fn(),
  relationUpdate: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}))

vi.mock('./audit-log', () => ({
  writeAuditLog: mocks.writeAuditLog,
}))

import { AdminMergeUsersError, mergeTechnicalTelegramUserIntoEmailUser } from './admin-user-merge'

const sourceUser = {
  id: 'telegram-user',
  email: 'telegram-123@pending.invalid',
  name: 'Telegram User',
  role: 'USER',
  telegramId: 123n,
  telegramUsername: 'telegram_user',
  telegramLinkedAt: new Date('2026-01-01T00:00:00.000Z'),
  remnashopUserId: 42,
  remnashopSyncedAt: new Date('2026-01-01T00:00:00.000Z'),
  remnawaveUuid: 'remna-uuid',
  remnawaveShortUuid: 'short',
  remnawaveUsername: 'remna-user',
  agreedToTermsAt: new Date('2026-01-01T00:00:00.000Z'),
  agreedToTermsVersion: '2026-01-01',
  personalDataConsentAt: new Date('2026-01-01T00:00:00.000Z'),
  personalDataConsentVersion: '2026-01-01',
  emailVerifiedAt: null,
  referredById: null,
}

const targetUser = {
  id: 'email-user',
  email: 'user@example.com',
  name: null,
  role: 'USER',
  telegramId: null,
  telegramUsername: null,
  telegramLinkedAt: null,
  remnashopUserId: null,
  remnashopSyncedAt: null,
  remnawaveUuid: null,
  remnawaveShortUuid: null,
  remnawaveUsername: null,
  agreedToTermsAt: null,
  agreedToTermsVersion: null,
  personalDataConsentAt: null,
  personalDataConsentVersion: null,
  emailVerifiedAt: new Date('2026-01-02T00:00:00.000Z'),
  referredById: null,
}

describe('admin user merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.relationUpdateMany.mockResolvedValue({ count: 1 })
    mocks.relationFindMany.mockResolvedValue([])
    mocks.relationFindUnique.mockResolvedValue(null)
    mocks.relationDelete.mockResolvedValue({})
    mocks.relationUpdate.mockResolvedValue({})
    mocks.userUpdate.mockResolvedValue({})
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(async (callback) => callback(createTx()))
  })

  it('rejects merging a user into itself before opening a transaction', async () => {
    await expect(
      mergeTechnicalTelegramUserIntoEmailUser({
        sourceUserId: 'same-user',
        targetUserId: 'same-user',
        actorId: 'admin-user',
      })
    ).rejects.toMatchObject({ status: 400 })

    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('blocks merging privileged source accounts', async () => {
    mocks.sourceFindUnique.mockResolvedValueOnce({ ...sourceUser, role: 'ADMIN' })
    mocks.targetFindUnique.mockResolvedValueOnce(targetUser)

    await expect(
      mergeTechnicalTelegramUserIntoEmailUser({
        sourceUserId: sourceUser.id,
        targetUserId: targetUser.id,
        actorId: 'admin-user',
      })
    ).rejects.toBeInstanceOf(AdminMergeUsersError)

    expect(mocks.userUpdate).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('moves source-owned records into the target and writes an audit log', async () => {
    mocks.sourceFindUnique.mockResolvedValueOnce(sourceUser)
    mocks.targetFindUnique.mockResolvedValueOnce(targetUser)

    await expect(
      mergeTechnicalTelegramUserIntoEmailUser({
        sourceUserId: sourceUser.id,
        targetUserId: targetUser.id,
        actorId: 'admin-user',
      })
    ).resolves.toMatchObject({
      sourceEmail: sourceUser.email,
      targetEmail: targetUser.email,
      transferred: expect.objectContaining({
        payments: 1,
        subscriptions: 1,
      }),
    })

    expect(mocks.relationUpdateMany).toHaveBeenCalledWith({
      where: { userId: sourceUser.id },
      data: { userId: targetUser.id },
    })
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: targetUser.id },
      data: expect.objectContaining({
        telegramId: sourceUser.telegramId,
        remnawaveUuid: sourceUser.remnawaveUuid,
      }),
    })
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: sourceUser.id },
      data: expect.objectContaining({
        email: `merged-${sourceUser.id}@pending.invalid`,
        telegramUsername: null,
      }),
    })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'admin-user',
      targetId: targetUser.id,
      action: 'ADMIN_USERS_MERGED',
    }))
  })
})

function createTx() {
  return {
    user: {
      findUnique: vi.fn()
        .mockImplementationOnce(mocks.sourceFindUnique)
        .mockImplementationOnce(mocks.targetFindUnique),
      update: mocks.userUpdate,
      updateMany: mocks.relationUpdateMany,
    },
    payment: { updateMany: mocks.relationUpdateMany },
    subscription: { updateMany: mocks.relationUpdateMany },
    supportTicket: { updateMany: mocks.relationUpdateMany },
    supportMessage: { updateMany: mocks.relationUpdateMany },
    promoCodeRedemption: { updateMany: mocks.relationUpdateMany },
    giftCertificateRedemption: { updateMany: mocks.relationUpdateMany },
    notificationLog: { updateMany: mocks.relationUpdateMany },
    bonusBoxOpening: { updateMany: mocks.relationUpdateMany },
    oAuthAccount: { updateMany: mocks.relationUpdateMany },
    referralReward: { updateMany: mocks.relationUpdateMany },
    device: {
      findMany: mocks.relationFindMany,
      update: mocks.relationUpdate,
      delete: mocks.relationDelete,
    },
    trialPlanRedemption: {
      findMany: mocks.relationFindMany,
      update: mocks.relationUpdate,
      delete: mocks.relationDelete,
    },
    welcomeBonusRedemption: {
      findUnique: mocks.relationFindUnique,
      update: mocks.relationUpdate,
      delete: mocks.relationDelete,
    },
    bonusBoxAttempt: {
      findMany: mocks.relationFindMany,
      update: mocks.relationUpdate,
      delete: mocks.relationDelete,
    },
    userNotification: {
      findMany: mocks.relationFindMany,
      update: mocks.relationUpdate,
      delete: mocks.relationDelete,
    },
    adminNotificationRead: {
      findMany: mocks.relationFindMany,
      update: mocks.relationUpdate,
      delete: mocks.relationDelete,
    },
  }
}
