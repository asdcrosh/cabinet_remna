import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { logError } from '@/lib/logger'
import { getBuildInfo } from '@/lib/deployment-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const token = process.env.HEALTHCHECK_TOKEN
  if (!token && process.env.NODE_ENV === 'production') {
    return jsonResponse({ ok: false }, { status: 404 })
  }

  if (token) {
    const headerToken =
      req.headers.get('x-healthcheck-token') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

    if (headerToken !== token) {
      return jsonResponse({ ok: false }, { status: 401 })
    }
  } else {
    return jsonResponse({ ok: true })
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    return jsonResponse({ ok: true, database: 'ok', build: getBuildInfo() })
  } catch (e) {
    logError('health.db_check_failed', e)
    return jsonResponse({ ok: false, database: 'error' }, { status: 503 })
  }
}
