import Link from 'next/link'
import { Download, Search } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentBadge } from '@/components/admin/admin-badges'
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
        description="Оплаты и выдача подписок"
        action={
          <Link href={buildPaymentsExportHref(q, status, delivery, range, params.from, params.to)} className="btn-secondary w-full sm:w-auto">
            <Download className="h-4 w-4" />
            CSV
          </Link>
        }
      />

      <section className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white divide-x divide-slate-200 dark:border-white/10 dark:bg-white/[0.025] dark:divide-white/10">
        <PaymentStat title="Ожидают" value={pendingCount} tone="amber" href="/dashboard/admin/payments?status=PENDING" />
        <PaymentStat title="Довыдача" value={retryCount} tone={retryCount > 0 ? 'red' : 'slate'} href="/dashboard/admin/payments?delivery=RETRY" />
        <PaymentStat title="Оплачено" value={succeededCount} tone="emerald" href="/dashboard/admin/payments?status=SUCCEEDED" />
      </section>

      <AdminFilterBar
        action="/dashboard/admin/payments"
        resetHref="/dashboard/admin/payments"
        resetVisible={Boolean(q || status !== 'ALL' || delivery !== 'ALL' || range !== 'ALL' || params.from || params.to)}
        count={{ shown: payments.length, total }}
        className="md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_11rem_12rem_10rem_auto]"
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
        {range === 'CUSTOM' ? (
          <>
            <AdminFilterField label="Дата от">
              <input name="from" defaultValue={params.from ?? ''} type="date" className="input" />
            </AdminFilterField>
            <AdminFilterField label="Дата до">
              <input name="to" defaultValue={params.to ?? ''} type="date" className="input" />
            </AdminFilterField>
          </>
        ) : null}
        <AdminFilterSubmitButton />
      </AdminFilterBar>

      {payments.length === 0 && (
        <AdminEmptyState title="Платежи не найдены" description="Измените фильтры или сбросьте поиск." />
      )}

      <div className={payments.length > 0 ? 'admin-list' : 'hidden'}>
        <div className="admin-list-header grid-cols-[minmax(15rem,1.2fr)_minmax(9rem,.65fr)_minmax(15rem,1fr)_auto] items-center gap-4">
          <span>Покупатель</span>
          <span>Тариф и сумма</span>
          <span>Обработка</span>
          <span className="text-right">Действие</span>
        </div>
        {payments.map((payment) => {
          const needsRetry = payment.status === 'SUCCEEDED' && !payment.subscriptionProvisionedAt
          const needsRemnashopRetry = payment.status === 'SUCCEEDED' && Boolean(payment.subscriptionProvisionedAt) && !payment.remnashopSyncedAt
          const canCheckPayment = Boolean(payment.yookassaId) && payment.status !== 'SUCCEEDED'
          const action = canCheckPayment ? (
            <PaymentSyncButton paymentId={payment.id} />
          ) : needsRetry ? (
            <RecoveryActionButton paymentId={payment.id} />
          ) : needsRemnashopRetry ? (
            <RemnashopPaymentRetryButton paymentId={payment.id} />
          ) : (
            <Link href={`/dashboard/admin/users?q=${encodeURIComponent(payment.user.email)}`} className="btn-secondary min-w-[112px] px-3 text-xs">
              Пользователь
            </Link>
          )
          return (
            <article key={payment.id} className={`admin-list-row overflow-hidden ${paymentAttentionClass(needsRetry || needsRemnashopRetry)}`}>
              <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(15rem,1.2fr)_minmax(9rem,.65fr)_minmax(15rem,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold">{payment.user.email}</div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>{formatAdminPaymentDate(payment.createdAt)}</span>
                      <span className="font-mono">{shortId(payment.yookassaId || payment.id)}</span>
                    </div>
                  </div>
                  <div className="lg:mt-2"><PaymentBadge status={payment.status} /></div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{payment.plan.name}</div>
                  <PaymentAmount
                    amountKopecks={payment.amountKopecks}
                    originalAmountKopecks={payment.originalAmountKopecks}
                    discountKopecks={payment.discountKopecks}
                  />
                  {getPromoCodeLabel(payment.promoCodeSnapshot) !== '—' ? (
                    <div className="mt-1 text-xs text-slate-500">Промокод {getPromoCodeLabel(payment.promoCodeSnapshot)}</div>
                  ) : null}
                </div>
                <div className="min-w-0 space-y-2">
                  <PaymentFlow
                    paid={payment.status === 'SUCCEEDED'}
                    provisioned={Boolean(payment.subscriptionProvisionedAt)}
                    remnashopSynced={Boolean(payment.remnashopSyncedAt)}
                  />
                  {(payment.provisioningError || (payment.subscriptionProvisionedAt && !payment.remnashopSyncedAt)) ? (
                    <details className="text-xs text-amber-700 dark:text-amber-200">
                      <summary className="cursor-pointer font-medium">Почему требуется внимание</summary>
                      <div className="mt-2 space-y-1 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                        {payment.provisioningError ? <div>{payment.provisioningError}</div> : null}
                        {payment.subscriptionProvisionedAt && !payment.remnashopSyncedAt ? <div>Remnashop: {humanSyncError(payment.remnashopSyncError)}</div> : null}
                      </div>
                    </details>
                  ) : null}
                </div>
                <div className="grid lg:justify-end">{action}</div>
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
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((step, index) => (
        <div key={step.label} className="flex items-center gap-2">
          {index > 0 ? <span className="text-slate-300 dark:text-slate-600">→</span> : null}
          <span className={`inline-flex items-center gap-1.5 font-medium ${step.done ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${step.done ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
            {step.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function paymentAttentionClass(requiresAttention: boolean) {
  return requiresAttention ? 'bg-red-50/50 dark:bg-red-500/[0.035]' : ''
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

function PaymentStat({ title, value, tone, href }: { title: string; value: number; tone: 'amber' | 'emerald' | 'red' | 'slate'; href: string }) {
  const toneClass = {
    amber: 'text-amber-700 dark:text-amber-200',
    emerald: 'text-emerald-700 dark:text-emerald-200',
    red: 'text-red-700 dark:text-red-200',
    slate: 'text-slate-700 dark:text-slate-200',
  }[tone]

  return (
    <Link href={href} className="min-w-0 px-3 py-2.5 text-center transition-colors hover:bg-slate-50 sm:text-left dark:hover:bg-white/[0.04]">
      <div className="truncate text-xs text-slate-500">{title}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums sm:text-2xl ${toneClass}`}>{value}</div>
    </Link>
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
