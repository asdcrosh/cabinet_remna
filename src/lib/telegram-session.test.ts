import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}))

import { findCanonicalTelegramSessionUser } from './telegram-session'

describe('findCanonicalTelegramSessionUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefers the current owner of the Telegram identity after an account merge', async () => {
    const canonical = {
      id: 'email-user',
      email: 'user@example.com',
      role: 'USER',
      emailVerifiedAt: new Date(),
      telegramId: 123n,
    }
    mocks.userFindUnique.mockResolvedValueOnce(canonical)

    await expect(
      findCanonicalTelegramSessionUser({
        telegramId: 123n,
        fallbackUserId: 'deleted-telegram-user',
      })
    ).resolves.toBe(canonical)

    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1)
    expect(mocks.userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { telegramId: 123n } })
    )
  })

  it('uses the original user only when the Telegram identity was not reassigned', async () => {
    const fallback = {
      id: 'telegram-user',
      email: 'telegram-123@pending.invalid',
      role: 'USER',
      emailVerifiedAt: null,
      telegramId: null,
    }
    mocks.userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(fallback)

    await expect(
      findCanonicalTelegramSessionUser({
        telegramId: 123n,
        fallbackUserId: 'telegram-user',
      })
    ).resolves.toBe(fallback)

    expect(mocks.userFindUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { id: 'telegram-user' } })
    )
  })
})
