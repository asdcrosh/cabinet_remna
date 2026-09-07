import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { prepareUserNotificationForDisplay, serializeUserNotification } from '@/lib/user-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const url = new URL(req.url)
  const filter = url.searchParams.get('filter')
  const requestedTake = Number(url.searchParams.get('take') || 30)
  const take = Number.isInteger(requestedTake) && requestedTake > 0 ? Math.min(requestedTake, 100) : 30
  const cursor = url.searchParams.get('cursor')
  const cursorNotification = cursor
    ? await prisma.userNotification.findFirst({
        where: { id: cursor, userId: session.uid },
        select: { id: true, createdAt: true },
      })
    : null

  if (cursor && !cursorNotification) {
    return NextResponse.json({ error: 'Некорректный курсор уведомлений' }, { status: 400 })
  }

  const notifications = await prisma.userNotification.findMany({
    where: {
      userId: session.uid,
      ...(filter === 'unread' ? { readAt: null } : {}),
      ...(cursorNotification
        ? {
            OR: [
              { createdAt: { lt: cursorNotification.createdAt } },
              { createdAt: cursorNotification.createdAt, id: { lt: cursorNotification.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
  })
  const hasMore = notifications.length > take
  const page = notifications.slice(0, take)

  return NextResponse.json({
    notifications: page.map(serializeUserNotification).map((item) => prepareUserNotificationForDisplay(item)),
    hasMore,
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  })
})

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const rawBody = await req.text()
  let ids: string[] | null = null
  if (rawBody) {
    let body: { ids?: unknown }
    try {
      body = JSON.parse(rawBody) as { ids?: unknown }
    } catch {
      return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 })
    }
    if (
      !Array.isArray(body.ids)
      || body.ids.length === 0
      || body.ids.length > 100
      || body.ids.some((id) => typeof id !== 'string' || !id || id.length > 128)
    ) {
      return NextResponse.json({ error: 'Некорректный список уведомлений' }, { status: 400 })
    }
    ids = [...new Set(body.ids)]
  }

  const result = await prisma.userNotification.updateMany({
    where: { userId: session.uid, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  })
  return NextResponse.json({ ok: true, updated: result.count })
})

export const DELETE = withAuth(async () => {
  const session = await requireAuth()
  await prisma.userNotification.deleteMany({ where: { userId: session.uid } })
  return NextResponse.json({ ok: true })
})
