import { getClientIp } from './security'
import { prisma } from './prisma'

export interface RateLimitResult {
  ok: boolean
  remaining?: number
  retryAfter?: number
}

type RateLimitOptions = {
  penaltyMs?: number
}

type RateLimitBucketRow = {
  count: number
  resetAt: Date
}

export async function rateLimit(
  req: Request,
  key: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  validateLimit(limit, windowMs, options)
  const ip = getClientIp(req)
  if (!ip && process.env.NODE_ENV === 'production') {
    throw new Error('Client IP is unavailable. Check TRUSTED_PROXY_HEADERS and reverse proxy headers.')
  }
  return hitBucket(`${key}:${ip}`, limit, windowMs, options)
}

/**
 * Лимит по ключу без IP — например, попытки входа в один аккаунт с разных адресов.
 * Ключ попадает в базу как есть: персональные данные в нём передавать хэшем.
 */
export async function rateLimitKey(
  key: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {}
): Promise<RateLimitResult> {
  validateLimit(limit, windowMs, options)
  return hitBucket(key, limit, windowMs, options)
}

function validateLimit(limit: number, windowMs: number, options: RateLimitOptions) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
    throw new Error('Rate limit and window must be positive integers')
  }
  if (options.penaltyMs !== undefined && (!Number.isInteger(options.penaltyMs) || options.penaltyMs < 1)) {
    throw new Error('Rate limit penalty must be a positive integer')
  }
}

async function hitBucket(
  bucketKey: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const now = Date.now()
  const nowDate = new Date(now)
  const nextResetAt = new Date(now + windowMs)
  const extendWhenLimited = options.penaltyMs !== undefined
  const penaltyResetAt = new Date(now + (options.penaltyMs ?? windowMs))

  const rows = await prisma.$queryRaw<RateLimitBucketRow[]>`
    INSERT INTO "RateLimitBucket" AS bucket ("key", "count", "resetAt", "createdAt", "updatedAt")
    VALUES (${bucketKey}, 1, ${nextResetAt}, ${nowDate}, ${nowDate})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN bucket."resetAt" <= ${nowDate} THEN 1
        ELSE bucket."count" + 1
      END,
      "resetAt" = CASE
        WHEN bucket."resetAt" <= ${nowDate} THEN EXCLUDED."resetAt"
        WHEN ${extendWhenLimited} AND bucket."count" >= ${limit} THEN ${penaltyResetAt}
        ELSE bucket."resetAt"
      END,
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "count", "resetAt"
  `
  const updated = rows[0]
  if (!updated) throw new Error('Rate limit bucket update returned no row')

  if (updated.count > limit) {
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((updated.resetAt.getTime() - now) / 1000)),
    }
  }

  return { ok: true, remaining: Math.max(0, limit - updated.count) }
}
