import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-chars'

const mocks = vi.hoisted(() => ({
  revokedFindUnique: vi.fn(),
  revokedUpsert: vi.fn(),
}))

vi.mock('../prisma', () => ({
  prisma: {
    revokedSession: {
      findUnique: mocks.revokedFindUnique,
      upsert: mocks.revokedUpsert,
    },
  },
}))

let authJwt: typeof import('./jwt')

describe('auth jwt', () => {
  beforeAll(async () => {
    authJwt = await import('./jwt')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.revokedFindUnique.mockResolvedValue(null)
    mocks.revokedUpsert.mockResolvedValue({})
  })

  it('signs and verifies a session with a revocable jti', async () => {
    const token = await authJwt.signSession({
      uid: 'user-1',
      email: 'user@example.com',
      role: 'USER',
    })

    const session = await authJwt.verifySession(token)

    expect(session).toMatchObject({
      uid: 'user-1',
      email: 'user@example.com',
      role: 'USER',
    })
    expect(typeof session?.jti).toBe('string')
  })

  it('rejects a revoked session token', async () => {
    mocks.revokedFindUnique.mockResolvedValue({ id: 'revoked-1' })
    const token = await authJwt.signSession({
      uid: 'user-1',
      email: 'user@example.com',
      role: 'USER',
    })

    await expect(authJwt.verifySession(token)).resolves.toBeNull()
  })

  it('stores current token jti on logout revocation', async () => {
    const token = await authJwt.signSession({
      uid: 'user-1',
      email: 'user@example.com',
      role: 'USER',
    })

    await expect(authJwt.revokeSessionToken(token)).resolves.toBe(true)
    expect(mocks.revokedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: 'user-1',
          jti: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      })
    )
  })
})
