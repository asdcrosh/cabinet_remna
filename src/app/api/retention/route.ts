import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { rateLimit } from '@/lib/rate-limit'
import {
  getRetentionState,
  pauseSubscription,
  recordAutoRenewalCancellation,
  resumeSubscription,
  RetentionError,
} from '@/lib/subscription-retention'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const reasonSchema = z.enum([
  'TOO_EXPENSIVE',
  'CONNECTION_ISSUES',
  'NOT_USING',
  'PAYMENT_PROBLEM',
  'MISSING_REGION',
  'OTHER',
])

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('DISABLE_AUTO_RENEWAL'),
    reason: reasonSchema,
    comment: z.string().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal('PAUSE'),
    reason: reasonSchema,
    pauseDays: z.number().int().min(1).max(30),
    comment: z.string().max(500).optional(),
  }).strict(),
])

export const GET = withAuth(async () => {
  const session = await requireAuth()
  return NextResponse.json({ pause: await getRetentionState(session.uid) })
})

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `retention:${session.uid}`, 8, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много изменений. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }
  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Проверьте выбранное действие' }, { status: 422 })
  try {
    if (parsed.data.action === 'PAUSE') {
      await pauseSubscription({ userId: session.uid, ...parsed.data })
    } else {
      await recordAutoRenewalCancellation({ userId: session.uid, ...parsed.data })
    }
    return NextResponse.json({ ok: true, pause: await getRetentionState(session.uid) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Не удалось изменить подписку' },
      { status: error instanceof RetentionError ? error.status : 500 }
    )
  }
})

export const DELETE = withAuth(async (req: Request) => {
  const session = await requireAuth()
  const limited = await rateLimit(req, `retention:${session.uid}`, 8, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много изменений. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }
  try {
    const result = await resumeSubscription(session.uid)
    return NextResponse.json({ ok: true, result, pause: null })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Не удалось возобновить доступ' },
      { status: error instanceof RetentionError ? error.status : 500 }
    )
  }
})
