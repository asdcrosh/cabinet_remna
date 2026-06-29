import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { remnawave } from '@/lib/remnawave'
import { upsertLocalSubscriptionFromRemnawave } from '@/lib/remnawave-local-sync'
import { syncLinkedTelegramUser } from '@/lib/telegram-link-sync'
import { syncCabinetPaymentToRemnashopBestEffort } from '@/lib/remnashop-reverse-sync'
import { writeAuditLog } from '@/lib/audit-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = withAuth(async (req: Request, { params }: { params: { id: string } }) => {
  const session = await requireAdmin()
  const [actor, user] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.uid }, select: { role: true } }),
    prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        role: true,
        telegramId: true,
        remnawaveUuid: true,
        remnawaveUsername: true,
      },
    }),
  ])

  if (!actor || !user) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }
  if (user.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Синхронизировать главного администратора нельзя' }, { status: 403 })
  }

  const result = {
    telegram: false,
    remnawave: false,
    remnashopPayments: 0,
    warnings: [] as string[],
  }

  if (user.telegramId) {
    try {
      await syncLinkedTelegramUser({ localUserId: user.id, telegramId: user.telegramId })
      result.telegram = true
    } catch (error) {
      result.warnings.push(`Telegram/Remnashop: ${error instanceof Error ? error.message : 'ошибка синхронизации'}`)
    }
  }

  try {
    const remnawaveUser = user.remnawaveUuid
      ? (await remnawave.getUserByUuid(user.remnawaveUuid)).response
      : user.remnawaveUsername
        ? (await remnawave.getUserByUsername(user.remnawaveUsername)).response
        : null

    if (remnawaveUser) {
      await upsertLocalSubscriptionFromRemnawave({
        localUserId: user.id,
        remnawaveUser,
      })
      result.remnawave = true
    }
  } catch (error) {
    result.warnings.push(`Remnawave: ${error instanceof Error ? error.message : 'ошибка синхронизации'}`)
  }

  const payments = await prisma.payment.findMany({
    where: {
      userId: user.id,
      status: 'SUCCEEDED',
      subscriptionProvisionedAt: { not: null },
    },
    orderBy: { paidAt: 'desc' },
    take: 10,
    select: { id: true },
  })

  for (const payment of payments) {
    const sync = await syncCabinetPaymentToRemnashopBestEffort(payment.id)
    if (sync.ok) result.remnashopPayments += 1
  }

  await writeAuditLog({
    actorId: session.uid,
    targetId: user.id,
    action: 'ADMIN_PROFILE_UPDATED',
    message: 'Администратор запустил ручную синхронизацию пользователя',
    metadata: result,
    request: req,
  })

  return NextResponse.json({ ok: true, result })
})
