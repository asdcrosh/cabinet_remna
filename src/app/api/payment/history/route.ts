// GET /api/payment/history — история платежей текущего юзера.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { serializePayment } from '@/lib/api-serializers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const payments = await prisma.payment.findMany({
    where: { userId: session.uid },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { plan: true, subscription: true },
  })
  return NextResponse.json({ payments: payments.map(serializePayment) })
})
