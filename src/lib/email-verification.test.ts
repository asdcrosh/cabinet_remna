import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const prisma = {
    emailVerificationToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops) => ops),
  }

  return { prisma }
})

vi.mock('./prisma', () => ({ prisma: mocks.prisma }))

import {
  createEmailVerificationToken,
  hashEmailVerificationToken,
  sendEmailVerificationLink,
  verifyEmailToken,
} from './email-verification'

describe('email verification helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.APP_URL
    delete process.env.EMAIL_VERIFICATION_WEBHOOK_URL
    delete process.env.EMAIL_VERIFICATION_WEBHOOK_SECRET
    vi.unstubAllGlobals()
  })

  it('creates a token and invalidates previous unused tokens', async () => {
    const token = await createEmailVerificationToken('user-1')

    expect(token.length).toBeGreaterThan(20)
    expect(mocks.prisma.emailVerificationToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
      data: { usedAt: new Date('2026-01-01T00:00:00.000Z') },
    })
    expect(mocks.prisma.emailVerificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        tokenHash: hashEmailVerificationToken(token),
        expiresAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
    })
  })

  it('verifies a valid token and marks it used', async () => {
    const token = 'token-1'
    mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'evt-1',
      userId: 'user-1',
      tokenHash: hashEmailVerificationToken(token),
      expiresAt: new Date('2026-01-01T01:00:00.000Z'),
      usedAt: null,
      user: {
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: null,
      },
    })

    const result = await verifyEmailToken(token)

    expect(result).toEqual({ ok: true, email: 'user@example.com' })
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z') },
    })
    expect(mocks.prisma.emailVerificationToken.update).toHaveBeenCalledWith({
      where: { id: 'evt-1' },
      data: { usedAt: new Date('2026-01-01T00:00:00.000Z') },
    })
  })

  it('rejects expired tokens', async () => {
    mocks.prisma.emailVerificationToken.findUnique.mockResolvedValue({
      expiresAt: new Date('2025-12-31T23:59:00.000Z'),
      usedAt: null,
    })

    await expect(verifyEmailToken('expired')).resolves.toEqual({ ok: false })
    expect(mocks.prisma.user.update).not.toHaveBeenCalled()
  })

  it('returns not_configured when delivery webhook is absent', async () => {
    process.env.APP_URL = 'http://localhost:3000'

    await expect(
      sendEmailVerificationLink({
        email: 'user@example.com',
        token: 'token-1',
      })
    ).resolves.toEqual({ sent: false, reason: 'not_configured' })
  })

  it('posts verification email to configured webhook', async () => {
    process.env.APP_URL = 'http://localhost:3000'
    process.env.EMAIL_VERIFICATION_WEBHOOK_URL = 'https://mail.example.test/send'
    process.env.EMAIL_VERIFICATION_WEBHOOK_SECRET = 'secret-1'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      sendEmailVerificationLink({
        email: 'user@example.com',
        name: 'User',
        token: 'token-1',
      })
    ).resolves.toEqual({ sent: true })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mail.example.test/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-1' }),
        body: expect.stringContaining('http://localhost:3000/api/auth/verify-email?token=token-1'),
      })
    )
  })
})
