import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { loginSchema } from '@/lib/auth/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security'
import { createEmailVerificationToken, sendEmailVerificationLink } from '@/lib/email-verification'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'auth-resend-verification', 3, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много запросов. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = loginSchema.pick({ email: true }).safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  })

  if (!user || user.emailVerifiedAt) {
    return NextResponse.json({ ok: true })
  }

  const token = await createEmailVerificationToken(user.id)
  const delivery = await sendEmailVerificationLink({
    email: user.email,
    name: user.name,
    token,
  })

  return NextResponse.json({
    ok: true,
    emailDelivery: delivery.sent ? 'sent' : delivery.reason,
  })
}
