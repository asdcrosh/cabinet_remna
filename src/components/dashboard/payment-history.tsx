import type { Prisma } from '@prisma/client'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { getPendingPaymentTtlMs } from '@/lib/payment-sync'
import { EmptyState } from '@/components/dashboard/empty-state'

export type PaymentHistoryPayment = Prisma.PaymentGetPayload<{ include: { plan: true; subscription: true } }>

export function PaymentHistory({ payments }: { payments: PaymentHistoryPayment[] }) {
  return (
    <div className="space-y-3">
      <div className="table-shell hidden 2xl:block">
        <table className="data-table min-w-[900px]">
          <caption className="sr-only">История платежей и состояние выданных подписок</caption>
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-surface-800">
            <tr>
              <th>Дата</th>
              <th>Тариф</th>
              <th>Сумма</th>
              <th>Промокод</th>
              <th>Статус</th>
              <th>Подписка</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {payments.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10">
                  <PaymentHistoryEmpty compact />
                </td>
              </tr>
            )}
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{new Date(payment.createdAt).toLocaleString('ru-RU')}</td>
                <td>{payment.plan.name}</td>
                <td>
                  <PaymentAmount
                    amountKopecks={payment.amountKopecks}
                    originalAmountKopecks={payment.originalAmountKopecks}
                    discountKopecks={payment.discountKopecks}
                  />
                </td>
                <td className="text-slate-500">{getPromoCodeLabel(payment.promoCodeSnapshot)}</td>
                <td><PaymentStatusBadge status={payment.status} createdAt={payment.createdAt} /></td>
                <td><ProvisioningBadge provisioned={Boolean(payment.subscriptionProvisionedAt)} status={payment.status} /></td>
                <td><PaymentAction confirmationUrl={payment.confirmationUrl} status={payment.status} createdAt={payment.createdAt} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 2xl:hidden">
        {payments.length === 0 && <PaymentHistoryEmpty />}
        {payments.map((payment) => (
          <article key={payment.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm shadow-slate-950/[0.04] dark:border-white/10 dark:bg-surface-900">
            <div className="border-b border-slate-100 px-4 py-4 dark:border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{payment.plan.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{formatPaymentDate(payment.createdAt)}</div>
                </div>
                <PaymentStatusBadge status={payment.status} createdAt={payment.createdAt} />
              </div>
            </div>
            <div className="space-y-4 px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-medium text-slate-500">Сумма</span>
                <PaymentAmount
                  amountKopecks={payment.amountKopecks}
                  originalAmountKopecks={payment.originalAmountKopecks}
                  discountKopecks={payment.discountKopecks}
                  align="right"
                />
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <InfoCell label="Подписка" value={getProvisioningLabel(Boolean(payment.subscriptionProvisionedAt), payment.status)} />
                <InfoCell label="Промокод" value={getPromoCodeLabel(payment.promoCodeSnapshot)} />
                <InfoCell label="ID оплаты" value={payment.yookassaId ? shortId(payment.yookassaId) : shortId(payment.id)} mono />
              </div>
              <PaymentAction confirmationUrl={payment.confirmationUrl} status={payment.status} createdAt={payment.createdAt} fullWidth />
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

function PaymentHistoryEmpty({ compact = false }: { compact?: boolean }) {
  const action = <Link href="/dashboard/plans" className="btn-primary w-full sm:w-auto">Выбрать тариф</Link>

  if (compact) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="text-base font-semibold text-slate-900 dark:text-white">Платежей пока нет</div>
        <p className="mt-1 text-sm text-slate-500">
          После покупки здесь появятся сумма, статус и выданная подписка.
        </p>
        <div className="mt-4 inline-flex">{action}</div>
      </div>
    )
  }

  return (
    <EmptyState
      title="Платежей пока нет"
      description="После первой покупки здесь появится история оплат и состояние выдачи подписки."
      action={action}
    />
  )
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
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
    <div className={align === 'right' ? 'text-right' : undefined}>
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

function PaymentAction({
  confirmationUrl,
  status,
  createdAt,
  fullWidth = false,
}: {
  confirmationUrl: string | null
  status: string
  createdAt: Date
  fullWidth?: boolean
}) {
  if (status === 'PENDING' && !isFreshPendingPayment(createdAt)) {
    return <span className="text-sm text-slate-400">Ссылка устарела</span>
  }
  if (status !== 'PENDING') return <span className="text-sm text-slate-400">—</span>
  if (!confirmationUrl) return <span className="text-sm text-slate-400">Ссылка недоступна</span>
  return (
    <a
      href={confirmationUrl}
      className={`btn-secondary min-h-9 px-3 py-1.5 text-xs ${fullWidth ? 'w-full justify-center' : ''}`}
      target="_blank"
      rel="noreferrer"
    >
      <ExternalLink className="h-4 w-4" />
      Оплатить
    </a>
  )
}

function PaymentStatusBadge({ status, createdAt }: { status: string; createdAt: Date }) {
  if (status === 'PENDING' && !isFreshPendingPayment(createdAt)) {
    return <span className="badge-disabled">Истёк</span>
  }
  const map: Record<string, string> = {
    SUCCEEDED: 'badge-active',
    PENDING: 'badge-limited',
    CANCELED: 'badge-disabled',
    REFUNDED: 'badge-disabled',
  }
  const labels: Record<string, string> = {
    SUCCEEDED: 'Оплачен',
    PENDING: 'Ожидает',
    CANCELED: 'Отменён',
    REFUNDED: 'Возврат',
  }
  return <span className={map[status] ?? 'badge-disabled'}>{labels[status] ?? status}</span>
}

function ProvisioningBadge({ provisioned, status }: { provisioned: boolean; status: string }) {
  if (provisioned) return <span className="badge-active">Выдана</span>
  if (status === 'SUCCEEDED') return <span className="badge-limited">Выдача идёт</span>
  if (status === 'PENDING') return <span className="badge-disabled">После оплаты</span>
  return <span className="text-slate-400">—</span>
}

function getPromoCodeLabel(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return '—'
  const code = (snapshot as { code?: unknown }).code
  return typeof code === 'string' && code ? code : '—'
}

function getProvisioningLabel(provisioned: boolean, status: string) {
  if (provisioned) return 'Выдана'
  if (status === 'SUCCEEDED') return 'Выдача идёт'
  if (status === 'PENDING') return 'После оплаты'
  return '—'
}

function formatPaymentDate(date: Date) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function shortId(id: string) {
  return id.length > 12 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id
}

function isFreshPendingPayment(createdAt: Date) {
  return createdAt.getTime() > Date.now() - getPendingPaymentTtlMs()
}
