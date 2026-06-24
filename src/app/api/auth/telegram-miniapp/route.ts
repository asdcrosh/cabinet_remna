import { randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { assertSameOrigin } from '@/lib/security'
import { rateLimit } from '@/lib/rate-limit'
import { verifyTelegramMiniAppInitData } from '@/lib/telegram-auth'
import { setSessionCookieOnResponse } from '@/lib/auth/cookies'
import { generateUniqueReferralCode } from '@/lib/referrals'
import { syncLinkedTelegramUser } from '@/lib/telegram-link-sync'

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Telegram authentication failed' },
      { status: 401 }
    )
  }

  let user = await prisma.user.findUnique({ where: { telegramId: telegram.id } })
  if (!user) {
    const pendingEmail = `telegram-${telegram.id.toString()}@pending.invalid`
    user = await prisma.user.create({
      data: {
        email: pendingEmail,
        passwordHash: await hash(randomBytes(48).toString('base64url'), 12),
        name: telegram.name,
        role: 'USER',
        referralCode: await generateUniqueReferralCode(),
        telegramId: telegram.id,
        telegramUsername: telegram.username,
        telegramLinkedAt: new Date(),
      },
    })
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        telegramUsername: telegram.username,
        telegramLinkedAt: user.telegramLinkedAt ?? new Date(),
        name: user.name ?? telegram.name,
        lastLoginAt: new Date(),
      },
    })
  }

  try {
    await syncLinkedTelegramUser({ localUserId: user.id, telegramId: telegram.id })
  } catch (error) {
    console.warn('[telegram-miniapp] background sync failed', {
      userId: user.id,
      message: error instanceof Error ? error.message : 'unknown error',
    })
  }

  const response = NextResponse.json({
    ok: true,
    emailConfigured: Boolean(user.emailVerifiedAt),
  })
  return setSessionCookieOnResponse(response, {
    uid: user.id,
    email: user.email,
    role: user.role,
    stage: 'FULL',
  })
}
