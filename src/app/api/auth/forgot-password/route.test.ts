import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  createPasswordResetToken: vi.fn(),
  sendPasswordResetLink: vi.fn(),
  logError: vi.fn(),
  userFindUnique: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}))
vi.mock('@/lib/password-reset', () => ({
  createPasswordResetToken: mocks.createPasswordResetToken,
  sendPasswordResetLink: mocks.sendPasswordResetLink,
}))
vi.mock('@/lib/logger', () => ({ logError: mocks.logError }))

import { POST } from './route'

function forgotPasswordRequest(email = 'user@example.com') {
  return new Request('https://cabinet.example/api/auth/forgot-password', {
    method: 'POST',
    headers: { origin: 'https://cabinet.example' },
    body: JSON.stringify({ email }),
  })
}

describe('forgot password route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.createPasswordResetToken.mockResolvedValue('reset-token')
    mocks.sendPasswordResetLink.mockResolvedValue({ sent: true })
  })

  it('returns the same public result for an unknown account', async () => {
    mocks.userFindUnique.mockResolvedValue(null)

    const response = await POST(forgotPasswordRequest('missing@example.com'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.createPasswordResetToken).not.toHaveBeenCalled()
  })

  it('does not reveal token creation or delivery failures', async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
    })
    mocks.createPasswordResetToken.mockRejectedValue(new Error('database unavailable'))

    const response = await POST(forgotPasswordRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.logError).toHaveBeenCalledWith(
      'password_reset.request_failed',
      expect.any(Error),
      { userId: 'user-1' }
    )
  })

  it('extends the cooldown after the request limit is reached', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 42 })

    const response = await POST(forgotPasswordRequest())

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    expect(mocks.rateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      'forgot-password',
      20,
      60_000,
      { penaltyMs: 60_000 }
    )
  })
})
