import { NextResponse } from 'next/server'
import { requireStaff, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { serializeAdminNotification } from '@/lib/admin-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  const session = await requireStaff()
  const url = new URL(req.url)
  const filter = url.searchParams.get('filter')
  const type = url.searchParams.get('type')
  const take = Math.min(Math.max(Number(url.searchParams.get('take') || 50), 1), 100)

  const where = {
    ...(filter === 'unread' ? { reads: { none: { userId: session.uid } } } : {}),
    ...(type && type !== 'ALL' ? { type } : {}),
  }

  const notifications = await prisma.adminNotification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
    include: { reads: { where: { userId: session.uid }, select: { readAt: true } } },
  })

  return NextResponse.json({ notifications: notifications.map(serializeAdminNotification) })
})

export const PATCH = withAuth(async () => {
  const session = await requireStaff()
  const unread = await prisma.adminNotification.findMany({
    where: { reads: { none: { userId: session.uid } } },
    select: { id: true },
    take: 500,
  })

  if (unread.length > 0) {
    await prisma.adminNotificationRead.createMany({
      data: unread.map((item) => ({ notificationId: item.id, userId: session.uid })),
      skipDuplicates: true,
    })
  }

  return NextResponse.json({ ok: true })
})

export const DELETE = withAuth(async () => {
  await requireStaff()
  await prisma.adminNotification.deleteMany({})
  return NextResponse.json({ ok: true })
})
