import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
  userUpdateMany: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
  relationFindMany: vi.fn().mockResolvedValue([]),
  relationFindUnique: vi.fn().mockResolvedValue(null),
  relationUpdateMany: vi.fn(),
  relationDeleteMany: vi.fn(),
  referralRewardUpdate: vi.fn(),
  referralRewardDelete: vi.fn(),
  transaction: vi.fn(),
  remnashopQuery: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
    $transaction: mocks.transaction,
  },
}))
vi.mock('./remnashop-db', () => ({
  remnashopQuery: mocks.remnashopQuery,
}))

import { mergeTechnicalTelegramAccount } from './telegram-account-merge'

const originalRemnashopDatabaseUrl = process.env.REMNASHOP_DATABASE_URL

const target = {
  id: 'email-user',
  email: 'user@example.com',
  name: 'User',
  role: 'USER',
  telegramId: null,
  telegramUsername: null,
  telegramLinkedAt: null,
  remnashopUserId: null,
  remnashopSyncedAt: null,
  remnawaveUuid: null,
  remnawaveShortUuid: null,
  remnawaveUsername: null,
  referredById: null,
  referralRewardAsReferred: null,
}

function technicalSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'telegram-user',
    email: 'telegram-123@pending.invalid',
    name: 'Telegram User',
    role: 'USER',
    emailVerifiedAt: null,
    referredById: null,
    referralRewardAsReferred: null,
    telegramId: 123n,
    telegramUsername: 'telegram_user',
    telegramLinkedAt: new Date(),
    remnashopUserId: 42,
    remnashopSyncedAt: new Date(),
    remnawaveUuid: 'remna-uuid',
    remnawaveShortUuid: 'short',
    remnawaveUsername: 'remna-user',
    ...overrides,
  }
}

describe('technical Telegram account merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.REMNASHOP_DATABASE_URL
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        user: {
          update: mocks.userUpdate,
          updateMany: mocks.userUpdateMany,
          delete: mocks.userDelete,
        },
        subscription: { updateMany: mocks.subscriptionUpdateMany },
        payment: { updateMany: mocks.relationUpdateMany },
        device: {
          findMany: mocks.relationFindMany,
          updateMany: mocks.relationUpdateMany,
          deleteMany: mocks.relationDeleteMany,
        },
        supportTicket: { updateMany: mocks.relationUpdateMany },
        supportMessage: { updateMany: mocks.relationUpdateMany },
        promoCodeRedemption: { updateMany: mocks.relationUpdateMany },
        trialPlanRedemption: {
          findMany: mocks.relationFindMany,
          updateMany: mocks.relationUpdateMany,
          deleteMany: mocks.relationDeleteMany,
        },
        referralReward: {
          update: mocks.referralRewardUpdate,
          updateMany: mocks.relationUpdateMany,
          delete: mocks.referralRewardDelete,
        },
        giftCertificateRedemption: { updateMany: mocks.relationUpdateMany },
        notificationLog: { updateMany: mocks.relationUpdateMany },
        oAuthAccount: { updateMany: mocks.relationUpdateMany },
        bonusBoxAttempt: {
          findMany: mocks.relationFindMany,
          updateMany: mocks.relationUpdateMany,
          deleteMany: mocks.relationDeleteMany,
        },
        bonusBoxOpening: { updateMany: mocks.relationUpdateMany },
        welcomeBonusRedemption: {
          findUnique: mocks.relationFindUnique,
          update: mocks.relationUpdateMany,
          delete: mocks.relationDeleteMany,
        },
        userNotification: {
          findMany: mocks.relationFindMany,
          updateMany: mocks.relationUpdateMany,
          deleteMany: mocks.relationDeleteMany,
        },
        adminNotificationRead: {
          findMany: mocks.relationFindMany,
          updateMany: mocks.relationUpdateMany,
          deleteMany: mocks.relationDeleteMany,
        },
        emailVerificationToken: { deleteMany: mocks.relationDeleteMany },
        passwordResetToken: { deleteMany: mocks.relationDeleteMany },
      })
    )
  })

  afterEach(() => {
    process.env.REMNASHOP_DATABASE_URL = originalRemnashopDatabaseUrl
  })

  it('moves the technical identity and subscriptions into the email account', async () => {
    mocks.findUnique
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(technicalSource())

    await expect(
      mergeTechnicalTelegramAccount({
        targetUserId: target.id,
        telegramId: 123n,
        telegramUsername: 'telegram_user',
        telegramName: 'Telegram User',
      })
    ).resolves.toMatchObject({ merged: true, sourceUserId: 'telegram-user' })

    expect(mocks.subscriptionUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'telegram-user' },
      data: { userId: 'email-user' },
    })
    expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: 'telegram-user' } })
  })

  it('moves activity owned by a technical Telegram account', async () => {
    mocks.findUnique
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(technicalSource())

    await expect(
      mergeTechnicalTelegramAccount({
        targetUserId: target.id,
        telegramId: 123n,
        telegramUsername: 'telegram_user',
        telegramName: 'Telegram User',
      })
    ).resolves.toMatchObject({ merged: true })
    expect(mocks.relationUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'telegram-user' },
      data: { userId: 'email-user' },
    })
  })

  it('moves a Telegram identity away from another regular user into the selected email account', async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ ...target, remnawaveUuid: null })
      .mockResolvedValueOnce(technicalSource({
        id: 'old-email-user',
        email: 'old@example.com',
        emailVerifiedAt: new Date(),
        remnawaveUuid: 'active-remna-uuid',
      }))

    await expect(
      mergeTechnicalTelegramAccount({
        targetUserId: target.id,
        telegramId: 123n,
        telegramUsername: 'telegram_user',
        telegramName: 'Telegram User',
      })
    ).resolves.toMatchObject({
      merged: true,
      sourceUserId: 'old-email-user',
      sourceWasTechnical: false,
    })

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'old-email-user' },
      data: expect.objectContaining({
        telegramId: null,
        remnawaveUuid: null,
      }),
    })
    expect(mocks.userUpdate).toHaveBeenLastCalledWith({
      where: { id: 'old-email-user' },
      data: expect.objectContaining({
        email: 'merged-old-email-user@pending.invalid',
      }),
    })
    expect(mocks.userDelete).not.toHaveBeenCalled()
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-user' },
        data: expect.objectContaining({
          telegramId: 123n,
          remnawaveUuid: 'active-remna-uuid',
        }),
      })
    )
  })

  it('moves a Telegram identity away from a privileged account without archiving that account', async () => {
    mocks.findUnique
      .mockResolvedValueOnce({ ...target, remnawaveUuid: null })
      .mockResolvedValueOnce(technicalSource({
        id: 'admin-user',
        email: 'admin@example.com',
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
        remnawaveUuid: 'admin-remna-uuid',
      }))

    await expect(
      mergeTechnicalTelegramAccount({
        targetUserId: target.id,
        telegramId: 123n,
        telegramUsername: 'telegram_user',
        telegramName: 'Telegram User',
      })
    ).resolves.toMatchObject({
      merged: true,
      sourceUserId: 'admin-user',
      sourceWasPrivileged: true,
    })

    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'admin-user' },
      data: expect.objectContaining({
        telegramId: null,
        remnawaveUuid: null,
      }),
    })
    expect(mocks.userUpdate).not.toHaveBeenCalledWith({
      where: { id: 'admin-user' },
      data: expect.objectContaining({
        email: 'merged-admin-user@pending.invalid',
      }),
    })
    expect(mocks.userDelete).not.toHaveBeenCalled()
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-user' },
        data: expect.objectContaining({
          telegramId: 123n,
          remnawaveUuid: 'admin-remna-uuid',
        }),
      })
    )
  })

  it('prefers the existing Telegram Remnashop identity over an empty email duplicate', async () => {
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://readonly@example/remnashop'
    mocks.findUnique
      .mockResolvedValueOnce({ ...target, remnashopUserId: 99 })
      .mockResolvedValueOnce(technicalSource())
    mocks.remnashopQuery.mockResolvedValue({
      rows: [
        { id: 99, current_subscription_id: null },
        { id: 42, current_subscription_id: 7 },
      ],
    })

    await mergeTechnicalTelegramAccount({
      targetUserId: target.id,
      telegramId: 123n,
      telegramUsername: 'telegram_user',
      telegramName: 'Telegram User',
    })

    expect(mocks.userUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'email-user' },
        data: expect.objectContaining({ remnashopUserId: 42 }),
      })
    )
  })

  it('keeps the email Remnashop identity when it owns the active subscription', async () => {
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://readonly@example/remnashop'
    mocks.findUnique
      .mockResolvedValueOnce({ ...target, remnashopUserId: 99 })
      .mockResolvedValueOnce(technicalSource())
    mocks.remnashopQuery.mockResolvedValue({
      rows: [
        { id: 99, current_subscription_id: 8 },
        { id: 42, current_subscription_id: null },
      ],
    })

    await mergeTechnicalTelegramAccount({
      targetUserId: target.id,
      telegramId: 123n,
      telegramUsername: 'telegram_user',
      telegramName: 'Telegram User',
    })

    expect(mocks.userUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'email-user' },
        data: expect.objectContaining({ remnashopUserId: 99 }),
      })
    )
  })
})
