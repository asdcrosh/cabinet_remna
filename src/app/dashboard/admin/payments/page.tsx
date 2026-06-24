import Link from 'next/link'
import { Search } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { formatPrice } from '@/lib/format'
import { PageHeader } from '@/components/dashboard/page-header'
import { PaymentBadge, ProvisioningBadge } from '@/components/admin/admin-badges'
import { PaymentSyncButton, RecoveryActionButton } from '@/components/admin/recovery-actions'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { ADMIN_LIST_PAGE_SIZE, parseAdminListLimit } from '@/lib/admin-list'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Платежи — Админка' }

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string; delivery?: string; limit?: string }
}) {
  await requireAdminPage()

  const q = searchParams?.q?.trim() ?? ''
  const status = searchParams?.status ?? 'ALL'
  const delivery = searchParams?.delivery ?? 'ALL'
  const limit = parseAdminListLimit(searchParams?.limit)
  const where = {
    ...(status !== 'ALL' ? { status: status as any } : {}),
    ...(delivery === 'DELIVERED'
      ? { subscriptionProvisionedAt: { not: null } }
      : delivery === 'RETRY'
        ? { status: 'SUCCEEDED' as const, subscriptionProvisionedAt: null }
        : {}),
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

  const [total, payments] = await prisma.$transaction([
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
  ])

  return (
    <div className="space-y-6">
      <PageHeader title="Платежи" description="Все платежи, их статус и результат выдачи подписки" />

      <form className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-surface-900 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem_auto_auto]" action="/dashboard/admin/payments">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={q} className="input pl-9" placeholder="Email, имя, тариф или ID" />
        </div>
        <select name="status" defaultValue={status} className="input">
          <option value="ALL">Все статусы</option>
          <option value="PENDING">Ожидают оплаты</option>
          <option value="SUCCEEDED">Оплачены</option>
          <option value="CANCELED">Отменены</option>
          <option value="REFUNDED">Возвраты</option>
        </select>
        <select name="delivery" defaultValue={delivery} className="input">
          <option value="ALL">Любая выдача</option>
          <option value="DELIVERED">Подписка выдана</option>
          <option value="RETRY">Нужна довыдача</option>
        </select>
        <button type="submit" className="btn-primary">Показать</button>
        {(q || status !== 'ALL' || delivery !== 'ALL') && <Link href="/dashboard/admin/payments" className="btn-secondary">Сбросить</Link>}
      </form>

      {payments.length === 0 && (
        <div className="card py-12 text-center">
          <h2 className="font-semibold">Платежи не найдены</h2>
          <p className="mt-1 text-sm text-slate-500">Измените фильтры или сбросьте поиск.</p>
        </div>
      )}

      <div className={payments.length > 0 ? 'table-shell hidden xl:block' : 'hidden'}>
        <table className="data-table min-w-[1180px]">
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
              return (
                <tr key={payment.id}>
                  <td className="text-slate-500">{new Date(payment.createdAt).toLocaleString('ru-RU')}</td>
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
                    </div>
                  </td>
                  <td className="sticky-actions-cell w-[176px] min-w-[176px]">
                    <div className="action-row">
                      {payment.yookassaId && <PaymentSyncButton paymentId={payment.id} />}
                      {needsRetry ? (
                        <RecoveryActionButton paymentId={payment.id} />
                      ) : payment.subscriptionId ? (
                        <Link href="/dashboard/admin/subscriptions" className="btn-secondary min-w-[112px] px-3 text-xs">
                          Подписка
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

      <div className={payments.length > 0 ? 'space-y-3 xl:hidden' : 'hidden'}>
        {payments.map((payment) => {
          const needsRetry = payment.status === 'SUCCEEDED' && !payment.subscriptionProvisionedAt
          return (
            <article key={payment.id} className="overflow-hidden rounded-lg border bg-white shadow-sm dark:bg-surface-900">
              <div className="border-b bg-slate-50 px-4 py-3 dark:bg-surface-800">
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
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <AdminInfoCell
                    label="Выдача"
                    value={payment.subscriptionProvisionedAt ? 'Выдана' : payment.status === 'SUCCEEDED' ? 'Нужен retry' : '—'}
                  />
                  <AdminInfoCell label="Промокод" value={getPromoCodeLabel(payment.promoCodeSnapshot)} />
                  <AdminInfoCell label="ID платежа" value={shortId(payment.yookassaId || payment.id)} mono />
                </div>
                {payment.provisioningError && (
                  <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                    {payment.provisioningError}
                  </div>
                )}
                <div className="action-row">
                  {payment.yookassaId && <PaymentSyncButton paymentId={payment.id} />}
                  {needsRetry ? (
                    <RecoveryActionButton paymentId={payment.id} />
                  ) : payment.subscriptionId ? (
                    <Link href="/dashboard/admin/subscriptions" className="btn-secondary min-w-[112px] px-3 text-xs">
                      Открыть подписки
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
