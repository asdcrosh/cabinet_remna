import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  exchangeYandexCode: vi.fn(),
  fetchYandexProfile: vi.fn(),
  setSessionCookieOnResponse: vi.fn(async (response: Response) => response),
  checkRemnawaveProfileOnLogin: vi.fn(),
  createAdminNotification: vi.fn(),
  generateUniqueReferralCode: vi.fn(),
  prisma: {
    oAuthAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => {
      const value = mocks.cookieValues.get(name)
      return value ? { value } : undefined
    },
  }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/auth/cookies', () => ({ setSessionCookieOnResponse: mocks.setSessionCookieOnResponse }))
vi.mock('@/lib/remnawave-profile-check', () => ({
  checkRemnawaveProfileOnLogin: mocks.checkRemnawaveProfileOnLogin,
}))
vi.mock('@/lib/admin-notifications', () => ({ createAdminNotification: mocks.createAdminNotification }))
vi.mock('@/lib/feature-flags', () => ({ isFeatureEnabled: vi.fn(async () => true) }))
vi.mock('@/lib/referrals', () => ({
  generateUniqueReferralCode: mocks.generateUniqueReferralCode,
  normalizeReferralCode: (value: string | undefined) => value || '',
}))
vi.mock('@/lib/yandex-oauth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/yandex-oauth')>('@/lib/yandex-oauth')
  return {
    ...actual,
    exchangeYandexCode: mocks.exchangeYandexCode,
    fetchYandexProfile: mocks.fetchYandexProfile,
  }
})

import {
  YANDEX_OAUTH_NEXT_COOKIE,
  YANDEX_OAUTH_STATE_COOKIE,
} from '@/lib/yandex-oauth'
import { GET } from './route'

const profile = {
  providerUserId: 'yandex-1',
  email: 'user@example.com',
  emailVerified: true,
  name: 'User Name',
  picture: null,
}

const existingUser = {
  id: 'user-1',
  email: profile.email,
  role: 'USER',
  name: null,
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  agreedToTermsAt: null,
  agreedToTermsVersion: null,
  personalDataConsentAt: null,
  personalDataConsentVersion: null,
  remnawaveUuid: null,
  remnawaveUsername: null,
}

describe('Yandex OAuth callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookieValues.clear()
    mocks.cookieValues.set(YANDEX_OAUTH_STATE_COOKIE, 'state-1')
    mocks.cookieValues.set(YANDEX_OAUTH_NEXT_COOKIE, '/dashboard/settings')
    mocks.exchangeYandexCode.mockResolvedValue({ accessToken: 'access-token' })
    mocks.fetchYandexProfile.mockResolvedValue(profile)
    mocks.prisma.oAuthAccount.findUnique.mockResolvedValue(null)
    mocks.prisma.user.findUnique.mockResolvedValue(existingUser)
    mocks.prisma.user.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...existingUser,
      ...data,
    }))
    mocks.generateUniqueReferralCode.mockResolvedValue('REF123')
  })

  it('rejects callbacks with invalid state before token exchange', async () => {
    const response = await GET(new Request('https://cabinet.example/api/auth/yandex/callback?code=code-1&state=bad'))

    expect(response.status).toBe(307)
    expect(locationPath(response)).toBe('/login?yandex_error=invalid_state')
    expect(mocks.exchangeYandexCode).not.toHaveBeenCalled()
    expect(mocks.setSessionCookieOnResponse).not.toHaveBeenCalled()
  })

  it('requires step-up before linking Yandex to an unverified existing email owner', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...existingUser, emailVerifiedAt: null })

    const response = await GET(new Request('https://cabinet.example/api/auth/yandex/callback?code=code-1&state=state-1'))

    expect(response.status).toBe(307)
    expect(locationPath(response)).toBe('/login?yandex_error=yandex_auth_failed')
    expect(mocks.prisma.user.update).not.toHaveBeenCalled()
    expect(mocks.setSessionCookieOnResponse).not.toHaveBeenCalled()
  })

  it('links a verified email owner and creates a session', async () => {
    const response = await GET(new Request('https://cabinet.example/api/auth/yandex/callback?code=code-1&state=state-1'))

    expect(response.status).toBe(307)
    expect(locationPath(response)).toBe('/dashboard/settings')
    expect(mocks.prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: existingUser.id },
      data: expect.objectContaining({
        oauthAccounts: {
          create: expect.objectContaining({
            provider: 'yandex',
            providerUserId: profile.providerUserId,
          }),
        },
      }),
    }))
    expect(mocks.setSessionCookieOnResponse).toHaveBeenCalledWith(expect.any(Response), {
      uid: existingUser.id,
      email: existingUser.email,
      role: existingUser.role,
    })
  })

  it('does not create a new user without separate legal acceptance', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null)

    const response = await GET(new Request('https://cabinet.example/api/auth/yandex/callback?code=code-1&state=state-1'))

    expect(response.status).toBe(307)
    expect(locationPath(response)).toBe('/login?yandex_error=legal_required')
    expect(mocks.prisma.user.create).not.toHaveBeenCalled()
    expect(mocks.setSessionCookieOnResponse).not.toHaveBeenCalled()
  })
})

function locationPath(response: Response) {
  const location = response.headers.get('location')
  expect(location).toEqual(expect.any(String))
  const url = new URL(location as string)
  return `${url.pathname}${url.search}`
}
