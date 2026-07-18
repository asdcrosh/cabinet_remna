import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { compare, hash } from 'bcryptjs'
import { getSession, setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { prisma } from '@/lib/prisma'
import { assertSameOrigin } from '@/lib/security'
import { rateLimit } from '@/lib/rate-limit'
import { newPasswordSchema, telegramMiniAppEmailSchema } from '@/lib/auth/validation'
import { createEmailVerificationToken, sendEmailVerificationLink } from '@/lib/email-verification'
import { syncLinkedTelegramUser } from '@/lib/telegram-link-sync'
import { logInfo, logWarn } from '@/lib/logger'
import {
  mergeTechnicalTelegramAccount,
  TelegramAccountMergeError,
} from '@/lib/telegram-account-merge'
import { findCanonicalTelegramSessionUser } from '@/lib/telegram-session'
import { PERSONAL_DATA_CONSENT_VERSION, TERMS_VERSION } from '@/lib/legal'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const session = await getSession()
  if (!session) {
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
      logWarn('auth.telegram_email.merge_password_mismatch', {
        currentUserId: current.id,
        targetUserId: emailOwner.id,
      })
      return NextResponse.json(
        { error: 'Не удалось подтвердить email или пароль.' },
        { status: 401 }
      )
    }
    try {
      await mergeTechnicalTelegramAccount({
        targetUserId: emailOwner.id,
        telegramId: current.telegramId,
        telegramUsername: current.telegramUsername,
        telegramName: current.name,
      })
    } catch (error) {
      if (error instanceof TelegramAccountMergeError) {
        logWarn('auth.telegram_email.merge_rejected', {
          currentUserId: current.id,
          targetUserId: emailOwner.id,
          code: error.code,
        })
        return NextResponse.json(
          {
            error:
              error.code === 'PRIVILEGED_SOURCE'
                ? 'Этот Telegram привязан к аккаунту администратора или модератора. Обратитесь в поддержку.'
                : 'Telegram-профиль содержит данные, которые нельзя объединить автоматически.',
            code: error.code,
          },
          { status: 409 }
        )
      }
      throw error
    }

    const mergedUser = await prisma.user.update({
      where: { id: emailOwner.id },
      data: {
        agreedToTermsAt: new Date(),
        agreedToTermsVersion: TERMS_VERSION,
        personalDataConsentAt: new Date(),
        personalDataConsentVersion: PERSONAL_DATA_CONSENT_VERSION,
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
    logInfo('auth.telegram_email.accounts_merged', {
      sourceUserId: current.id,
      targetUserId: mergedUser.id,
      verified: Boolean(mergedUser.emailVerifiedAt),
    })

    if (mergedUser.emailVerifiedAt) {
      try {
        await syncLinkedTelegramUser({
          localUserId: mergedUser.id,
          telegramId: mergedUser.telegramId!,
        })
      } catch {
        logWarn('auth.telegram_email.merge_sync_failed', {
          userId: mergedUser.id,
        })
      }

      const sessionUser = await findCanonicalTelegramSessionUser({
        telegramId: mergedUser.telegramId!,
        fallbackUserId: mergedUser.id,
      })
      if (!sessionUser) {
        return NextResponse.json({ error: 'Не удалось завершить объединение аккаунтов' }, { status: 409 })
      }
      const response = NextResponse.json({
        ok: true,
        email: sessionUser.email,
        authenticated: true,
        merged: true,
      })
      return setSessionCookieOnResponse(response, {
        uid: sessionUser.id,
        email: sessionUser.email,
        role: sessionUser.role,
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
      stage: 'FULL',
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

  let user: { id: string; email: string; name: string | null }
  try {
    user = await prisma.user.update({
      where: { id: current.id },
      data: {
        email: parsed.data.email,
        passwordHash: await hash(newPassword.data, 12),
        agreedToTermsAt: new Date(),
        agreedToTermsVersion: TERMS_VERSION,
        personalDataConsentAt: new Date(),
        personalDataConsentVersion: PERSONAL_DATA_CONSENT_VERSION,
      },
      select: { id: true, email: true, name: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Не удалось подтвердить email или пароль.' },
        { status: 401 }
      )
    }
    throw error
  }
  logInfo('auth.telegram_email.email_attached', { userId: user.id })
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
    stage: 'FULL',
  })
}
