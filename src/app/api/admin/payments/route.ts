import { NextResponse } from 'next/server'
import { PaymentStatus } from '@prisma/client'
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

  const payments = await prisma.payment.findMany({
    where: {
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
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      user: { select: { id: true, email: true, name: true } },
      plan: true,
      subscription: { include: { plan: true } },
    },
  })

  return NextResponse.json({ payments: payments.map(serializePayment) })
})
