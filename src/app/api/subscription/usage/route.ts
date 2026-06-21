// GET /api/subscription/usage?days=30
// Возвращает посуточное потребление трафика для графика.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { remnawave, RemnawaveError } from '@/lib/remnawave'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  if (!user?.remnawaveUuid) return NextResponse.json({ series: [] })

  const url = new URL(req.url)
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), 90)

  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)

  try {
    const data = await remnawave.getUsageRange(user.remnawaveUuid, start, end)
    return NextResponse.json({ series: data.response })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return NextResponse.json({ series: [], error: `Remnawave ${e.status}` }, { status: 200 })
    }
    throw e
  }
})
