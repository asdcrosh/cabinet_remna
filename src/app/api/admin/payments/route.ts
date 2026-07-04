import { NextResponse } from 'next/server'
import { PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { serializePayment } from '@/lib/api-serializers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const needsProvisioning = url.searchParams.get('needsProvisioning') === 'true'
  const q = url.searchParams.get('q')?.trim()
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || '100') || 100))
  const cursor = parsePaymentCursor(url.searchParams.get('cursor'))

  const baseWhere: Prisma.PaymentWhereInput = {
    ...(status && status in PaymentStatus ? { status: status as PaymentStatus } : {}),
    ...(needsProvisioning ? { status: 'SUCCEEDED', subscriptionProvisionedAt: null } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { yookassaId: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
  const where: Prisma.PaymentWhereInput = cursor
    ? { AND: [baseWhere, { OR: buildPaymentCursorWhere(cursor) }] }
    : baseWhere

  const payments = await prisma.payment.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pageSize + 1,
    include: {
      user: { select: { id: true, email: true, name: true } },
      plan: true,
      subscription: { include: { plan: true } },
    },
  })
  const visiblePayments = payments.slice(0, pageSize)
  const nextPayment = payments[pageSize]

  return NextResponse.json({
    payments: visiblePayments.map(serializePayment),
    pagination: {
      pageSize,
      nextCursor: nextPayment ? formatPaymentCursor(nextPayment) : null,
    },
  })
})

type PaymentCursor = {
  createdAt: Date
  id: string
}

function parsePaymentCursor(raw: string | null): PaymentCursor | null {
  if (!raw) return null
  const [createdAtRaw, id] = raw.split('|')
  const createdAt = new Date(createdAtRaw || '')
  if (!id || Number.isNaN(createdAt.getTime())) return null
  return { createdAt, id }
}

function buildPaymentCursorWhere(cursor: PaymentCursor): Prisma.PaymentWhereInput[] {
  return [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ]
}

function formatPaymentCursor(item: { createdAt: Date; id: string }) {
  return `${item.createdAt.toISOString()}|${item.id}`
}
