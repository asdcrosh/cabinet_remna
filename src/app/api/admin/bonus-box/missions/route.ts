import { NextResponse } from 'next/server'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { bonusBoxMissionAdminSchema } from '@/lib/bonus-box-admin-validation'
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
  const parsed = bonusBoxMissionAdminSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Проверьте параметры задания', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const mission = await prisma.bonusBoxMission.create({
    data: {
      ...parsed.data,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
    },
  })
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_BONUS_MISSION_CREATED',
    message: 'Создано задание бонусной системы',
    metadata: { missionId: mission.id, type: mission.type },
    request: req,
  })
  return NextResponse.json({ mission })
})
