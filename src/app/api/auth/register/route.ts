// POST /api/auth/register
// Создаёт ЛОКАЛЬНЫЙ аккаунт ЛК. Remnawave-профиль НЕ создаём сразу —
// он понадобится только при первой покупке подписки.

import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { registerSchema } from '@/lib/auth/validation'
import { rateLimit } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security'
import { createEmailVerificationToken, sendEmailVerificationLink } from '@/lib/email-verification'
import { generateUniqueReferralCode, normalizeReferralCode } from '@/lib/referrals'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'auth-register', 5, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Слишком много регистраций. Попробуйте позже.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { email, password, name, agreeToTerms } = parsed.data
  const referralCode = normalizeReferralCode(parsed.data.referralCode)

  // Проверяем, что email не занят
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'Пользователь с таким email уже существует' },
      { status: 409 }
    )
  }

  const passwordHash = await hash(password, 12) // 12 — баланс CPU/безопасности
  const referrer = referralCode
    ? await prisma.user.findUnique({
        where: { referralCode },
        select: { id: true },
      })
    : null

  if (referralCode && !referrer) {
    return NextResponse.json({ error: 'Реферальный код не найден' }, { status: 404 })
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || null,
      role: 'USER',
      referralCode: await generateUniqueReferralCode(),
      referredById: referrer?.id,
      agreedToTermsAt: agreeToTerms ? new Date() : null,
    },
    select: { id: true, email: true, role: true, name: true },
  })

  const token = await createEmailVerificationToken(user.id)
  const delivery = await sendEmailVerificationLink({
    email: user.email,
    name: user.name,
    token,
  })

  return NextResponse.json(
    {
      user,
      requiresEmailVerification: true,
      emailDelivery: delivery.sent ? 'sent' : delivery.reason,
    },
    { status: 201 }
  )
}
