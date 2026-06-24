import { NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { getSession, setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { assertSameOrigin } from '@/lib/security'
import { rateLimit } from '@/lib/rate-limit'
import { newPasswordSchema, telegramMiniAppEmailSchema } from '@/lib/auth/validation'
import { createEmailVerificationToken, sendEmailVerificationLink } from '@/lib/email-verification'
import { syncLinkedTelegramUser } from '@/lib/telegram-link-sync'

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
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message || 'Проверьте введённые данные',
        details: parsed.error.flatten(),
      },
      { status: 400 }
    )
  }

  const current = await prisma.user.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      email: true,
      name: true,
      telegramId: true,
      telegramUsername: true,
      telegramLinkedAt: true,
      emailVerifiedAt: true,
    },
  })
  if (!current?.telegramId) {
    return NextResponse.json({ error: 'Telegram session not found' }, { status: 404 })
  }
  if (current.emailVerifiedAt) {
    return NextResponse.json({ ok: true, verified: true })
  }

  const emailOwner = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      emailVerifiedAt: true,
      telegramId: true,
    },
  })

  if (emailOwner && emailOwner.id !== current.id) {
    const passwordMatches = await compare(parsed.data.password, emailOwner.passwordHash)
    if (!passwordMatches) {
      return NextResponse.json(
        { error: 'Этот email уже зарегистрирован. Введите пароль от существующего аккаунта.' },
        { status: 401 }
      )
    }
    if (emailOwner.telegramId && emailOwner.telegramId !== current.telegramId) {
      return NextResponse.json(
        { error: 'К этому аккаунту уже привязан другой Telegram.' },
        { status: 409 }
      )
    }

    const mergedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: emailOwner.id },
        data: {
          telegramId: current.telegramId,
          telegramUsername: current.telegramUsername,
          telegramLinkedAt: current.telegramLinkedAt ?? new Date(),
          agreedToTermsAt: new Date(),
          lastLoginAt: emailOwner.emailVerifiedAt ? new Date() : undefined,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          emailVerifiedAt: true,
          telegramId: true,
        },
      })
      await tx.user.delete({ where: { id: current.id } })
      return user
    })

    if (mergedUser.emailVerifiedAt) {
      try {
        await syncLinkedTelegramUser({
          localUserId: mergedUser.id,
          telegramId: mergedUser.telegramId!,
        })
      } catch {
        // Legacy subscription sync must not block login.
      }

      const response = NextResponse.json({
        ok: true,
        email: mergedUser.email,
        authenticated: true,
        merged: true,
      })
      return setSessionCookieOnResponse(response, {
        uid: mergedUser.id,
        email: mergedUser.email,
        role: mergedUser.role,
        stage: 'FULL',
      })
    }

    const token = await createEmailVerificationToken(mergedUser.id)
    const delivery = await sendEmailVerificationLink({
      email: mergedUser.email,
      name: mergedUser.name,
      token,
    })
    const response = NextResponse.json({
      ok: true,
      email: mergedUser.email,
      authenticated: false,
      merged: true,
      emailDelivery: delivery.sent ? 'sent' : delivery.reason,
    })
    return setSessionCookieOnResponse(response, {
      uid: mergedUser.id,
      email: mergedUser.email,
      role: mergedUser.role,
      stage: 'EMAIL_PENDING',
    })
  }

  const newPassword = newPasswordSchema.safeParse(parsed.data.password)
  if (!newPassword.success) {
    return NextResponse.json(
      {
        error: newPassword.error.issues[0]?.message || 'Пароль не соответствует требованиям',
        details: newPassword.error.flatten(),
      },
      { status: 400 }
    )
  }

  const user = await prisma.user.update({
    where: { id: current.id },
    data: {
      email: parsed.data.email,
      passwordHash: await hash(newPassword.data, 12),
      agreedToTermsAt: new Date(),
    },
    select: { id: true, email: true, name: true },
  })
  const token = await createEmailVerificationToken(user.id)
  const delivery = await sendEmailVerificationLink({ email: user.email, name: user.name, token })

  const response = NextResponse.json({
    ok: true,
    email: user.email,
    authenticated: false,
    emailDelivery: delivery.sent ? 'sent' : delivery.reason,
  })
  return setSessionCookieOnResponse(response, {
    uid: user.id,
    email: user.email,
    role: 'USER',
    stage: 'EMAIL_PENDING',
  })
}
