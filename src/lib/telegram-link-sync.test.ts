import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  remnashopQuery: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  upsertSubscription: vi.fn(),
  syncDevices: vi.fn(),
  withDistributedLock: vi.fn(),
  markSyncPending: vi.fn(),
  markSyncSkipped: vi.fn(),
  markSyncSucceeded: vi.fn(),
  markSyncFailed: vi.fn(),
  createAdminNotification: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}))
vi.mock('./remnashop-db', () => ({ remnashopQuery: mocks.remnashopQuery }))
vi.mock('./remnawave', () => ({
  remnawave: {
    getUser: mocks.getUser,
    updateUser: mocks.updateUser,
  },
  hasRemnawaveUserReference: (user: any) => Boolean(
    user.remnawaveId || user.remnawaveUuid || user.remnawaveUsername
  ),
}))
vi.mock('./remnawave-local-sync', () => ({
  upsertLocalSubscriptionFromRemnawave: mocks.upsertSubscription,
}))
vi.mock('./remnawave-device-sync', () => ({
  syncLocalDevicesFromRemnawave: mocks.syncDevices,
}))
vi.mock('./distributed-lock', () => ({
  withDistributedLock: mocks.withDistributedLock,
}))
vi.mock('./sync-events', () => ({
  markSyncPending: mocks.markSyncPending,
  markSyncSkipped: mocks.markSyncSkipped,
  markSyncSucceeded: mocks.markSyncSucceeded,
  markSyncFailed: mocks.markSyncFailed,
}))
vi.mock('./admin-notifications', () => ({
  createAdminNotification: mocks.createAdminNotification,
}))

import {
  attachRemnashopIdentityToCabinetUser,
  syncLinkedTelegramUser,
} from './telegram-link-sync'

const telegramId = 123456789n
const remnawaveUuid = '11111111-1111-4111-8111-111111111111'
const originalDatabaseUrl = process.env.REMNASHOP_DATABASE_URL

describe('attachRemnashopIdentityToCabinetUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://cabinet@remnashop-db/remnashop'
  })

  it('links a verified cabinet email to the existing Telegram Remnashop row', async () => {
    mocks.userFindUnique.mockResolvedValue({
      email: 'user@example.com',
      emailVerifiedAt: new Date('2026-06-25T00:00:00Z'),
      remnashopUserId: null,
    })
    mocks.remnashopQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 42, merged_duplicate: true }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 42,
          telegram_id: '123',
          name: 'User',
          current_subscription_id: 7,
          user_remna_id: 'remna-uuid',
        }],
      })

    await expect(attachRemnashopIdentityToCabinetUser({
      localUserId: 'cabinet-user',
      telegramId: 123n,
    })).resolves.toMatchObject({
      id: 42,
      user_remna_id: 'remna-uuid',
    })

    expect(mocks.remnashopQuery).toHaveBeenNthCalledWith(
      1,
      'SELECT * FROM public.cabinet_link_email_to_telegram($1::bigint, $2::text, $3::boolean)',
      ['123', 'user@example.com', true]
    )
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'cabinet-user' },
      data: {
        remnashopUserId: 42,
        remnashopSyncedAt: expect.any(Date),
        remnawaveUuid: 'remna-uuid',
      },
    })
  })

  it('does not copy a pending technical email into Remnashop', async () => {
    mocks.userFindUnique.mockResolvedValue({
      email: 'telegram-123@pending.invalid',
      emailVerifiedAt: null,
      remnashopUserId: null,
    })
    mocks.remnashopQuery.mockResolvedValueOnce({ rows: [] })

    await attachRemnashopIdentityToCabinetUser({
      localUserId: 'telegram-user',
      telegramId: 123n,
    })

    expect(mocks.remnashopQuery).toHaveBeenCalledTimes(1)
    expect(mocks.remnashopQuery.mock.calls[0]?.[0]).toContain('FROM users u')
  })

  it('does not replace a different Remnashop identity without the merge function', async () => {
    mocks.userFindUnique.mockResolvedValue({
      email: 'user@example.com',
      emailVerifiedAt: new Date('2026-06-25T00:00:00Z'),
      remnashopUserId: 99,
    })
    mocks.remnashopQuery
      .mockRejectedValueOnce(Object.assign(new Error('function not found'), { code: '42883' }))
      .mockResolvedValueOnce({
        rows: [{
          id: 42,
          telegram_id: '123',
          name: 'User',
          current_subscription_id: null,
          user_remna_id: null,
        }],
      })

    await expect(attachRemnashopIdentityToCabinetUser({
      localUserId: 'cabinet-user',
      telegramId: 123n,
    })).rejects.toThrow('Remnashop identity conflict')

    expect(mocks.userUpdate).not.toHaveBeenCalled()
  })
})

describe('syncLinkedTelegramUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop@db/remnashop'
    mocks.userFindUnique
      .mockResolvedValueOnce({ remnawaveUuid })
      .mockResolvedValueOnce({
        email: 'user@example.com',
        emailVerifiedAt: new Date(),
        remnashopUserId: 42,
      })
    mocks.userUpdate.mockResolvedValue({})
    mocks.createAdminNotification.mockResolvedValue({})
    mocks.remnashopQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 42,
          telegram_id: telegramId.toString(),
          email: 'user@example.com',
          is_email_verified: true,
          name: 'User',
          current_subscription_id: 7,
          user_remna_id: remnawaveUuid,
        }],
      })
    mocks.syncDevices.mockResolvedValue({ total: 2 })
    mocks.upsertSubscription.mockResolvedValue({ id: 'subscription-1' })
    mocks.withDistributedLock.mockImplementation(async (
      _key: string,
      task: () => Promise<unknown>
    ) => ({
      acquired: true,
      value: await task(),
    }))
  })

  it('updates the same Remnawave profile only once', async () => {
    mocks.getUser.mockResolvedValue({
      response: { uuid: remnawaveUuid, telegramId: null },
    })
    mocks.updateUser.mockResolvedValue({
      response: { uuid: remnawaveUuid, telegramId: Number(telegramId) },
    })

    await syncLinkedTelegramUser({
      localUserId: 'cabinet-user-1',
      telegramId,
    })

    expect(mocks.updateUser).toHaveBeenCalledOnce()
    expect(mocks.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: remnawaveUuid }),
      {
        telegramId: Number(telegramId),
        tag: 'IMPORTED',
      }
    )
    expect(mocks.getUser).toHaveBeenCalledOnce()
    expect(mocks.syncDevices).toHaveBeenCalledOnce()
    expect(mocks.markSyncSucceeded).toHaveBeenCalledOnce()
  })

  it('does not modify Remnawave when a string Telegram ID already matches', async () => {
    mocks.getUser.mockResolvedValue({
      response: { uuid: remnawaveUuid, telegramId: telegramId.toString() },
    })

    await syncLinkedTelegramUser({
      localUserId: 'cabinet-user-1',
      telegramId,
    })

    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('does not start a second concurrent synchronization', async () => {
    mocks.withDistributedLock.mockResolvedValue({ acquired: false })

    await expect(syncLinkedTelegramUser({
      localUserId: 'cabinet-user-1',
      telegramId,
    })).resolves.toEqual({
      foundRemnashopUser: null,
      syncedRemnawave: false,
      devicesSynced: 0,
      warnings: [],
      alreadyRunning: true,
    })
    expect(mocks.userFindUnique).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('skips a Remnashop account without a subscription or Remnawave profile', async () => {
    mocks.userFindUnique.mockReset()
      .mockResolvedValueOnce({
        remnawaveId: null,
        remnawaveUuid: null,
        remnawaveUsername: null,
      })
      .mockResolvedValueOnce({
        email: 'user@example.com',
        emailVerifiedAt: new Date(),
        remnashopUserId: 42,
      })
    mocks.remnashopQuery.mockReset()
      .mockResolvedValueOnce({ rows: [{ user_id: 42, merged_duplicate: false }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 42,
          telegram_id: telegramId.toString(),
          email: 'user@example.com',
          is_email_verified: true,
          name: 'User',
          current_subscription_id: null,
          user_remna_id: null,
        }],
      })

    const result = await syncLinkedTelegramUser({
      localUserId: 'cabinet-user-1',
      telegramId,
    })

    expect('skipped' in result ? result.skipped : null).toContain('нет подписки')
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.markSyncSkipped).toHaveBeenCalledOnce()
    expect(mocks.markSyncFailed).not.toHaveBeenCalled()
    expect(mocks.createAdminNotification).not.toHaveBeenCalled()
  })

  it('keeps a missing Remnawave profile as an error when a subscription exists', async () => {
    mocks.userFindUnique.mockReset()
      .mockResolvedValueOnce({
        remnawaveId: null,
        remnawaveUuid: null,
        remnawaveUsername: null,
      })
      .mockResolvedValueOnce({
        email: 'user@example.com',
        emailVerifiedAt: new Date(),
        remnashopUserId: 42,
      })
    mocks.remnashopQuery.mockReset()
      .mockResolvedValueOnce({ rows: [{ user_id: 42, merged_duplicate: false }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 42,
          telegram_id: telegramId.toString(),
          email: 'user@example.com',
          is_email_verified: true,
          name: 'User',
          current_subscription_id: 7,
          user_remna_id: null,
        }],
      })

    const result = await syncLinkedTelegramUser({
      localUserId: 'cabinet-user-1',
      telegramId,
    })

    expect(result.warnings).toContain('Пользователь найден в Remnashop, но у него нет связанного профиля Remnawave.')
    expect(mocks.markSyncFailed).toHaveBeenCalledOnce()
    expect(mocks.markSyncSkipped).not.toHaveBeenCalled()
    expect(mocks.createAdminNotification).toHaveBeenCalledOnce()
  })
})

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.REMNASHOP_DATABASE_URL
  else process.env.REMNASHOP_DATABASE_URL = originalDatabaseUrl
})
