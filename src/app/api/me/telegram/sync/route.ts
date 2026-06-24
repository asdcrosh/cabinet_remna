import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { syncLinkedTelegramUser } from '@/lib/telegram-link-sync'

export const runtime = 'nodejs'

export const POST = withAuth(async () => {
  const session = await requireAuth()

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    select: {
      id: true,
      telegramId: true,
    },
  })

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!user.telegramId) {
    return NextResponse.json({ error: 'Telegram не привязан' }, { status: 409 })
  }

  try {
    const sync = await syncLinkedTelegramUser({
      localUserId: user.id,
      telegramId: user.telegramId,
    })

    return NextResponse.json({ ok: true, sync })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error('[telegram/sync] failed', {
      userId: user.id,
      telegramId: user.telegramId.toString(),
      message,
    })

    return NextResponse.json(
      { error: 'Синхронизация временно недоступна. Проверьте логи приложения.' },
      { status: 502 }
    )
  }
})
