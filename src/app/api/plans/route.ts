// GET /api/plans — список активных тарифов (открытый эндпоинт).

import { jsonResponse } from '@/lib/json-response'
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
      unlimitedDuration: true,
      trafficLimitGb: true,
      deviceLimit: true,
      unlimitedDevices: true,
      maxDeviceLimit: true,
      deviceAddonEnabled: true,
      extraDevicePriceKopecks: true,
      isPromo: true,
      promoCodesEnabled: true,
      isFeatured: true,
      sortOrder: true,
    },
  })
  return jsonResponse({ plans })
}
