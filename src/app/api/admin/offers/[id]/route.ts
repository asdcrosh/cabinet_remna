import { NextResponse } from 'next/server'
import { PersonalOfferTone } from '@prisma/client'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { prisma } from '@/lib/prisma'
import { writeAuditLog } from '@/lib/audit-log'

export const PATCH = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAdmin()
  const body = await req.json().catch(() => null)
  const parsed = parseOfferInput(body)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 422 })

  if (parsed.data.promoCodeId) {
    const promoCode = await prisma.promoCode.findFirst({
      where: { id: parsed.data.promoCodeId, isActive: true },
      select: { id: true },
    })
    if (!promoCode) return NextResponse.json({ error: 'Выбранный промокод не найден или отключён' }, { status: 422 })
  }
  const offer = await prisma.personalOfferSetting.update({
    where: { id: params.id },
    data: parsed.data,
  })

  await writeAuditLog({
    actorId: session.uid,
    action: 'PERSONAL_OFFER_UPDATED',
    message: `Обновлён оффер ${offer.scenario}`,
    metadata: { offerId: offer.id, scenario: offer.scenario },
    request: req,
  })

  return NextResponse.json({ offer })
})

function parseOfferInput(body: any):
  | { data: {
      enabled: boolean
      priority: number
      eyebrow: string
      title: string
      description: string
      cta: string
      href: string | null
      meta: string | null
      tone: PersonalOfferTone
      promoCodeId: string | null
    } }
  | { error: string } {
  const eyebrow = normalizeText(body?.eyebrow, 40)
  const title = normalizeText(body?.title, 80)
  const description = normalizeText(body?.description, 220)
  const cta = normalizeText(body?.cta, 40)
  const href = normalizeNullableText(body?.href, 180)
  const meta = normalizeNullableText(body?.meta, 60)
  const priority = Number(body?.priority)
  const tone = body?.tone
  const promoCodeId = normalizeNullableText(body?.promoCodeId, 80)

  if (!eyebrow || !title || !description || !cta) return { error: 'Заполните заголовок, описание и кнопку' }
  if (!Number.isFinite(priority)) return { error: 'Укажите корректный приоритет' }
  if (!Object.values(PersonalOfferTone).includes(tone)) return { error: 'Некорректный цвет оффера' }
  if (href && !href.startsWith('/dashboard')) return { error: 'Ссылка должна вести внутри кабинета' }

  return {
    data: {
      enabled: Boolean(body?.enabled),
      priority: Math.max(0, Math.min(1000, Math.floor(priority))),
      eyebrow,
      title,
      description,
      cta,
      href,
      meta,
      tone,
      promoCodeId,
    },
  }
}

function normalizeText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeNullableText(value: unknown, max: number) {
  const text = normalizeText(value, max)
  return text || null
}
