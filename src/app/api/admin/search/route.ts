import { jsonResponse } from '@/lib/json-response'
import { prisma } from '@/lib/prisma'
import { requireAdmin, withAuth } from '@/lib/auth/guard'
import { buildAdminUserSearchFilters } from '@/lib/admin-user-search'
import {
  ADMIN_SEARCH_RESULT_LIMIT,
  buildAdminPaymentSearchFilters,
  formatAdminUserLabel,
  normalizeAdminSearchQuery,
  pickAdminUserSubscription,
} from '@/lib/admin-search'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

export const GET = withAuth(async (req: Request) => {
  await requireAdmin()

  const q = normalizeAdminSearchQuery(new URL(req.url).searchParams.get('q'))
  if (!q) {
    return jsonResponse({ users: [], payments: [] }, { headers: NO_STORE })
  }

  const [users, payments] = await Promise.all([
    prisma.user.findMany({
      where: { OR: buildAdminUserSearchFilters(q) },
      orderBy: { createdAt: 'desc' },
      take: ADMIN_SEARCH_RESULT_LIMIT,
      select: {
        id: true,
        email: true,
        name: true,
        telegramId: true,
        telegramUsername: true,
        subscriptions: {
          orderBy: { expireAt: 'desc' },
          take: 5,
          select: {
            status: true,
            expireAt: true,
            plan: { select: { name: true } },
          },
        },
      },
    }),
    prisma.payment.findMany({
      where: { OR: buildAdminPaymentSearchFilters(q) },
      orderBy: { createdAt: 'desc' },
      take: ADMIN_SEARCH_RESULT_LIMIT,
      select: {
        id: true,
        amountKopecks: true,
        status: true,
        provider: true,
        createdAt: true,
        userId: true,
        user: { select: { email: true, telegramId: true, telegramUsername: true } },
        plan: { select: { name: true } },
      },
    }),
  ])

  const now = new Date()

  return jsonResponse({
    users: users.map((user) => {
      const subscription = pickAdminUserSubscription(user.subscriptions, now)
      return {
        id: user.id,
        label: formatAdminUserLabel(user),
        email: user.email,
        name: user.name,
        telegramUsername: user.telegramUsername,
        planName: subscription?.plan?.name ?? null,
        subscriptionStatus: subscription?.status ?? null,
        expireAt: subscription?.expireAt.toISOString() ?? null,
      }
    }),
    payments: payments.map((payment) => ({
      id: payment.id,
      amountKopecks: payment.amountKopecks,
      status: payment.status,
      provider: payment.provider,
      createdAt: payment.createdAt.toISOString(),
      userId: payment.userId,
      userLabel: formatAdminUserLabel(payment.user),
      planName: payment.plan.name,
    })),
  }, { headers: NO_STORE })
})
