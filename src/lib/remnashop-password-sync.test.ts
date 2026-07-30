import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scryptSync } from 'node:crypto'

const mocks = vi.hoisted(() => ({
  remnashopQuery: vi.fn(),
  createClient: vi.fn(),
  redis: {
    on: vi.fn(),
    connect: vi.fn(),
    sMembers: vi.fn(),
    del: vi.fn(),
    close: vi.fn(),
    isOpen: true,
  },
}))

vi.mock('./remnashop-db', () => ({ remnashopQuery: mocks.remnashopQuery }))
vi.mock('redis', () => ({ createClient: mocks.createClient }))

import {
  hashRemnashopPassword,
  syncResetPasswordToRemnashop,
} from './remnashop-password-sync'

const originalDatabaseUrl = process.env.REMNASHOP_DATABASE_URL
const originalCryptKey = process.env.REMNASHOP_CRYPT_KEY
const originalRedisUrl = process.env.REMNASHOP_REDIS_URL

describe('Remnashop password reset sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REMNASHOP_DATABASE_URL = 'postgresql://remnashop@db/remnashop'
    process.env.REMNASHOP_CRYPT_KEY = 'installation-secret'
    process.env.REMNASHOP_REDIS_URL = 'redis://remnashop-redis:6379'
    mocks.createClient.mockReturnValue(mocks.redis)
    mocks.redis.sMembers.mockResolvedValue(['token-a', 'token-b'])
    mocks.redis.del.mockResolvedValue(1)
    mocks.redis.close.mockResolvedValue(undefined)
    mocks.remnashopQuery.mockResolvedValue({ rows: [{ id: 42 }] })
  })

  afterEach(() => {
    restoreEnv('REMNASHOP_DATABASE_URL', originalDatabaseUrl)
    restoreEnv('REMNASHOP_CRYPT_KEY', originalCryptKey)
    restoreEnv('REMNASHOP_REDIS_URL', originalRedisUrl)
  })

  it('matches the Remnashop scrypt password format', async () => {
    const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex')
    const value = await hashRemnashopPassword('Password1', 'installation-secret', salt)
    const expectedDigest = scryptSync(
      'Password1:installation-secret',
      salt,
      64,
      { N: 2 ** 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
    )

    expect(value).toBe(
      `scrypt$16384$8$1$${salt.toString('base64url')}$${expectedDigest.toString('base64url')}`
    )
  })

  it('revokes refresh sessions before updating the linked Remnashop user', async () => {
    await expect(syncResetPasswordToRemnashop({
      remnashopUserId: 42,
      email: 'user@example.com',
      password: 'Password2',
    })).resolves.toEqual({ ok: true, sessionsRevoked: true })

    expect(mocks.redis.sMembers).toHaveBeenCalledWith('user_tokens:42')
    expect(mocks.redis.del).toHaveBeenNthCalledWith(1, ['refresh:token-a', 'refresh:token-b'])
    expect(mocks.redis.del).toHaveBeenNthCalledWith(2, 'user_tokens:42')
    expect(mocks.remnashopQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users'),
      [expect.stringMatching(/^scrypt\$16384\$8\$1\$/), 42, 'user@example.com']
    )
  })

  it('does not change the remote password without session revocation access', async () => {
    delete process.env.REMNASHOP_REDIS_URL

    await expect(syncResetPasswordToRemnashop({
      remnashopUserId: 42,
      email: 'user@example.com',
      password: 'Password2',
    })).resolves.toEqual({ ok: false, reason: 'redis_not_configured' })
    expect(mocks.remnashopQuery).not.toHaveBeenCalled()
  })
})

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
