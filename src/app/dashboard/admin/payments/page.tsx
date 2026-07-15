import Link from 'next/link'
import { Download, Search } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentBadge, ProvisioningBadge } from '@/components/admin/admin-badges'
import { PaymentSyncButton, RecoveryActionButton, RemnashopPaymentRetryButton } from '@/components/admin/recovery-actions'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'
import { AdminFilterSubmitButton } from '@/components/admin/admin-filter-submit-button'
import { AdminFilterBar, AdminFilterField } from '@/components/admin/admin-filter-bar'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { describeSyncError } from '@/lib/sync-error'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Платежи — Админка' }

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; delivery?: string; from?: string; to?: string; range?: string; limit?: string }>
}) {
  await requireAdminPage()

  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const status = params.status ?? 'ALL'
  const delivery = params.delivery ?? 'ALL'
  const range = params.range ?? 'ALL'
  const { from, to } = resolveDateRange(range, params.from, params.to)
  const limit = parseAdminListLimit(params.limit)
  const where = {
    ...(status !== 'ALL' ? { status: status as any } : {}),
    ...(delivery === 'DELIVERED'
      ? { subscriptionProvisionedAt: { not: null } }
      : delivery === 'RETRY'
        ? { status: 'SUCCEEDED' as const, subscriptionProvisionedAt: null }
        : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
            { user: { name: { contains: q, mode: 'insensitive' as const } } },
            { plan: { name: { contains: q, mode: 'insensitive' as const } } },
            { yookassaId: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [total, payments, pendingCount, retryCount, succeededCount] = await prisma.$transaction([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
        plan: true,
        subscription: true,
      },
    }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.payment.count({ where: { status: 'SUCCEEDED', subscriptionProvisionedAt: null } }),
    prisma.payment.count({ where: { status: 'SUCCEEDED' } }),
  ])

  return (
    <div className="page-stack">
      <PageHeader
        title="Платежи"
        description="Все платежи, их статус и результат выдачи подписки"
        action={
          <Link href={buildPaymentsExportHref(q, status, delivery, range, params.from, params.to)} className="btn-secondary w-full sm:w-auto">
            <Download className="h-4 w-4" />
            CSV
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <PaymentStat title="Ожидают оплаты" value={pendingCount} tone="amber" />
        <PaymentStat title="Нужна довыдача" value={retryCount} tone={retryCount > 0 ? 'red' : 'slate'} />
        <PaymentStat title="Оплачено всего" value={succeededCount} tone="emerald" />
      </section>

      <AdminFilterBar
        action="/dashboard/admin/payments"
        resetHref="/dashboard/admin/payments"
        resetVisible={Boolean(q || status !== 'ALL' || delivery !== 'ALL' || range !== 'ALL' || params.from || params.to)}
        count={{ shown: payments.length, total }}
        className="md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(14rem,1fr)_10rem_12rem_10rem_9rem_9rem_auto]"
      >
        <input type="hidden" name="limit" value={ADMIN_LIST_PAGE_SIZE} />
        <AdminFilterField label="Поиск платежей">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" name="q" defaultValue={q} className="input pl-9" placeholder="Email, имя, тариф или ID" />
          </div>
        </AdminFilterField>
        <AdminFilterField label="Статус оплаты">
          <select name="status" defaultValue={status} className="input">
            <option value="ALL">Все статусы</option>
            <option value="PENDING">Ожидают оплаты</option>
            <option value="SUCCEEDED">Оплачены</option>
            <option value="CANCELED">Отменены</option>
            <option value="REFUNDED">Возвраты</option>
          </select>
        </AdminFilterField>
        <AdminFilterField label="Выдача подписки">
          <select name="delivery" defaultValue={delivery} className="input">
            <option value="ALL">Любая выдача</option>
            <option value="DELIVERED">Подписка выдана</option>
            <option value="RETRY">Нужна довыдача</option>
          </select>
        </AdminFilterField>
        <AdminFilterField label="Период">
          <select name="range" defaultValue={range} className="input">
            <option value="ALL">Всё время</option>
            <option value="TODAY">Сегодня</option>
            <option value="WEEK">Неделя</option>
            <option value="CUSTOM">Свой период</option>
          </select>
        </AdminFilterField>
        <AdminFilterField label="Дата от">
          <input name="from" defaultValue={params.from ?? ''} type="date" className="input" />
        </AdminFilterField>
        <AdminFilterField label="Дата до">
          <input name="to" defaultValue={params.to ?? ''} type="date" className="input" />
        </AdminFilterField>
        <AdminFilterSubmitButton />
      </AdminFilterBar>

      {payments.length === 0 && (
        <AdminEmptyState title="Платежи не найдены" description="Измените фильтры или сбросьте поиск." />
      )}

      <div className={payments.length > 0 ? 'table-shell hidden 2xl:block' : 'hidden'}>
        <table className="data-table min-w-[1120px]">
          <caption className="sr-only">Платежи пользователей и состояние выдачи подписки</caption>
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-surface-800">
            <tr>
              <th className="w-[150px]">Дата</th>
              <th className="w-[250px]">Пользователь</th>
              <th className="w-[130px]">Тариф</th>
              <th className="w-[130px]">Сумма</th>
              <th className="w-[110px]">Промокод</th>
              <th className="w-[120px]">Статус</th>
              <th className="w-[190px]">Выдача</th>
              <th className="sticky-actions-head w-[176px] min-w-[176px]">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {payments.map((payment) => {
              const needsRetry = payment.status === 'SUCCEEDED' && !payment.subscriptionProvisionedAt
              const needsRemnashopRetry = payment.status === 'SUCCEEDED' && Boolean(payment.subscriptionProvisionedAt) && !payment.remnashopSyncedAt
              const canCheckPayment = Boolean(payment.yookassaId) && payment.status !== 'SUCCEEDED'
              return (
                <tr key={payment.id}>
                  <td className={`border-l-4 text-slate-500 ${paymentRailClass(payment.status, needsRetry || needsRemnashopRetry)}`}>{new Date(payment.createdAt).toLocaleString('ru-RU')}</td>
                  <td>
                    <div className="max-w-[220px] truncate font-medium">{payment.user.email}</div>
                    <div className="text-xs text-slate-500">{payment.user.name || 'Без имени'}</div>
                  </td>
                  <td>{payment.plan.name}</td>
                  <td>
                    <PaymentAmount
                      amountKopecks={payment.amountKopecks}
                      originalAmountKopecks={payment.originalAmountKopecks}
                      discountKopecks={payment.discountKopecks}
                    />
                  </td>
                  <td className="text-slate-500">{getPromoCodeLabel(payment.promoCodeSnapshot)}</td>
                  <td><PaymentBadge status={payment.status} /></td>
                  <td>
                    <div className="space-y-1">
                      <ProvisioningBadge provisioned={Boolean(payment.subscriptionProvisionedAt)} />
                      {payment.provisioningError && (
                        <div className="max-w-[180px] truncate text-xs text-slate-500">{payment.provisioningError}</div>
                      )}
                      {payment.subscriptionProvisionedAt && (
                        <div
                          className={payment.remnashopSyncedAt ? 'text-xs text-emerald-600 dark:text-emerald-300' : 'max-w-[180px] truncate text-xs text-amber-600 dark:text-amber-300'}
                          title={humanSyncError(payment.remnashopSyncError)}
                        >
                          {payment.remnashopSyncedAt ? 'Remnashop синхр.' : humanSyncError(payment.remnashopSyncError)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="sticky-actions-cell w-[176px] min-w-[176px]">
                    <div className="action-row">
                      {canCheckPayment && <PaymentSyncButton paymentId={payment.id} />}
                      {needsRetry ? (
                        <RecoveryActionButton paymentId={payment.id} />
                      ) : needsRemnashopRetry ? (
                        <RemnashopPaymentRetryButton paymentId={payment.id} />
                      ) : payment.subscriptionId ? (
                        <Link href={`/dashboard/admin/users?q=${encodeURIComponent(payment.user.email)}`} className="btn-secondary min-w-[112px] px-3 text-xs">
                          Пользователь
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className={payments.length > 0 ? 'space-y-3 2xl:hidden' : 'hidden'}>
        {payments.map((payment) => {
          const needsRetry = payment.status === 'SUCCEEDED' && !payment.subscriptionProvisionedAt
          const needsRemnashopRetry = payment.status === 'SUCCEEDED' && Boolean(payment.subscriptionProvisionedAt) && !payment.remnashopSyncedAt
          const canCheckPayment = Boolean(payment.yookassaId) && payment.status !== 'SUCCEEDED'
          return (
            <article key={payment.id} className={`overflow-hidden rounded-2xl border border-l-4 bg-white shadow-sm shadow-slate-950/[0.04] dark:bg-surface-900 dark:shadow-black/20 ${paymentRailClass(payment.status, needsRetry || needsRemnashopRetry)}`}>
              <div className="border-b bg-slate-50/70 px-4 py-3 dark:bg-white/[0.03]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold">{payment.user.email}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{formatAdminPaymentDate(payment.createdAt)}</div>
                  </div>
                  <PaymentBadge status={payment.status} />
                </div>
              </div>
              <div className="space-y-3 px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Тариф</div>
                    <div className="mt-1 font-medium">{payment.plan.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-wide text-slate-400">Сумма</div>
                    <PaymentAmount
                      amountKopecks={payment.amountKopecks}
                      originalAmountKopecks={payment.originalAmountKopecks}
                      discountKopecks={payment.discountKopecks}
                      align="right"
                    />
                  </div>
                </div>
                <PaymentFlow
                  paid={payment.status === 'SUCCEEDED'}
                  provisioned={Boolean(payment.subscriptionProvisionedAt)}
                  remnashopSynced={Boolean(payment.remnashopSyncedAt)}
                />
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <AdminInfoCell label="Промокод" value={getPromoCodeLabel(payment.promoCodeSnapshot)} />
                  <AdminInfoCell label="ID платежа" value={shortId(payment.yookassaId || payment.id)} mono />
                </div>
                {(payment.provisioningError || (payment.subscriptionProvisionedAt && !payment.remnashopSyncedAt)) ? (
                  <details className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <summary className="cursor-pointer font-semibold">Технические детали</summary>
                    <div className="mt-2 space-y-1">
                      {payment.provisioningError ? <div>{payment.provisioningError}</div> : null}
                      {payment.subscriptionProvisionedAt && !payment.remnashopSyncedAt ? <div>Remnashop: {humanSyncError(payment.remnashopSyncError)}</div> : null}
                    </div>
                  </details>
                ) : null}
                <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  {canCheckPayment && <PaymentSyncButton paymentId={payment.id} />}
                  {needsRetry ? (
                    <RecoveryActionButton paymentId={payment.id} />
                  ) : needsRemnashopRetry ? (
                    <RemnashopPaymentRetryButton paymentId={payment.id} />
                  ) : payment.subscriptionId ? (
                    <Link href={`/dashboard/admin/users?q=${encodeURIComponent(payment.user.email)}`} className="btn-secondary min-w-[112px] px-3 text-xs">
                      Пользователь
                    </Link>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <LazyListLoader loaded={payments.length} total={total} step={ADMIN_LIST_PAGE_SIZE} />
    </div>
  )
}

function PaymentFlow({ paid, provisioned, remnashopSynced }: { paid: boolean; provisioned: boolean; remnashopSynced: boolean }) {
  const steps = [
    { label: 'Оплата', done: paid },
    { label: 'Выдача', done: provisioned },
    { label: 'Remnashop', done: remnashopSynced },
  ]

  return (
    <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
      {steps.map((step, index) => (
        <div key={step.label} className={`relative px-2 py-2 text-center text-xs font-medium ${step.done ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200' : 'bg-slate-50 text-slate-400 dark:bg-white/[0.03]'}`}>
          {index > 0 ? <span className="absolute inset-y-2 left-0 w-px bg-slate-200 dark:bg-white/10" /> : null}
          {step.label}
        </div>
      ))}
    </div>
  )
}

function paymentRailClass(status: string, requiresAttention: boolean) {
  if (requiresAttention) return 'border-l-red-500'
  if (status === 'SUCCEEDED') return 'border-l-emerald-500'
  if (status === 'PENDING') return 'border-l-amber-400'
  return 'border-l-slate-300 dark:border-l-slate-600'
}

function humanSyncError(value: string | null) {
  if (!value) return 'Remnashop ждёт sync'
  return describeSyncError(new Error(value))
}

function resolveDateRange(range: string, fromRaw?: string, toRaw?: string) {
  const now = new Date()
  if (range === 'TODAY') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return { from: start, to: end }
  }
  if (range === 'WEEK') {
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    start.setHours(0, 0, 0, 0)
    return { from: start, to: now }
  }
  return {
    from: parseDateInput(fromRaw, 'start'),
    to: parseDateInput(toRaw, 'end'),
  }
}

function parseDateInput(value: string | undefined, edge: 'start' | 'end') {
  if (!value) return null
  const date = new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}`)
  return Number.isNaN(date.getTime()) ? null : date
}

function buildPaymentsExportHref(q: string, status: string, delivery: string, range: string, from?: string, to?: string) {
  const params = new URLSearchParams({ format: 'csv' })
  if (q) params.set('q', q)
  if (status !== 'ALL') params.set('status', status)
  if (delivery !== 'ALL') params.set('delivery', delivery)
  if (range !== 'ALL') params.set('range', range)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  return `/api/admin/payments?${params.toString()}`
}

function PaymentStat({ title, value, tone }: { title: string; value: number; tone: 'amber' | 'emerald' | 'red' | 'slate' }) {
  const toneClass = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100',
    red: 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-100',
    slate: 'border-slate-200 bg-white text-slate-900 dark:border-white/10 dark:bg-surface-900 dark:text-white',
  }[tone]

  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <div className="text-sm opacity-75">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  )
}

function AdminInfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="info-cell">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={mono ? 'mt-1 truncate font-mono text-xs' : 'mt-1 truncate font-medium'}>{value}</div>
    </div>
  )
}

function PaymentAmount({
  amountKopecks,
  originalAmountKopecks,
  discountKopecks,
  align = 'left',
}: {
  amountKopecks: number
  originalAmountKopecks: number | null
  discountKopecks: number
  align?: 'left' | 'right'
}) {
  const hasDiscount = discountKopecks > 0 && originalAmountKopecks != null

  return (
    <div className={align === 'right' ? 'mt-1 text-right' : undefined}>
      <div className="font-medium">{formatPrice(amountKopecks)}</div>
      {hasDiscount && (
        <div className="text-xs text-slate-400">
          <span className="line-through">{formatPrice(originalAmountKopecks)}</span>
          <span className="ml-1 text-emerald-600">-{formatPrice(discountKopecks)}</span>
        </div>
      )}
    </div>
  )
}

function getPromoCodeLabel(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return '—'
  const code = (snapshot as { code?: unknown }).code
  return typeof code === 'string' && code ? code : '—'
}

function formatAdminPaymentDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}
