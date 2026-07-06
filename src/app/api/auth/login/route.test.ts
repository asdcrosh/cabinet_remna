import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  compare: vi.fn(),
  hash: vi.fn(),
  rateLimit: vi.fn(),
  checkRemnawaveProfileOnLogin: vi.fn(),
  authenticateRemnashopEmail: vi.fn(),
  registerRemnashopEmailUser: vi.fn(),
  findRemnashopUserByEmail: vi.fn(),
  generateUniqueReferralCode: vi.fn(),
  createAdminNotification: vi.fn(),
  logWarn: vi.fn(),
  setSessionCookieOnResponse: vi.fn((response: Response) => response),
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('bcryptjs', () => ({ compare: mocks.compare, hash: mocks.hash }))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/auth/cookies', () => ({ setSessionCookieOnResponse: mocks.setSessionCookieOnResponse }))
vi.mock('@/lib/remnawave-profile-check', () => ({ checkRemnawaveProfileOnLogin: mocks.checkRemnawaveProfileOnLogin }))
vi.mock('@/lib/remnashop-api', () => ({
  authenticateRemnashopEmail: mocks.authenticateRemnashopEmail,
  registerRemnashopEmailUser: mocks.registerRemnashopEmailUser,
}))
vi.mock('@/lib/remnashop-users', () => ({ findRemnashopUserByEmail: mocks.findRemnashopUserByEmail }))
vi.mock('@/lib/referrals', () => ({ generateUniqueReferralCode: mocks.generateUniqueReferralCode }))
vi.mock('@/lib/admin-notifications', () => ({ createAdminNotification: mocks.createAdminNotification }))
vi.mock('@/lib/logger', () => ({ logWarn: mocks.logWarn }))

import { POST } from './route'

const user = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  role: 'USER',
  passwordHash: 'hash',
  emailVerifiedAt: new Date(),
  remnashopUserId: 10,
  remnawaveUuid: 'uuid-1',
  remnawaveUsername: 'user-1',
}

function loginRequest(body: unknown, origin = 'https://cabinet.example') {
  return new Request('https://cabinet.example/api/auth/login', {
    method: 'POST',
    headers: { origin },
    body: JSON.stringify(body),
  })
}

describe('login route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.prisma.user.findUnique.mockResolvedValue(user)
    mocks.prisma.user.update.mockResolvedValue(user)
    mocks.compare.mockResolvedValue(true)
    mocks.checkRemnawaveProfileOnLogin.mockResolvedValue(undefined)
  })

  it('rejects cross-origin login attempts before rate limit and DB work', async () => {
    const response = await POST(loginRequest({ email: user.email, password: 'Password1' }, 'https://evil.example'))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe('Invalid request origin')
    expect(mocks.rateLimit).not.toHaveBeenCalled()
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('creates a session after valid credentials and verified email', async () => {
    const response = await POST(loginRequest({ email: user.email, password: 'Password1' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.user).toEqual({ id: user.id, email: user.email, name: user.name, role: user.role })
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { lastLoginAt: expect.any(Date) },
    })
    expect(mocks.setSessionCookieOnResponse).toHaveBeenCalledWith(expect.any(Response), {
      uid: user.id,
      email: user.email,
      role: user.role,
    })
  })
})
