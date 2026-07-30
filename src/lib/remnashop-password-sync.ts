import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { createClient } from 'redis'
import { remnashopQuery } from './remnashop-db'

const SCRYPT_N = 2 ** 14
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_DKLEN = 64
const SCRYPT_MAXMEM = 64 * 1024 * 1024

export async function hashRemnashopPassword(
  password: string,
  cryptKey: string,
  salt = randomBytes(16)
) {
  const digest = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      `${password}:${cryptKey}`,
      salt,
      SCRYPT_DKLEN,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAXMEM,
      },
      (error, derivedKey) => {
        if (error) reject(error)
        else resolve(derivedKey)
      }
    )
  })

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    digest.toString('base64url'),
  ].join('$')
}

export async function syncResetPasswordToRemnashop(input: {
  remnashopUserId: number
  email: string
  password: string
}) {
  if (!process.env.REMNASHOP_DATABASE_URL) {
    return { ok: false as const, reason: 'database_not_configured' as const }
  }

  const cryptKey = process.env.REMNASHOP_CRYPT_KEY?.trim()
  if (!cryptKey) {
    return { ok: false as const, reason: 'crypt_key_not_configured' as const }
  }

  const redisUrl = process.env.REMNASHOP_REDIS_URL?.trim()
  if (!redisUrl) {
    return { ok: false as const, reason: 'redis_not_configured' as const }
  }

  await revokeRemnashopRefreshSessions(redisUrl, input.remnashopUserId)
  const passwordHash = await hashRemnashopPassword(input.password, cryptKey)
  const result = await remnashopQuery<{ id: number }>(
    `
      UPDATE users
      SET password_hash = $1,
          updated_at = NOW()
      WHERE id = $2
        AND lower(email) = lower($3)
      RETURNING id
    `,
    [passwordHash, input.remnashopUserId, input.email]
  )

  if (!result.rows[0]) {
    return { ok: false as const, reason: 'user_not_found' as const }
  }

  return { ok: true as const, sessionsRevoked: true as const }
}

async function revokeRemnashopRefreshSessions(redisUrl: string, userId: number) {
  const client = createClient({
    url: redisUrl,
    socket: { connectTimeout: 5_000 },
  })
  client.on('error', () => undefined)

  try {
    await client.connect()
    const userTokensKey = `user_tokens:${userId}`
    const tokens = await client.sMembers(userTokensKey)
    const keys = tokens.map((token) => `refresh:${token}`)
    if (keys.length > 0) await client.del(keys)
    await client.del(userTokensKey)
  } finally {
    if (client.isOpen) await client.close()
  }
}
