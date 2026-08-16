import { getClientIp } from './security'
import { prisma } from './prisma'

export interface RateLimitResult {
  ok: boolean
  remaining?: number
  retryAfter?: number
}

type RateLimitBucketRow = {
  count: number
  resetAt: Date
}

export async function rateLimit(
  req: Request,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
    throw new Error('Rate limit and window must be positive integers')
  }

  const now = Date.now()
  const ip = getClientIp(req)
  if (!ip && process.env.NODE_ENV === 'production') {
    throw new Error('Client IP is unavailable. Check TRUSTED_PROXY_HEADERS and reverse proxy headers.')
  }
  const bucketKey = `${key}:${ip}`
  const nowDate = new Date(now)
  const nextResetAt = new Date(now + windowMs)

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
