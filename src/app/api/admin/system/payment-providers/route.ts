import { NextResponse } from 'next/server'
import { z } from 'zod'
import { writeAuditLog } from '@/lib/audit-log'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import {
  getPublicPaymentProviderSettings,
  resetPaymentProviderSettings,
  updatePaymentProviderSettings,
} from '@/lib/payment-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const optionalSecret = z.string().trim().max(500).optional()
const schema = z.object({
  yookassa: z.object({
    enabled: z.boolean(),
    shopId: z.string().trim().max(100),
    secretKey: optionalSecret,
    webhookAllowedIps: z.string().trim().max(2000),
  }).strict(),
  payAnyWay: z.object({
    enabled: z.boolean(),
    merchantId: z.string().trim().max(100).refine((value) => !value || /^\d+$/.test(value), {
      message: 'Номер счёта PayAnyWay должен содержать только цифры',
    }),
    integrityCode: optionalSecret.refine((value) => !value || value.length >= 32 || value === '12345', {
      message: 'Код должен быть не короче 32 символов или равен legacy-коду Self.PayAnyWay',
    }),
    testMode: z.boolean(),
  }).strict(),
  platega: z.object({
    enabled: z.boolean(),
    merchantId: z.string().trim().max(100),
    secret: optionalSecret,
  }).strict(),
}).strict()

export const GET = withAuth(async () => {
  await requireAdmin()
  return NextResponse.json({ settings: await getPublicPaymentProviderSettings() })
})

export const PATCH = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({
      error: parsed.error.issues[0]?.message || 'Некорректные настройки платёжных систем',
    }, { status: 422 })
  }

  const settings = await updatePaymentProviderSettings(parsed.data)
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_PAYMENT_PROVIDERS_UPDATED',
    message: 'Обновлены платёжные системы',
    metadata: settings,
    request: req,
  })
  return NextResponse.json({ settings })
})

export const DELETE = withAuth(async (req: Request) => {
  const session = await requireAdmin()
  const settings = await resetPaymentProviderSettings()
  await writeAuditLog({
    actorId: session.uid,
    action: 'ADMIN_PAYMENT_PROVIDERS_RESET',
    message: 'Настройки платёжных систем сброшены к .env',
    metadata: settings,
    request: req,
  })
  return NextResponse.json({ settings })
})
