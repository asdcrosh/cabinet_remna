import type { Prisma } from '@prisma/client'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { getPendingPaymentTtlMs } from '@/lib/payment-sync'
import { EmptyState } from '@/components/dashboard/empty-state'

export type PaymentHistoryPayment = Prisma.PaymentGetPayload<{ include: { plan: true; subscription: true } }>

export function PaymentHistory({ payments }: { payments: PaymentHistoryPayment[] }) {
  if (payments.length === 0) return <PaymentHistoryEmpty />

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-200 dark:border-white/10 dark:bg-white/[0.025] dark:divide-white/[0.07]">
      <div className="hidden grid-cols-[minmax(14rem,1.2fr)_minmax(8rem,.55fr)_minmax(10rem,.7fr)_auto] items-center gap-3 bg-slate-50/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:bg-white/[0.025] lg:grid">
        <span>Тариф</span>
        <span>Сумма</span>
        <span>Выдача</span>
        <span className="text-right">Действие</span>
      </div>
      {payments.map((payment) => (
        <article key={payment.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-slate-50/60 sm:grid-cols-[minmax(0,1.2fr)_minmax(7rem,.55fr)] lg:grid-cols-[minmax(14rem,1.2fr)_minmax(8rem,.55fr)_minmax(10rem,.7fr)_auto] lg:items-center dark:hover:bg-white/[0.02]">
          <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{payment.plan.name}</div>
              <div className="mt-1 text-xs text-slate-500">{formatPaymentDate(payment.createdAt)}</div>
            </div>
            <div className="lg:mt-2"><PaymentStatusBadge status={payment.status} createdAt={payment.createdAt} /></div>
          </div>

          <div className="text-right sm:text-left">
            <PaymentAmount
              amountKopecks={payment.amountKopecks}
              originalAmountKopecks={payment.originalAmountKopecks}
              discountKopecks={payment.discountKopecks}
            />
            {getPromoCodeLabel(payment.promoCodeSnapshot) !== '—' ? (
              <div className="mt-1 text-xs text-slate-500">Промокод {getPromoCodeLabel(payment.promoCodeSnapshot)}</div>
            ) : null}
          </div>

          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <ProvisioningBadge provisioned={Boolean(payment.subscriptionProvisionedAt)} status={payment.status} />
            <details className="mt-2 text-xs text-slate-400">
              <summary className="cursor-pointer">ID платежа</summary>
              <div className="mt-1 truncate font-mono">{payment.yookassaId ? shortId(payment.yookassaId) : shortId(payment.id)}</div>
            </details>
          </div>

          {payment.status === 'PENDING' ? (
            <div className="grid sm:col-span-2 lg:col-span-1 lg:justify-end">
              <PaymentAction confirmationUrl={payment.confirmationUrl} status={payment.status} createdAt={payment.createdAt} fullWidth />
            </div>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function PaymentHistoryEmpty() {
  const action = <Link href="/dashboard/plans" className="btn-primary w-full sm:w-auto">Выбрать тариф</Link>

  return (
    <EmptyState
      title="Платежей пока нет"
      description="После первой покупки здесь появится история оплат и состояние выдачи подписки."
      action={action}
    />
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
