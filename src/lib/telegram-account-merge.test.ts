import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
  subscriptionUpdateMany: vi.fn(),
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

import {
  mergeTechnicalTelegramAccount,
  TelegramAccountMergeError,
} from './telegram-account-merge'

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
    _count: {
      payments: 0,
      devices: 0,
      supportTickets: 0,
      supportMessages: 0,
      promoCodeRedemptions: 0,
      trialPlanRedemptions: 0,
      referrals: 0,
      referralRewardsEarned: 0,
      bonusBoxAttempts: 0,
      bonusBoxOpenings: 0,
    },
    ...overrides,
  }
}

describe('technical Telegram account merge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.REMNASHOP_DATABASE_URL
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        user: { update: mocks.userUpdate, delete: mocks.userDelete },
        subscription: { updateMany: mocks.subscriptionUpdateMany },
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

  it('does not merge a second account that owns payments', async () => {
    mocks.findUnique
      .mockResolvedValueOnce(target)
      .mockResolvedValueOnce(
        technicalSource({
          _count: {
            ...technicalSource()._count,
            payments: 1,
          },
        })
      )

    await expect(
      mergeTechnicalTelegramAccount({
        targetUserId: target.id,
        telegramId: 123n,
        telegramUsername: 'telegram_user',
        telegramName: 'Telegram User',
      })
    ).rejects.toMatchObject(
      new TelegramAccountMergeError('TELEGRAM_ALREADY_LINKED')
    )
    expect(mocks.transaction).not.toHaveBeenCalled()
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
})
