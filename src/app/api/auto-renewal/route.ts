import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { disableAutoRenewal, enableAutoRenewal, getAutoRenewalState } from '@/lib/auto-renewal'
import { isYookassaConfigured } from '@/lib/yookassa'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const enableSchema = z.object({ planId: z.string().min(1).max(100) }).strict()

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
    return NextResponse.json({ error: 'Не удалось определить тариф' }, { status: 422 })
  }
  try {
    await enableAutoRenewal({ userId: session.uid, planId: parsed.data.planId })
    return NextResponse.json({ autoRenewal: await getAutoRenewalState(session.uid) })
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
  await disableAutoRenewal(session.uid)
  return NextResponse.json({ autoRenewal: await getAutoRenewalState(session.uid) })
})
