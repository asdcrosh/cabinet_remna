import { NextResponse } from 'next/server'
import { WelcomeBonusType } from '@prisma/client'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const body = await req.json().catch(() => null)
  const parsed = await parseWelcomeBonusInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 422 })

  const setting = await prisma.welcomeBonusSetting.upsert({
    where: { id: 'default' },
    create: { id: 'default', ...parsed.data },
    update: parsed.data,
  })

  await writeAuditLog({
    actorId: session.uid,
    action: 'PERSONAL_OFFER_UPDATED',
    message: 'Обновлён приветственный бонус',
    metadata: { setting },
    request: req,
  })

  return NextResponse.json({ setting })
})

async function parseWelcomeBonusInput(body: any):
  Promise<
    | {
        data: {
          enabled: boolean
          type: WelcomeBonusType
          trialPlanId: string | null
          bonusAttempts: number
          promoCodeId: string | null
        }
      }
    | { error: string }
  > {
  const enabled = Boolean(body?.enabled)
  const type = body?.type
  const trialPlanId = normalizeNullableText(body?.trialPlanId, 80)
  const promoCodeId = normalizeNullableText(body?.promoCodeId, 80)
  const bonusAttempts = Number(body?.bonusAttempts)

  if (!Object.values(WelcomeBonusType).includes(type)) return { error: 'Некорректный тип приветственного бонуса' }
  if (enabled && type === 'TRIAL_PLAN' && !trialPlanId) return { error: 'Выберите пробный тариф' }
  if (enabled && type === 'PROMO_CODE' && !promoCodeId) return { error: 'Выберите промокод' }
  if (enabled && type === 'BONUS_BOX_ATTEMPTS' && (!Number.isFinite(bonusAttempts) || bonusAttempts < 1)) {
    return { error: 'Укажите количество прокруток' }
  }

  if (trialPlanId) {
    const plan = await prisma.plan.findFirst({
      where: { id: trialPlanId, isActive: true, isPromo: true },
      select: { id: true },
    })
    if (!plan) return { error: 'Пробный тариф не найден или отключён' }
  }

  if (promoCodeId) {
    const promoCode = await prisma.promoCode.findFirst({
      where: { id: promoCodeId, isActive: true },
      select: { id: true },
    })
    if (!promoCode) return { error: 'Промокод не найден или отключён' }
  }

  return {
    data: {
      enabled,
      type: enabled ? type : 'NONE',
      trialPlanId: enabled && type === 'TRIAL_PLAN' ? trialPlanId : null,
      bonusAttempts: enabled && type === 'BONUS_BOX_ATTEMPTS'
        ? Math.max(1, Math.min(50, Math.floor(bonusAttempts)))
        : 0,
      promoCodeId: enabled && type === 'PROMO_CODE' ? promoCodeId : null,
    },
  }
}

function normalizeNullableText(value: unknown, max: number) {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : ''
  return text || null
}
