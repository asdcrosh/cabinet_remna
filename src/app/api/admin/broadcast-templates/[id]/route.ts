import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const DELETE = withAuth(async (_: Request, { params }: { params: { id: string } }) => {
  await requireAdmin()
  await prisma.broadcastTemplate.delete({ where: { id: params.id } }).catch(() => null)
  return NextResponse.json({ ok: true })
})
