import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  remnashopQuery: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}))
vi.mock('./remnashop-db', () => ({
  remnashopQuery: mocks.remnashopQuery,
}))
vi.mock('./remnawave', () => ({
  remnawave: {
    getUserByUuid: vi.fn(),
    updateUser: vi.fn(),
  },
}))
vi.mock('./remnawave-local-sync', () => ({
  upsertLocalSubscriptionFromRemnawave: vi.fn(),
}))

import { attachRemnashopIdentityToCabinetUser } from './telegram-link-sync'

describe('attachRemnashopIdentityToCabinetUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://cabinet@remnashop-db/remnashop'
  })

  it('links a verified cabinet email to the existing Telegram Remnashop row', async () => {
    mocks.userFindUnique.mockResolvedValue({
      email: 'user@example.com',
      emailVerifiedAt: new Date('2026-06-25T00:00:00Z'),
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
    })
    mocks.remnashopQuery.mockResolvedValueOnce({ rows: [] })

    await attachRemnashopIdentityToCabinetUser({
      localUserId: 'telegram-user',
      telegramId: 123n,
    })

    expect(mocks.remnashopQuery).toHaveBeenCalledTimes(1)
    expect(mocks.remnashopQuery.mock.calls[0]?.[0]).toContain('FROM users u')
  })
})
