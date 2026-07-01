import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logError } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const token = process.env.HEALTHCHECK_TOKEN
  if (!token && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false }, { status: 404 })
  }

  if (token) {
    const headerToken =
      req.headers.get('x-healthcheck-token') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

    if (headerToken !== token) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }
  } else {
    return NextResponse.json({ ok: true })
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, database: 'ok' })
  } catch (e) {
    logError('health.db_check_failed', e)
    return NextResponse.json({ ok: false, database: 'error' }, { status: 503 })
  }
}
