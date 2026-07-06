import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  rateLimit: vi.fn(),
  createEmailVerificationToken: vi.fn(),
  sendEmailVerificationLink: vi.fn(),
  generateUniqueReferralCode: vi.fn(),
  registerRemnashopEmailUser: vi.fn(),
  findRemnashopUserByEmail: vi.fn(),
  createAdminNotification: vi.fn(),
  logWarn: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('bcryptjs', () => ({ hash: mocks.hash }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/email-verification', () => ({
  createEmailVerificationToken: mocks.createEmailVerificationToken,
  sendEmailVerificationLink: mocks.sendEmailVerificationLink,
}))
vi.mock('@/lib/referrals', async () => {
  const actual = await vi.importActual<typeof import('@/lib/referrals')>('@/lib/referrals')
  return {
    ...actual,
    generateUniqueReferralCode: mocks.generateUniqueReferralCode,
  }
})
vi.mock('@/lib/remnashop-api', () => ({ registerRemnashopEmailUser: mocks.registerRemnashopEmailUser }))
vi.mock('@/lib/remnashop-users', () => ({ findRemnashopUserByEmail: mocks.findRemnashopUserByEmail }))
vi.mock('@/lib/admin-notifications', () => ({ createAdminNotification: mocks.createAdminNotification }))
vi.mock('@/lib/logger', () => ({ logWarn: mocks.logWarn }))

import { POST } from './route'

function registerRequest(body: unknown, origin = 'https://cabinet.example') {
  return new Request('https://cabinet.example/api/auth/register', {
    method: 'POST',
    headers: { origin },
    body: JSON.stringify(body),
  })
}

const validBody = {
  email: 'new@example.com',
  password: 'Password1',
  name: 'New User',
  agreeToTerms: true,
}

describe('register route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.hash.mockResolvedValue('hashed-password')
    mocks.generateUniqueReferralCode.mockResolvedValue('REF123')
    mocks.prisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: validBody.email,
      name: validBody.name,
      role: 'USER',
    })
    mocks.createEmailVerificationToken.mockResolvedValue('verify-token')
    mocks.sendEmailVerificationLink.mockResolvedValue({ sent: true })
    mocks.registerRemnashopEmailUser.mockResolvedValue({ configured: false })
  })

  it('returns neutral response for an existing email', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' })

    const response = await POST(registerRequest(validBody))
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body).toEqual({ requiresEmailVerification: true, emailDelivery: 'sent' })
    expect(mocks.prisma.user.create).not.toHaveBeenCalled()
    expect(mocks.createEmailVerificationToken).not.toHaveBeenCalled()
  })

  it('rejects cross-origin registration before creating a user', async () => {
    const response = await POST(registerRequest(validBody, 'https://evil.example'))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe('Invalid request origin')
    expect(mocks.rateLimit).not.toHaveBeenCalled()
    expect(mocks.prisma.user.create).not.toHaveBeenCalled()
  })

  it('creates a local user and sends email verification', async () => {
    const response = await POST(registerRequest(validBody))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.requiresEmailVerification).toBe(true)
    expect(body.emailDelivery).toBe('sent')
    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: validBody.email,
        passwordHash: 'hashed-password',
        name: validBody.name,
        role: 'USER',
        referralCode: 'REF123',
      }),
      select: { id: true, email: true, role: true, name: true },
    })
    expect(mocks.sendEmailVerificationLink).toHaveBeenCalledWith({
      email: validBody.email,
      name: validBody.name,
      token: 'verify-token',
    })
  })
})
