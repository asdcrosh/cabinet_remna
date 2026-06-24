import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { getSession } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { assertSameOrigin } from '@/lib/security'
import { rateLimit } from '@/lib/rate-limit'
import { telegramMiniAppEmailSchema } from '@/lib/auth/validation'
import { createEmailVerificationToken, sendEmailVerificationLink } from '@/lib/email-verification'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const session = await getSession()
  if (!session || session.stage !== 'EMAIL_PENDING') {
    return NextResponse.json({ error: 'Telegram session not found' }, { status: 401 })
  }
  const limited = await rateLimit(req, `telegram-miniapp-email:${session.uid}`, 5, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 })
  }

  const parsed = telegramMiniAppEmailSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation error', details: parsed.error.flatten() }, { status: 400 })
  }

  const current = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, email: true, name: true, telegramId: true, emailVerifiedAt: true },
  })
  if (!current?.telegramId) {
    return NextResponse.json({ error: 'Telegram session not found' }, { status: 404 })
  }
  if (current.emailVerifiedAt) {
    return NextResponse.json({ ok: true, verified: true })
  }

  const emailOwner = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  })
  if (emailOwner && emailOwner.id !== current.id) {
    return NextResponse.json(
      { error: 'Этот email уже используется. Войдите по email и привяжите Telegram в настройках.' },
      { status: 409 }
    )
  }

  const user = await prisma.user.update({
    where: { id: current.id },
    data: {
      email: parsed.data.email,
      passwordHash: await hash(parsed.data.password, 12),
      agreedToTermsAt: new Date(),
    },
    select: { id: true, email: true, name: true },
  })
  const token = await createEmailVerificationToken(user.id)
  const delivery = await sendEmailVerificationLink({ email: user.email, name: user.name, token })

  return NextResponse.json({
    ok: true,
    email: user.email,
    emailDelivery: delivery.sent ? 'sent' : delivery.reason,
  })
}
