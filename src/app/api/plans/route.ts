// GET /api/plans — список активных тарифов (открытый эндпоинт).

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

export const dynamic = 'force-dynamic'

export async function GET() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true, availability: 'ALL' },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      description: true,
      priceKopecks: true,
      durationDays: true,
      trafficLimitGb: true,
      deviceLimit: true,
      isPromo: true,
      promoCodesEnabled: true,
      isFeatured: true,
      sortOrder: true,
    },
  })
  return NextResponse.json({ plans })
}
