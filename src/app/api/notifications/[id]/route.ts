import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const PATCH = withAuth(async (_req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAuth()

  const result = await prisma.userNotification.updateMany({
    where: { id: params.id, userId: session.uid, readAt: null },
    data: { readAt: new Date() },
  })

  return NextResponse.json({ ok: true, updated: result.count })
})
