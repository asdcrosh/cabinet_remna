import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
}))

vi.mock('./prisma', () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
    },
  },
}))

import { resolveTelegramIdentity } from './identity-resolver'

const technicalTelegramUser = {
  id: 'telegram-user',
  email: 'telegram-123@pending.invalid',
  emailVerifiedAt: null,
  telegramId: 123n,
  remnashopUserId: null,
}

const emailUser = {
  id: 'email-user',
  email: 'user@example.com',
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  telegramId: null,
  remnashopUserId: null,
}

describe('resolveTelegramIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUnique.mockResolvedValue(null)
    mocks.findFirst.mockResolvedValue(null)
  })

  it('does not merge a technical Telegram user into an email account from Remnashop email alone', async () => {
    mocks.findUnique
      .mockResolvedValueOnce(technicalTelegramUser)
      .mockResolvedValueOnce(emailUser)

    const result = await resolveTelegramIdentity({
      telegramId: 123n,
      remnashopUserId: 42,
      remnashopEmail: 'user@example.com',
    })

    expect(result).toEqual({ action: 'use_existing', user: technicalTelegramUser })
  })

  it('merges a technical Telegram user when the email owner is already linked to the same Remnashop id', async () => {
    const linkedEmailUser = { ...emailUser, remnashopUserId: 42 }
    mocks.findUnique
      .mockResolvedValueOnce(technicalTelegramUser)
      .mockResolvedValueOnce(linkedEmailUser)

    const result = await resolveTelegramIdentity({
      telegramId: 123n,
      remnashopUserId: 42,
      remnashopEmail: 'user@example.com',
    })

    expect(result).toEqual({
      action: 'merge_technical_into_email',
      source: technicalTelegramUser,
      target: linkedEmailUser,
    })
  })

  it('does not log into an existing local account by Remnashop email only', async () => {
    mocks.findUnique.mockResolvedValueOnce(null)

    const result = await resolveTelegramIdentity({
      telegramId: 123n,
      remnashopUserId: null,
      remnashopEmail: 'user@example.com',
    })

    expect(result).toEqual({ action: 'create_new' })
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })
})
