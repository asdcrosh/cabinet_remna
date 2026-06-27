import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { serializeUserNotification } from '@/lib/user-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const url = new URL(req.url)
  const filter = url.searchParams.get('filter')
  const take = Math.min(Math.max(Number(url.searchParams.get('take') || 30), 1), 100)

  const notifications = await prisma.userNotification.findMany({
    where: {
      userId: session.uid,
      ...(filter === 'unread' ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
  })

  return NextResponse.json({ notifications: notifications.map(serializeUserNotification) })
})

export const PATCH = withAuth(async () => {
  const session = await requireAuth()
  await prisma.userNotification.updateMany({
    where: { userId: session.uid, readAt: null },
    data: { readAt: new Date() },
  })
  return NextResponse.json({ ok: true })
})
