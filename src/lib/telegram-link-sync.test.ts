import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  remnashopQuery: vi.fn(),
  getUserByUuid: vi.fn(),
  updateUser: vi.fn(),
  upsertSubscription: vi.fn(),
  syncDevices: vi.fn(),
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
    getUserByUuid: mocks.getUserByUuid,
    updateUser: mocks.updateUser,
  },
}))
vi.mock('./remnawave-local-sync', () => ({
  upsertLocalSubscriptionFromRemnawave: mocks.upsertSubscription,
}))
vi.mock('./remnawave-device-sync', () => ({
  syncLocalDevicesFromRemnawave: mocks.syncDevices,
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
  })

  it('updates the same Remnawave profile only once', async () => {
    mocks.getUserByUuid
      .mockResolvedValueOnce({
        response: { uuid: remnawaveUuid, telegramId: null },
      })
      .mockResolvedValueOnce({
        response: { uuid: remnawaveUuid, telegramId: Number(telegramId) },
      })
    mocks.updateUser.mockResolvedValue({
      response: { uuid: remnawaveUuid, telegramId: Number(telegramId) },
    })

    await syncLinkedTelegramUser({
      localUserId: 'cabinet-user-1',
      telegramId,
    })

    expect(mocks.updateUser).toHaveBeenCalledOnce()
    expect(mocks.updateUser).toHaveBeenCalledWith({
      uuid: remnawaveUuid,
      telegramId: Number(telegramId),
      tag: 'IMPORTED',
    })
  })

  it('does not modify Remnawave when Telegram ID already matches', async () => {
    mocks.getUserByUuid.mockResolvedValue({
      response: { uuid: remnawaveUuid, telegramId: Number(telegramId) },
    })

    await syncLinkedTelegramUser({
      localUserId: 'cabinet-user-1',
      telegramId,
    })

    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
})

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.REMNASHOP_DATABASE_URL
  else process.env.REMNASHOP_DATABASE_URL = originalDatabaseUrl
})
