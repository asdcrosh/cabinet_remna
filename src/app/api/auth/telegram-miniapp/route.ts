import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertSameOrigin } from '@/lib/security'
import { rateLimit } from '@/lib/rate-limit'
import { verifyTelegramMiniAppInitData } from '@/lib/telegram-auth'
import { setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { generateUniqueReferralCode } from '@/lib/referrals'
import { findRemnashopUserByTelegramId, syncLinkedTelegramUser } from '@/lib/telegram-link-sync'
import { ensureRemnashopTelegramUser } from '@/lib/remnashop-api'
import { logError, logInfo, logWarn } from '@/lib/logger'
import { findCanonicalTelegramSessionUser } from '@/lib/telegram-session'
import { mergeTechnicalTelegramAccount, TelegramAccountMergeError } from '@/lib/telegram-account-merge'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  const limited = await rateLimit(req, 'telegram-miniapp-auth', 20, 60_000)
  if (!limited.ok) {
    return NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 })
  }

  const body = (await req.json().catch(() => null)) as { initData?: unknown } | null
  if (typeof body?.initData !== 'string') {
    return NextResponse.json({ error: 'Telegram data is required' }, { status: 400 })
  }

  let telegram
  try {
    telegram = verifyTelegramMiniAppInitData(body.initData)
  } catch (error) {
    logWarn('auth.telegram_miniapp.invalid_init_data', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Telegram authentication failed' },
      { status: 401 }
    )
  }
  logInfo('auth.telegram_miniapp.verified', { telegramId: telegram.id })

  try {
    await ensureRemnashopTelegramUser(body.initData)
  } catch (error) {
    logWarn('auth.telegram_miniapp.remnashop_registration_deferred', {
      telegramId: telegram.id.toString(),
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }

  const remnashopUser = await findTelegramRemnashopUser(telegram.id)
  const remnashopEmail = remnashopUser?.email?.trim().toLowerCase() || null
  let user
  try {
    user = await prisma.user.findUnique({ where: { telegramId: telegram.id } })
    if (user && remnashopEmail && isPendingTelegramEmail(user.email)) {
      const emailUser = await prisma.user.findUnique({ where: { email: remnashopEmail } })
      if (emailUser && emailUser.id !== user.id) {
        const sourceUserId = user.id
        try {
          await mergeTechnicalTelegramAccount({
            targetUserId: emailUser.id,
            telegramId: telegram.id,
            telegramUsername: telegram.username,
            telegramName: telegram.name,
          })
          user = await prisma.user.findUnique({ where: { id: emailUser.id } })
        } catch (error) {
          if (!(error instanceof TelegramAccountMergeError)) throw error
          logWarn('auth.telegram_miniapp.merge_deferred', {
            targetUserId: emailUser.id,
            sourceUserId,
            code: error.code,
          })
        }
      }
    }
    if (!user && remnashopUser) {
      user = await prisma.user.findFirst({
        where: {
          OR: [
            { remnashopUserId: remnashopUser.id },
            ...(remnashopEmail ? [{ email: remnashopEmail }] : []),
          ],
        },
      })
    }
    if (!user) {
      const pendingEmail = `telegram-${telegram.id.toString()}@pending.invalid`
      user = await prisma.user.create({
        data: {
          email: remnashopEmail ?? pendingEmail,
          passwordHash: await hash(randomBytes(48).toString('base64url'), 12),
          name: telegram.name,
          role: 'USER',
          referralCode: await generateUniqueReferralCode(),
          telegramId: telegram.id,
          telegramUsername: telegram.username,
          telegramLinkedAt: new Date(),
          remnashopUserId: remnashopUser?.id,
          remnashopSyncedAt: remnashopUser ? new Date() : null,
          emailVerifiedAt: remnashopUser?.is_email_verified ? new Date() : null,
          ...(remnashopUser?.user_remna_id ? { remnawaveUuid: remnashopUser.user_remna_id } : {}),
        },
      })
      logInfo('auth.telegram_miniapp.user_created', {
        userId: user.id,
        telegramId: telegram.id,
      })
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          telegramId: user.telegramId ?? telegram.id,
          telegramUsername: telegram.username,
          telegramLinkedAt: user.telegramLinkedAt ?? new Date(),
          name: user.name ?? telegram.name,
          lastLoginAt: new Date(),
          remnashopUserId: user.remnashopUserId ?? remnashopUser?.id,
          remnashopSyncedAt: remnashopUser ? new Date() : user.remnashopSyncedAt,
          emailVerifiedAt: user.emailVerifiedAt ?? (remnashopUser?.is_email_verified ? new Date() : null),
          ...(remnashopUser?.user_remna_id && !user.remnawaveUuid
            ? { remnawaveUuid: remnashopUser.user_remna_id }
            : {}),
        },
      })
      logInfo('auth.telegram_miniapp.user_updated', {
        userId: user.id,
        telegramId: telegram.id,
      })
    }
  } catch (error) {
    logError('auth.telegram_miniapp.user_upsert_failed', error, {
      telegramId: telegram.id,
    })
    throw error
  }

  try {
    await syncLinkedTelegramUser({ localUserId: user.id, telegramId: telegram.id })
  } catch (error) {
    logWarn('auth.telegram_miniapp.background_sync_failed', {
      userId: user.id,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }

  const sessionUser = await findCanonicalTelegramSessionUser({
    telegramId: telegram.id,
    fallbackUserId: user.id,
  })
  if (!sessionUser) {
    logError('auth.telegram_miniapp.session_user_missing', new Error('Telegram user disappeared during sync'), {
      userId: user.id,
      telegramId: telegram.id,
    })
    return NextResponse.json(
      { error: 'Не удалось завершить вход. Откройте кабинет заново.' },
      { status: 409 }
    )
  }

  const response = NextResponse.json({
    ok: true,
    emailConfigured: Boolean(sessionUser.emailVerifiedAt),
  })
  logInfo('auth.telegram_miniapp.session_set', {
    userId: sessionUser.id,
    initialUserId: user.id,
    emailConfigured: Boolean(sessionUser.emailVerifiedAt),
  })
  return setSessionCookieOnResponse(response, {
    uid: sessionUser.id,
    email: sessionUser.email,
    role: sessionUser.role,
    stage: 'FULL',
  })
}

async function findTelegramRemnashopUser(telegramId: bigint) {
  try {
    return await findRemnashopUserByTelegramId(telegramId)
  } catch (error) {
    logWarn('auth.telegram_miniapp.remnashop_lookup_deferred', {
      telegramId: telegramId.toString(),
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return null
  }
}

function isPendingTelegramEmail(email: string) {
  return email.startsWith('telegram-') && email.endsWith('@pending.invalid')
}
