import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { getReferralSettings, updateReferralSettings } from '@/lib/referral-settings'
import { writeAuditLog } from '@/lib/audit-log'

const settingsSchema = z.object({
  trigger: z.enum(['REGISTRATION', 'FIRST_PAYMENT']),
  minimumPaymentKopecks: z.number().int().min(0).max(100_000_000),
  maxRewardsPerReferrer: z.number().int().min(0).max(100_000),
  referrerBonusDays: z.number().int().min(0).max(365),
  referredBonusDays: z.number().int().min(0).max(365),
  referrerAttempts: z.number().int().min(0).max(100),
  referredAttempts: z.number().int().min(0).max(100),
}).refine((value) =>
  value.referrerBonusDays > 0
  || value.referredBonusDays > 0
  || value.referrerAttempts > 0
  || value.referredAttempts > 0,
{
  message: 'Укажите хотя бы одну награду',
})

export const GET = withAuth(async () => {
  await requireAdmin()
  return NextResponse.json({ settings: await getReferralSettings() })
})

export const PATCH = withAuth(async (request: Request) => {
  const session = await requireAdmin()
  const body = await request.json().catch(() => null)
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message || 'Проверьте настройки',
    }, { status: 422 })
  }

  const settings = await updateReferralSettings({
    ...parsed.data,
    minimumPaymentKopecks: parsed.data.trigger === 'REGISTRATION'
      ? 0
      : parsed.data.minimumPaymentKopecks,
  })

  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_REFERRAL_SETTINGS_UPDATED',
    message: 'Обновлены условия реферальной программы',
    metadata: settings,
    request,
  })

  return NextResponse.json({ settings })
})
