import { getClientIp } from './security'
import { prisma } from './prisma'

export interface RateLimitResult {
  ok: boolean
  remaining?: number
  retryAfter?: number
}

export async function rateLimit(
  req: Request,
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now()
  const ip = getClientIp(req)
  if (!ip && process.env.NODE_ENV === 'production') {
    throw new Error('Client IP is unavailable. Check TRUSTED_PROXY_HEADERS and reverse proxy headers.')
  }
  const bucketKey = `${key}:${ip}`
  const nowDate = new Date(now)

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.rateLimitBucket.findUnique({
      where: { key: bucketKey },
    })

    if (!current || current.resetAt <= nowDate) {
      await tx.rateLimitBucket.upsert({
        where: { key: bucketKey },
        create: {
          key: bucketKey,
          count: 1,
          resetAt: new Date(now + windowMs),
        },
        update: {
          count: 1,
          resetAt: new Date(now + windowMs),
        },
      })
      return { ok: true, remaining: limit - 1 }
    }

    if (current.count >= limit) {
      return {
        ok: false,
        retryAfter: Math.max(1, Math.ceil((current.resetAt.getTime() - now) / 1000)),
      }
    }

    const updated = await tx.rateLimitBucket.update({
      where: { key: bucketKey },
      data: { count: { increment: 1 } },
      select: { count: true },
    })

    return { ok: true, remaining: Math.max(0, limit - updated.count) }
  })

  return result
}
