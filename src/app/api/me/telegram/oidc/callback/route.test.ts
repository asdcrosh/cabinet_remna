import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  TelegramAccountMergeError: class TelegramAccountMergeError extends Error {
    constructor(public code: string) {
      super(code)
      this.name = 'TelegramAccountMergeError'
    }
  },
  requireAuth: vi.fn(),
  verifyTelegramIdToken: vi.fn(),
  mergeTechnicalTelegramAccount: vi.fn(),
  attachRemnashopIdentityToCabinetUser: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
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
vi.mock('@/lib/auth/guard', () => ({
  requireAuth: mocks.requireAuth,
  withAuth: (handler: (req: Request) => Promise<Response>) => handler,
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/telegram-auth', () => ({ verifyTelegramIdToken: mocks.verifyTelegramIdToken }))
vi.mock('@/lib/telegram-link-sync', () => ({
  attachRemnashopIdentityToCabinetUser: mocks.attachRemnashopIdentityToCabinetUser,
}))
vi.mock('@/lib/telegram-account-merge', () => ({
  mergeTechnicalTelegramAccount: mocks.mergeTechnicalTelegramAccount,
  TelegramAccountMergeError: mocks.TelegramAccountMergeError,
}))
vi.mock('@/lib/telegram-oidc', async () => {
  const actual = await vi.importActual<typeof import('@/lib/telegram-oidc')>('@/lib/telegram-oidc')
  return {
    ...actual,
    getTelegramRedirectUri: () => 'https://cabinet.example/api/me/telegram/oidc/callback',
  }
})

import {
  TELEGRAM_OIDC_STATE_COOKIE,
  TELEGRAM_OIDC_VERIFIER_COOKIE,
} from '@/lib/telegram-oidc'
import { GET } from './route'

const session = { uid: 'user-1', email: 'user@example.com', role: 'USER' }
const originalClientId = process.env.TELEGRAM_CLIENT_ID
const originalClientSecret = process.env.TELEGRAM_CLIENT_SECRET
const telegramUser = {
  id: BigInt(123456),
  username: 'telegram_user',
  name: 'Telegram User',
}

describe('Telegram OIDC callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cookieValues.clear()
    mocks.cookieValues.set(TELEGRAM_OIDC_STATE_COOKIE, 'state-1')
    mocks.cookieValues.set(TELEGRAM_OIDC_VERIFIER_COOKIE, 'verifier-1')
    mocks.requireAuth.mockResolvedValue(session)
    mocks.verifyTelegramIdToken.mockResolvedValue(telegramUser)
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: session.uid,
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    mocks.prisma.user.update.mockResolvedValue({})
    mocks.mergeTechnicalTelegramAccount.mockResolvedValue(undefined)
    mocks.attachRemnashopIdentityToCabinetUser.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id_token: 'id-token-1' })))
    process.env.TELEGRAM_CLIENT_ID = 'telegram-client'
    process.env.TELEGRAM_CLIENT_SECRET = 'telegram-secret'
  })

  afterEach(() => {
    if (originalClientId == null) delete process.env.TELEGRAM_CLIENT_ID
    else process.env.TELEGRAM_CLIENT_ID = originalClientId
    if (originalClientSecret == null) delete process.env.TELEGRAM_CLIENT_SECRET
    else process.env.TELEGRAM_CLIENT_SECRET = originalClientSecret
    vi.unstubAllGlobals()
  })

  it('rejects callbacks with invalid state before token exchange', async () => {
    const response = await GET(new Request('https://cabinet.example/api/me/telegram/oidc/callback?code=code-1&state=bad'))

    expect(response.status).toBe(307)
    expect(locationPath(response)).toBe('/dashboard/settings?telegram_error=invalid_state')
    expect(fetch).not.toHaveBeenCalled()
    expect(mocks.mergeTechnicalTelegramAccount).not.toHaveBeenCalled()
  })

  it('redirects with identity conflict when merge requires manual handling', async () => {
    mocks.mergeTechnicalTelegramAccount.mockRejectedValue(new mocks.TelegramAccountMergeError('IDENTITY_CONFLICT'))

    const response = await GET(new Request('https://cabinet.example/api/me/telegram/oidc/callback?code=code-1&state=state-1'))

    expect(response.status).toBe(307)
    expect(locationPath(response)).toBe('/dashboard/settings?telegram_error=telegram_identity_conflict')
    expect(mocks.prisma.user.update).not.toHaveBeenCalled()
  })

  it('links Telegram identity and redirects back to settings', async () => {
    const response = await GET(new Request('https://cabinet.example/api/me/telegram/oidc/callback?code=code-1&state=state-1'))

    expect(response.status).toBe(307)
    expect(locationPath(response)).toBe('/dashboard/settings?telegram_linked=1')
    expect(mocks.mergeTechnicalTelegramAccount).toHaveBeenCalledWith({
      targetUserId: session.uid,
      telegramId: telegramUser.id,
      telegramUsername: telegramUser.username,
      telegramName: telegramUser.name,
    })
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: session.uid },
      data: {
        telegramId: telegramUser.id,
        telegramUsername: telegramUser.username,
        telegramLinkedAt: expect.any(Date),
        name: telegramUser.name,
      },
    })
  })
})

function locationPath(response: Response) {
  const location = response.headers.get('location')
  expect(location).toEqual(expect.any(String))
  const url = new URL(location as string)
  return `${url.pathname}${url.search}`
}
