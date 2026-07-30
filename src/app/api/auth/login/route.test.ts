import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  telegramId: null,
  telegramUsername: null,
  telegramLinkedAt: null,
}

const originalRemnashopApiUrl = process.env.REMNASHOP_API_URL
const originalRemnashopDatabaseUrl = process.env.REMNASHOP_DATABASE_URL

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
    process.env.REMNASHOP_API_URL = originalRemnashopApiUrl
    process.env.REMNASHOP_DATABASE_URL = originalRemnashopDatabaseUrl
    mocks.rateLimit.mockResolvedValue({ ok: true })
    mocks.prisma.user.findUnique.mockResolvedValue(user)
    mocks.prisma.user.update.mockResolvedValue(user)
    mocks.compare.mockResolvedValue(true)
    mocks.checkRemnawaveProfileOnLogin.mockResolvedValue(undefined)
  })

  afterEach(() => {
    process.env.REMNASHOP_API_URL = originalRemnashopApiUrl
    process.env.REMNASHOP_DATABASE_URL = originalRemnashopDatabaseUrl
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

  it('allows an imported Remnashop user to sign in with the Remnashop password', async () => {
    process.env.REMNASHOP_API_URL = 'http://remnashop/api'
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop@db/remnashop'
    mocks.prisma.user.findUnique.mockResolvedValue(null)
    mocks.compare.mockResolvedValue(false)
    mocks.authenticateRemnashopEmail.mockResolvedValue(true)
    mocks.findRemnashopUserByEmail.mockResolvedValue({
      id: 42,
      email: user.email,
      name: user.name,
      username: null,
      telegram_id: null,
      is_email_verified: true,
    })
    mocks.hash.mockResolvedValue('imported-password-hash')
    mocks.generateUniqueReferralCode.mockResolvedValue('IMPORT42')
    mocks.prisma.user.create.mockResolvedValue({ ...user, remnashopUserId: 42 })

    const response = await POST(loginRequest({ email: user.email, password: 'Remnashop1' }))

    expect(response.status).toBe(200)
    expect(mocks.prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: user.email,
        passwordHash: 'imported-password-hash',
        remnashopUserId: 42,
      }),
    })
    expect(mocks.createAdminNotification).toHaveBeenCalledOnce()
  })

  it('never uses Remnashop credentials to take over a privileged local account', async () => {
    process.env.REMNASHOP_API_URL = 'http://remnashop/api'
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop@db/remnashop'
    mocks.prisma.user.findUnique.mockResolvedValue({
      ...user,
      role: 'ADMIN',
      remnashopUserId: 42,
    })
    mocks.compare.mockResolvedValue(false)

    const response = await POST(loginRequest({ email: user.email, password: 'WrongPassword1' }))

    expect(response.status).toBe(401)
    expect(mocks.authenticateRemnashopEmail).not.toHaveBeenCalled()
    expect(mocks.prisma.user.update).not.toHaveBeenCalled()
  })

  it('repairs a missed Remnashop registration after a valid Cabinet login', async () => {
    process.env.REMNASHOP_API_URL = 'http://remnashop/api'
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop@db/remnashop'
    mocks.prisma.user.findUnique.mockResolvedValue({ ...user, remnashopUserId: null })
    mocks.authenticateRemnashopEmail.mockResolvedValue(false)
    mocks.registerRemnashopEmailUser.mockResolvedValue({ configured: true })
    mocks.findRemnashopUserByEmail.mockResolvedValue({
      id: 43,
      email: user.email,
      name: user.name,
      username: null,
      telegram_id: null,
      is_email_verified: true,
    })
    mocks.prisma.user.update
      .mockResolvedValueOnce({ ...user, remnashopUserId: 43 })
      .mockResolvedValueOnce({ ...user, remnashopUserId: 43 })

    const response = await POST(loginRequest({ email: user.email, password: 'Password1' }))

    expect(response.status).toBe(200)
    expect(mocks.authenticateRemnashopEmail).toHaveBeenCalledWith(user.email, 'Password1')
    expect(mocks.registerRemnashopEmailUser).toHaveBeenCalledOnce()
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        remnashopUserId: 43,
        remnashopSyncedAt: expect.any(Date),
      },
    })
  })

  it('does not link an existing Remnashop account when its password is different', async () => {
    process.env.REMNASHOP_API_URL = 'http://remnashop/api'
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop@db/remnashop'
    mocks.prisma.user.findUnique.mockResolvedValue({ ...user, remnashopUserId: null })
    mocks.authenticateRemnashopEmail.mockResolvedValue(false)
    mocks.registerRemnashopEmailUser.mockResolvedValue({
      configured: true,
      alreadyExists: true,
    })

    const response = await POST(loginRequest({ email: user.email, password: 'Password1' }))

    expect(response.status).toBe(200)
    expect(mocks.findRemnashopUserByEmail).not.toHaveBeenCalled()
    expect(mocks.logWarn).toHaveBeenCalledWith(
      'auth.login.remnashop_identity_conflict',
      expect.objectContaining({ userId: user.id })
    )
    expect(mocks.createAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'identity_conflict',
        severity: 'WARNING',
        entityId: user.id,
      })
    )
  })
})
