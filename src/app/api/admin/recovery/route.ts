import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { serializePayment } from '@/lib/api-serializers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  await requireAdmin()

  const payments = await prisma.payment.findMany({
    where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null },
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, email: true, name: true, remnawaveUuid: true, remnawaveUsername: true } },
      plan: true,
      subscription: { include: { plan: true } },
      provisioningJob: true,
    },
  })

  return NextResponse.json({ payments: payments.map(serializePayment) })
})
