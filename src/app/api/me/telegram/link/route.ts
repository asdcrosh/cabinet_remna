import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import {
  getTelegramDisplayName,
  verifyTelegramAuthPayload,
  type TelegramAuthPayload,
} from '@/lib/telegram-auth'
import { attachRemnashopIdentityToCabinetUser } from '@/lib/telegram-link-sync'
import {
  mergeTechnicalTelegramAccount,
  TelegramAccountMergeError,
} from '@/lib/telegram-account-merge'

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

  try {
    await mergeTechnicalTelegramAccount({
      targetUserId: session.uid,
      telegramId,
      telegramUsername: payload.username ?? null,
      telegramName: getTelegramDisplayName(payload),
    })
  } catch (error) {
    if (error instanceof TelegramAccountMergeError) {
      return NextResponse.json(
        {
          error:
            error.code === 'TELEGRAM_ALREADY_LINKED'
              ? 'Этот Telegram принадлежит другому полноценному аккаунту'
              : 'Не удалось безопасно объединить профили',
        },
        { status: 409 }
      )
    }
    throw error
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
    const remnashopUser = await attachRemnashopIdentityToCabinetUser({
      localUserId: session.uid,
      telegramId,
    })

    return NextResponse.json({
      ok: true,
      telegram: {
        id: telegramId.toString(),
        username: payload.username ?? null,
      },
      sync: {
        foundRemnashopUser: Boolean(remnashopUser),
        remnashopUserId: remnashopUser?.id ?? null,
        pending: Boolean(remnashopUser?.user_remna_id),
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Telegram linked, sync failed'
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
