import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { disableAutoRenewal, enableAutoRenewal, getAutoRenewalState } from '@/lib/auto-renewal'
import { isYookassaConfigured } from '@/lib/yookassa'
import { rateLimit } from '@/lib/rate-limit'
import { AUTO_RENEWAL_CONSENT_VERSION } from '@/lib/auto-renewal-consent'
import { withDistributedLock } from '@/lib/distributed-lock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const enableSchema = z.object({
  planId: z.string().min(1).max(100),
  consentAccepted: z.literal(true),
  consentVersion: z.literal(AUTO_RENEWAL_CONSENT_VERSION),
}).strict()

export const GET = withAuth(async () => {
  const session = await requireAuth()
  return NextResponse.json({ autoRenewal: await getAutoRenewalState(session.uid) })
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `auto-renewal:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много изменений. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }
  if (!(await isYookassaConfigured())) {
    return NextResponse.json({ error: 'Автопродление временно недоступно' }, { status: 503 })
  }
  const parsed = enableSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Подтвердите согласие на регулярные списания и условия автопродления' },
      { status: 422 }
    )
  }
  try {
    const locked = await withDistributedLock(
      `billing-operation:${session.uid}`,
      async () => {
        await enableAutoRenewal({ userId: session.uid, ...parsed.data })
        return getAutoRenewalState(session.uid)
      }
    )
    if (!locked.acquired) {
      return NextResponse.json(
        { error: 'Операция оплаты уже выполняется. Повторите после её завершения.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ autoRenewal: locked.value })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Не удалось включить автопродление' },
      { status: 409 }
    )
  }
})

export const DELETE = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `auto-renewal:${session.uid}`, 10, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много изменений. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }
  const locked = await withDistributedLock(
    `billing-operation:${session.uid}`,
    async () => {
      await disableAutoRenewal(session.uid)
      return getAutoRenewalState(session.uid)
    }
  )
  if (!locked.acquired) {
    return NextResponse.json(
      { error: 'Списание уже выполняется. Проверьте его результат перед отключением.' },
      { status: 409 }
    )
  }
  return NextResponse.json({ autoRenewal: locked.value })
})
