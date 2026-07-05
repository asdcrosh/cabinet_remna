import { NextResponse } from 'next/server'
import { Prisma, UserRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  const url = new URL(req.url)
  const q = url.searchParams.get('q')?.trim()
  const role = url.searchParams.get('role') ?? 'ALL'
  const account = url.searchParams.get('account') ?? 'ALL'
  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1)
  const pageSize = parseAdminListLimit(url.searchParams.get('pageSize') || undefined, ADMIN_LIST_PAGE_SIZE, 100)
  const cursor = parseCreatedAtCursor(url.searchParams.get('cursor'))

  const baseWhere: Prisma.UserWhereInput = {
    ...(isUserRoleFilter(role) ? { role } : {}),
    ...(account === 'LINKED'
      ? { remnawaveUuid: { not: null } }
      : account === 'UNLINKED'
        ? { remnawaveUuid: null }
        : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
            { remnawaveUsername: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }
  const where: Prisma.UserWhereInput | undefined = cursor
    ? { AND: [baseWhere, { OR: buildCreatedAtCursorWhere(cursor) }] }
    : baseWhere

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where: baseWhere }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        remnawaveUuid: true,
        remnawaveUsername: true,
        createdAt: true,
        lastLoginAt: true,
        subscriptions: {
          orderBy: { expireAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
        _count: {
          select: { payments: true, subscriptions: true, devices: true },
        },
      },
    }),
  ])
  const visibleUsers = users.slice(0, pageSize)
  const nextUser = users[pageSize]

  return NextResponse.json({
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      nextCursor: nextUser ? formatCreatedAtCursor(nextUser) : null,
    },
    users: visibleUsers.map((user) => ({
      ...user,
      subscriptions: user.subscriptions.map((subscription) => ({
        ...subscription,
        trafficLimitBytes: subscription.trafficLimitBytes?.toString() ?? null,
        trafficUsedBytes: subscription.trafficUsedBytes.toString(),
        lifetimeUsedBytes: subscription.lifetimeUsedBytes.toString(),
      })),
    })),
  })
})

type CreatedAtCursor = {
  createdAt: Date
  id: string
}

function parseCreatedAtCursor(raw: string | null): CreatedAtCursor | null {
  if (!raw) return null
  const [createdAtRaw, id] = raw.split('|')
  const createdAt = new Date(createdAtRaw || '')
  if (!id || Number.isNaN(createdAt.getTime())) return null
  return { createdAt, id }
}

function buildCreatedAtCursorWhere(cursor: CreatedAtCursor): Prisma.UserWhereInput[] {
  return [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ]
}

function formatCreatedAtCursor(item: { createdAt: Date; id: string }) {
  return `${item.createdAt.toISOString()}|${item.id}`
}

function isUserRoleFilter(value: string): value is UserRole {
  return value === UserRole.USER || value === UserRole.MODERATOR || value === UserRole.ADMIN || value === UserRole.SUPER_ADMIN
}
