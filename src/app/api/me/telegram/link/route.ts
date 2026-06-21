import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import {
  getTelegramDisplayName,
  verifyTelegramAuthPayload,
  type TelegramAuthPayload,
} from '@/lib/telegram-auth'
import { syncLinkedTelegramUser } from '@/lib/telegram-link-sync'

export const runtime = 'nodejs'

export const POST = withAuth(async (req: Request) => {
  const session = await requireAuth()

  let payload: TelegramAuthPayload
  try {
    payload = (await req.json()) as TelegramAuthPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const verified = verifyTelegramAuthPayload(payload)
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 400 })
  }

  const telegramId = BigInt(payload.id)
  const currentUser = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { id: true, emailVerifiedAt: true },
  })
  if (!currentUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!currentUser.emailVerifiedAt) {
    return NextResponse.json({ error: 'Сначала подтвердите email' }, { status: 403 })
  }

  const existingTelegramOwner = await prisma.user.findUnique({
    where: { telegramId },
    select: { id: true },
  })
  if (existingTelegramOwner && existingTelegramOwner.id !== session.uid) {
    return NextResponse.json({ error: 'Этот Telegram уже привязан к другому аккаунту' }, { status: 409 })
  }

  await prisma.user.update({
    where: { id: session.uid },
    data: {
      telegramId,
      telegramUsername: payload.username ?? null,
      telegramLinkedAt: new Date(),
      name: getTelegramDisplayName(payload) ?? undefined,
    },
  })

  try {
    const sync = await syncLinkedTelegramUser({
      localUserId: session.uid,
      telegramId,
    })

    return NextResponse.json({
      ok: true,
      telegram: {
        id: telegramId.toString(),
        username: payload.username ?? null,
      },
      sync,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Telegram linked, sync failed'
    await prisma.user.update({
      where: { id: session.uid },
      data: { remnashopSyncedAt: new Date() },
    })
    return NextResponse.json(
      {
        ok: true,
        telegram: {
          id: telegramId.toString(),
          username: payload.username ?? null,
        },
        sync: {
          foundRemnashopUser: null,
          syncedRemnawave: false,
          error: message,
        },
      },
      { status: 202 }
    )
  }
})
