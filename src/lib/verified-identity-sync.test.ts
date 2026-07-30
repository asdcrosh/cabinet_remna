import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  findRemnashopUserByEmail: vi.fn(),
  syncLinkedTelegramUser: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}))
vi.mock('./remnashop-users', () => ({
  findRemnashopUserByEmail: mocks.findRemnashopUserByEmail,
}))
vi.mock('./telegram-link-sync', () => ({
  syncLinkedTelegramUser: mocks.syncLinkedTelegramUser,
}))

import { syncVerifiedIdentity } from './verified-identity-sync'

describe('syncVerifiedIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://cabinet@remnashop/remnashop'
  })

  it('links a verified Telegram identity through the safe merge function', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      emailVerifiedAt: new Date(),
      telegramId: 123n,
    })
    mocks.syncLinkedTelegramUser.mockResolvedValue({
      alreadyRunning: false,
      foundRemnashopUser: true,
      remnashopUserId: 42,
    })

    await expect(syncVerifiedIdentity('user-1')).resolves.toEqual({
      ok: true,
      reason: null,
      remnashopUserId: 42,
    })
    expect(mocks.syncLinkedTelegramUser).toHaveBeenCalledWith({
      localUserId: 'user-1',
      telegramId: 123n,
    })
  })

  it('links a verified email-only account by email', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      emailVerifiedAt: new Date(),
      telegramId: null,
    })
    mocks.findRemnashopUserByEmail.mockResolvedValue({ id: 42 })

    await expect(syncVerifiedIdentity('user-1')).resolves.toEqual({
      ok: true,
      reason: null,
      remnashopUserId: 42,
    })
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        remnashopUserId: 42,
        remnashopSyncedAt: expect.any(Date),
      },
    })
  })

  it('never links an unverified email', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      emailVerifiedAt: null,
      telegramId: 123n,
    })

    await expect(syncVerifiedIdentity('user-1')).resolves.toEqual({
      ok: false,
      reason: 'email_not_verified',
    })
    expect(mocks.syncLinkedTelegramUser).not.toHaveBeenCalled()
  })
})
