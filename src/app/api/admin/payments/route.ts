import { NextResponse } from 'next/server'
import { PaymentProvider, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { serializePayment } from '@/lib/api-serializers'
import { csvResponse } from '@/lib/csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const provider = url.searchParams.get('provider')
  const needsProvisioning = url.searchParams.get('needsProvisioning') === 'true'
  const q = url.searchParams.get('q')?.trim()
  const { from, to } = resolveDateRange(
    url.searchParams.get('range') ?? 'ALL',
    url.searchParams.get('from'),
    url.searchParams.get('to')
  )
  const delivery = url.searchParams.get('delivery')
  const format = url.searchParams.get('format')
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || '100') || 100))
  const cursor = parsePaymentCursor(url.searchParams.get('cursor'))

  const baseWhere: Prisma.PaymentWhereInput = {
    ...(status && status in PaymentStatus ? { status: status as PaymentStatus } : {}),
    ...(provider && provider in PaymentProvider ? { provider: provider as PaymentProvider } : {}),
    ...(needsProvisioning || delivery === 'RETRY' ? { status: 'SUCCEEDED', subscriptionProvisionedAt: null } : {}),
    ...(delivery === 'DELIVERED' ? { subscriptionProvisionedAt: { not: null } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: 'insensitive' } },
            { yookassaId: { contains: q, mode: 'insensitive' } },
            { externalPaymentId: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
  if (format === 'csv') {
    const payments = await prisma.payment.findMany({
      where: baseWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5000,
      include: {
        user: { select: { email: true, name: true } },
        plan: { select: { name: true } },
      },
    })

    return csvResponse('payments.csv', payments.map((payment) => ({
      id: payment.id,
      createdAt: payment.createdAt,
      userEmail: payment.user.email,
      userName: payment.user.name ?? '',
      plan: payment.plan.name,
      amountRub: (payment.amountKopecks / 100).toFixed(2),
      status: payment.status,
      provider: payment.provider,
      externalPaymentId: payment.externalPaymentId ?? '',
      yookassaId: payment.yookassaId ?? '',
      provisionedAt: payment.subscriptionProvisionedAt ?? '',
      remnashopSyncedAt: payment.remnashopSyncedAt ?? '',
    })))
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

function parseDateParam(value: string | null, edge: 'start' | 'end') {
  if (!value) return null
  const date = new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function resolveDateRange(range: string, fromRaw: string | null, toRaw: string | null) {
  const now = new Date()
  if (range === 'TODAY') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return { from: start, to: end }
  }
  if (range === 'WEEK') {
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    start.setHours(0, 0, 0, 0)
    return { from: start, to: now }
  }
  return {
    from: parseDateParam(fromRaw, 'start'),
    to: parseDateParam(toRaw, 'end'),
  }
}
