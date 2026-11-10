// GET /api/subscription/keys — публичная для пользователя ссылка подписки.
// Отдельные протокольные ключи не отдаём в кабинет.

import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { requireAuth, withAuth } from '@/lib/auth/guard'
import { remnawave, RemnawaveError } from '@/lib/remnawave'
import { isMobileSession } from '@/lib/auth/jwt'
import { mobileEmailDeadline } from '@/lib/auth/mobile-email-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withAuth(async () => {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.uid } })
  const deadline = user && isMobileSession(session) ? mobileEmailDeadline(user) : null
  const emailAccess = () => deadline ? { mobileEmailDeadline: deadline, serverTime: new Date() } : {}
  if (deadline && deadline.getTime() <= Date.now()) return jsonResponse({ keys: null, ...emailAccess() })
  if (!user?.remnawaveUsername) {
    return jsonResponse({ keys: null, message: 'Нет активной подписки', ...emailAccess() })
  }

  try {
    const data = await remnawave.getSubscriptionByUsername(user.remnawaveUsername)
    if (deadline && deadline.getTime() <= Date.now()) return jsonResponse({ keys: null, ...emailAccess() })
    return jsonResponse({
      ...emailAccess(),
      keys: {
        subscriptionUrl: data.response.subscriptionUrl,
      },
      // Состояние подписки (для UI)
      status: {
        isActive: data.response.user.isActive,
        userStatus: data.response.user.userStatus,
        daysLeft: data.response.user.daysLeft,
        trafficUsed: data.response.user.trafficUsed,
        trafficLimit: data.response.user.trafficLimit,
        expiresAt: data.response.user.expiresAt,
      },
    })
  } catch (e) {
    if (e instanceof RemnawaveError) {
      return jsonResponse(
        {
          error: 'Не удалось загрузить ключи. Попробуйте позже.',
          details: process.env.NODE_ENV === 'development' ? e.body : undefined,
        },
        { status: 502 }
      )
    }
    throw e
  }
})
