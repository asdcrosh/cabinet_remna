import Link from 'next/link'
import { Search } from 'lucide-react'
import type { Prisma } from '@prisma/client'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { AdminFilterBar, AdminFilterField } from '@/components/admin/admin-filter-bar'
import { AdminPageShell } from '@/components/admin/admin-page-shell'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Белые списки — Админка' }

const DAY_MS = 24 * 60 * 60 * 1000

export default async function AdminWhitelistAddonsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; limit?: string }>
}) {
  await requireAdminPage()
  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const status = params.status ?? 'ALL'
  const source = params.source ?? 'ALL'
  const limit = parseAdminListLimit(params.limit)
  const now = new Date()
  const expiringBefore = new Date(now.getTime() + 3 * DAY_MS)

  const accessExists: Prisma.SubscriptionWhereInput = {
    OR: [
      { whitelistAddonActivatedAt: { not: null } },
      { whitelistAddonExpireAt: { not: null } },
      { whitelistAddonRemainingSeconds: { gt: 0n } },
      { whitelistAddonPaymentId: { not: null } },
    ],
  }
  const where: Prisma.SubscriptionWhereInput = {
    AND: [
      accessExists,
      ...(status === 'ACTIVE'
        ? [{ whitelistAddonActive: true, whitelistAddonExpireAt: { gt: expiringBefore } }]
        : status === 'EXPIRING'
          ? [{ whitelistAddonActive: true, whitelistAddonExpireAt: { gt: now, lte: expiringBefore } }]
          : status === 'PAUSED'
            ? [{ whitelistAddonActive: false, whitelistAddonRemainingSeconds: { gt: 0n } }]
          : status === 'EXPIRED'
            ? [{
                AND: [
                  { OR: [{ whitelistAddonActive: false }, { whitelistAddonExpireAt: { lte: now } }] },
                  { OR: [{ whitelistAddonRemainingSeconds: null }, { whitelistAddonRemainingSeconds: { lte: 0n } }] },
                ],
              }]
            : []),
      ...(source === 'PURCHASED'
        ? [{ whitelistAddonPaymentId: { not: null } }]
        : source === 'MANUAL'
          ? [{ whitelistAddonPaymentId: null }]
          : []),
      ...(q
        ? [{
            user: {
              OR: [
                { email: { contains: q, mode: 'insensitive' as const } },
                { name: { contains: q, mode: 'insensitive' as const } },
                { remnawaveUsername: { contains: q, mode: 'insensitive' as const } },
              ],
            },
          }]
        : []),
    ],
  }

  const [total, subscriptions, activeCount, expiringCount, pausedCount, expiredCount, purchasedCount] = await prisma.$transaction([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      orderBy: [{ whitelistAddonExpireAt: 'asc' }, { whitelistAddonActivatedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        whitelistAddonActive: true,
        whitelistAddonActivatedAt: true,
        whitelistAddonExpireAt: true,
        whitelistAddonPausedAt: true,
        whitelistAddonRemainingSeconds: true,
        whitelistAddonPaymentId: true,
        user: { select: { id: true, email: true, name: true, telegramUsername: true, remnawaveUsername: true } },
        plan: { select: { name: true } },
      },
    }),
    prisma.subscription.count({ where: { ...accessExists, whitelistAddonActive: true, whitelistAddonExpireAt: { gt: now } } }),
    prisma.subscription.count({ where: { ...accessExists, whitelistAddonActive: true, whitelistAddonExpireAt: { gt: now, lte: expiringBefore } } }),
    prisma.subscription.count({ where: { ...accessExists, whitelistAddonActive: false, whitelistAddonRemainingSeconds: { gt: 0n } } }),
    prisma.subscription.count({
      where: {
        AND: [
          accessExists,
          { OR: [{ whitelistAddonActive: false }, { whitelistAddonExpireAt: { lte: now } }] },
          { OR: [{ whitelistAddonRemainingSeconds: null }, { whitelistAddonRemainingSeconds: { lte: 0n } }] },
        ],
      },
    }),
    prisma.subscription.count({ where: { whitelistAddonPaymentId: { not: null } } }),
  ])

  return (
    <AdminPageShell title="Белые списки" description="Покупки, ручные выдачи и сроки расширенного доступа">
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5" aria-label="Состояние белых списков">
        <StatusCard title="Активны" value={activeCount} tone="emerald" href="/dashboard/admin/whitelist-addons?status=ACTIVE" />
        <StatusCard title="Истекают за 3 дня" value={expiringCount} tone="amber" href="/dashboard/admin/whitelist-addons?status=EXPIRING" />
        <StatusCard title="На паузе" value={pausedCount} tone="cyan" href="/dashboard/admin/whitelist-addons?status=PAUSED" />
        <StatusCard title="Истекли" value={expiredCount} tone="slate" href="/dashboard/admin/whitelist-addons?status=EXPIRED" />
        <StatusCard title="Куплены" value={purchasedCount} tone="cyan" href="/dashboard/admin/whitelist-addons?source=PURCHASED" />
      </section>

      <AdminFilterBar
        action="/dashboard/admin/whitelist-addons"
        resetHref="/dashboard/admin/whitelist-addons"
        resetVisible={Boolean(q || status !== 'ALL' || source !== 'ALL')}
        count={{ shown: subscriptions.length, total }}
        className="md:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto]"
      >
        <input type="hidden" name="limit" value={ADMIN_LIST_PAGE_SIZE} />
        <AdminFilterField label="Поиск">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="q" type="search" defaultValue={q} className="input pl-9" placeholder="Email, имя или Remnawave" />
          </div>
        </AdminFilterField>
        <AdminFilterField label="Статус">
          <select name="status" defaultValue={status} className="input">
            <option value="ALL">Все статусы</option>
            <option value="ACTIVE">Активные</option>
            <option value="EXPIRING">Истекают за 3 дня</option>
            <option value="PAUSED">На паузе</option>
            <option value="EXPIRED">Истекшие</option>
          </select>
        </AdminFilterField>
        <AdminFilterField label="Источник">
          <select name="source" defaultValue={source} className="input">
            <option value="ALL">Все выдачи</option>
            <option value="PURCHASED">Покупка</option>
            <option value="MANUAL">Выдано вручную</option>
          </select>
        </AdminFilterField>
      </AdminFilterBar>

      {subscriptions.length === 0 ? (
        <AdminEmptyState title="Выдачи БС не найдены" description="Измените фильтры или сбросьте поиск." />
      ) : null}

      <div className={subscriptions.length > 0 ? 'admin-list' : 'hidden'}>
        <div className="admin-list-header grid-cols-[minmax(16rem,1.3fr)_11rem_13rem_minmax(12rem,.8fr)_auto] items-center gap-5">
          <span>Пользователь</span>
          <span>Источник</span>
          <span>Статус</span>
          <span>Тариф</span>
          <span className="text-right">Действие</span>
        </div>
        {subscriptions.map((subscription) => {
          const currentStatus = addonStatus(subscription, now, expiringBefore)
          return (
            <article key={subscription.id} className="admin-list-row">
              <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(16rem,1.3fr)_11rem_13rem_minmax(12rem,.8fr)_auto] lg:items-center lg:gap-5">
                <div className="min-w-0">
                  <div className="break-words text-sm font-semibold">{subscription.user.email}</div>
                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{subscription.user.name || 'Без имени'}</span>
                    {subscription.user.telegramUsername ? <span>@{subscription.user.telegramUsername}</span> : null}
                    {subscription.user.remnawaveUsername ? <span>{subscription.user.remnawaveUsername}</span> : null}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium">{subscription.whitelistAddonPaymentId ? 'Покупка' : 'Ручная выдача'}</div>
                  <div className="mt-1 text-xs text-slate-500">{subscription.whitelistAddonActivatedAt ? formatDateTime(subscription.whitelistAddonActivatedAt) : 'Дата не записана'}</div>
                </div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(currentStatus)}`}>
                    {statusLabel(currentStatus)}
                  </span>
                  <div className="mt-1 text-xs text-slate-500">
                    {subscription.whitelistAddonRemainingSeconds && subscription.whitelistAddonRemainingSeconds > 0n
                      ? `осталось ${formatRemaining(subscription.whitelistAddonRemainingSeconds)}`
                      : subscription.whitelistAddonExpireAt
                        ? `до ${formatDateTime(subscription.whitelistAddonExpireAt)}`
                        : 'Без даты окончания'}
                  </div>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">{subscription.plan?.name || 'Без тарифа'}</div>
                <div className="flex flex-col gap-2 lg:items-end">
                  <Link href={`/dashboard/admin/users?q=${encodeURIComponent(subscription.user.email)}`} className="btn-secondary w-full px-3 text-xs lg:w-auto">
                    Пользователь
                  </Link>
                  {subscription.whitelistAddonPaymentId ? (
                    <Link href={`/dashboard/admin/payments?q=${encodeURIComponent(subscription.whitelistAddonPaymentId)}`} className="text-xs font-medium text-brand-600 hover:underline">
                      Открыть платёж
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <LazyListLoader loaded={subscriptions.length} total={total} step={ADMIN_LIST_PAGE_SIZE} />
    </AdminPageShell>
  )
}

type AddonStatus = 'ACTIVE' | 'EXPIRING' | 'PAUSED' | 'EXPIRED'

function addonStatus(
  subscription: {
    whitelistAddonActive: boolean
    whitelistAddonExpireAt: Date | null
    whitelistAddonRemainingSeconds: bigint | null
  },
  now: Date,
  expiringBefore: Date
): AddonStatus {
  if (subscription.whitelistAddonRemainingSeconds && subscription.whitelistAddonRemainingSeconds > 0n) return 'PAUSED'
  if (!subscription.whitelistAddonActive || !subscription.whitelistAddonExpireAt || subscription.whitelistAddonExpireAt <= now) return 'EXPIRED'
  if (subscription.whitelistAddonExpireAt <= expiringBefore) return 'EXPIRING'
  return 'ACTIVE'
}

function statusLabel(status: AddonStatus) {
  if (status === 'ACTIVE') return 'Активен'
  if (status === 'EXPIRING') return 'Истекает'
  if (status === 'PAUSED') return 'На паузе'
  return 'Истёк'
}

function statusClass(status: AddonStatus) {
  if (status === 'ACTIVE') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
  if (status === 'EXPIRING') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
  if (status === 'PAUSED') return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200'
  return 'bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-300'
}

function formatDateTime(date: Date) {
  return date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' })
}

function formatRemaining(seconds: bigint) {
  const days = Math.max(1, Math.ceil(Number(seconds) / (24 * 60 * 60)))
  return `${days} дн.`
}

function StatusCard({
  title,
  value,
  tone,
  href,
}: {
  title: string
  value: number
  tone: 'emerald' | 'amber' | 'slate' | 'cyan'
  href: string
}) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-200',
    amber: 'border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-200',
    slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200',
    cyan: 'border-cyan-200 bg-cyan-50/70 text-cyan-800 dark:border-cyan-400/20 dark:bg-cyan-400/[0.06] dark:text-cyan-200',
  }
  return (
    <Link href={href} className={`rounded-2xl border p-3 transition hover:-translate-y-0.5 ${tones[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{title}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </Link>
  )
}
