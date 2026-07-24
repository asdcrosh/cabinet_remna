import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { bonusBoxEventAdminSchema } from '@/lib/bonus-box-admin-validation'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request) => {
  if (!await isFeatureEnabled('bonusBox')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const session = await requireAdmin()
  const body = await req.json().catch(() => null)
  const parsed = bonusBoxEventAdminSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Проверьте параметры события', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const event = await prisma.bonusBoxEvent.create({
    data: {
      ...parsed.data,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
    },
  })
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_BONUS_EVENT_CREATED',
    message: 'Создано сезонное событие',
    metadata: { eventId: event.id, prizeIds: event.prizeIds },
    request: req,
  })
  return NextResponse.json({ event })
})
