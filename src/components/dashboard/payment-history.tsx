import type { Prisma } from '@prisma/client'
import Link from 'next/link'
import { CheckCircle2, Clock3, CreditCard, ExternalLink, ReceiptText, Tag, XCircle } from 'lucide-react'
import { formatPrice } from '@/lib/format'
import { getPendingPaymentTtlMs } from '@/lib/payment-sync'
import { EmptyState } from '@/components/dashboard/empty-state'
import { paymentProviderLabel } from '@/lib/payment-provider-label'
import { cn } from '@/lib/cn'

export type PaymentHistoryPayment = Prisma.PaymentGetPayload<{ include: { plan: true; subscription: true } }>

export function PaymentHistory({ payments }: { payments: PaymentHistoryPayment[] }) {
  if (payments.length === 0) return <PaymentHistoryEmpty />

  return (
    <div className="space-y-3">
      {payments.map((payment) => {
        const freshPending = payment.status === 'PENDING' && isFreshPendingPayment(payment.createdAt)

        return (
          <article
            key={payment.id}
            className={cn(
              'grid gap-4 rounded-3xl border bg-white p-4 shadow-sm shadow-slate-950/[0.02] transition-colors dark:bg-white/[0.03] dark:shadow-none sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.25fr)_minmax(8rem,.5fr)_minmax(9rem,.55fr)_minmax(8rem,.45fr)] lg:items-center lg:gap-5',
              freshPending
                ? 'border-amber-200 ring-1 ring-amber-100 hover:border-amber-300 dark:border-amber-400/25 dark:ring-amber-400/10'
                : 'border-slate-200 hover:border-slate-300 dark:border-white/[0.09] dark:hover:border-white/[0.14]',
            )}
          >
            <div className="flex min-w-0 items-start gap-3 sm:col-span-2 lg:col-span-1">
              <PaymentStatusIcon status={payment.status} createdAt={payment.createdAt} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{payment.plan.name}</div>
                  <PaymentStatusBadge status={payment.status} createdAt={payment.createdAt} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <span>{formatPaymentDate(payment.createdAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{paymentProviderLabel(payment.provider)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/[0.07] sm:block sm:border-0 sm:pt-0">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:mb-1.5">Сумма</div>
              <PaymentAmount
                amountKopecks={payment.amountKopecks}
                originalAmountKopecks={payment.originalAmountKopecks}
                discountKopecks={payment.discountKopecks}
              />
              {getPromoCodeLabel(payment.promoCodeSnapshot) !== '—' ? (
                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <Tag className="h-3 w-3" />
                  {getPromoCodeLabel(payment.promoCodeSnapshot)}
                </div>
              ) : null}
            </div>

            <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3 dark:border-white/[0.07] sm:block sm:border-0 sm:pt-0">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:mb-1.5">Подписка</div>
              <div className="sm:mt-0">
                <ProvisioningBadge provisioned={Boolean(payment.subscriptionProvisionedAt)} status={payment.status} />
              </div>
            </div>

            <div className="flex flex-col justify-center gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.07] sm:col-span-2 lg:col-span-1 lg:border-0 lg:pt-0">
              <details className="text-xs text-slate-400 lg:text-right">
                <summary className="cursor-pointer select-none hover:text-slate-600 dark:hover:text-slate-200">ID платежа</summary>
                <div className="mt-1 truncate font-mono">{shortId(payment.externalPaymentId || payment.yookassaId || payment.id)}</div>
              </details>
              {payment.status === 'PENDING' ? (
                <PaymentAction confirmationUrl={payment.confirmationUrl} status={payment.status} createdAt={payment.createdAt} fullWidth />
              ) : null}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function PaymentHistoryEmpty() {
  const action = (
    <Link href="/dashboard/plans" className="btn-primary w-full sm:w-auto">
      <CreditCard className="h-4 w-4" />
      Выбрать тариф
    </Link>
  )

  return (
    <EmptyState
      title="Платежей пока нет"
      description="После первой покупки здесь появится история оплат и состояние выдачи подписки."
      icon={<ReceiptText className="h-7 w-7" />}
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
    return (
      <Link href="/dashboard/plans" className="btn-secondary min-h-10 w-full justify-center px-3 py-2 text-xs">
        Создать новый платёж
      </Link>
    )
  }
  if (status !== 'PENDING') return <span className="text-sm text-slate-400">—</span>
  if (!confirmationUrl) return <span className="text-sm text-slate-400">Ссылка недоступна</span>
  return (
    <a
      href={confirmationUrl}
      className={`btn-primary min-h-10 px-3 py-2 text-xs ${fullWidth ? 'w-full justify-center' : ''}`}
      target="_blank"
      rel="noreferrer"
    >
      <ExternalLink className="h-4 w-4" />
      Продолжить оплату
    </a>
  )
}

function PaymentStatusIcon({ status, createdAt }: { status: string; createdAt: Date }) {
  if (status === 'PENDING' && !isFreshPendingPayment(createdAt)) {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
        <Clock3 className="h-5 w-5" />
      </span>
    )
  }
  if (status === 'SUCCEEDED') {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
        <CheckCircle2 className="h-5 w-5" />
      </span>
    )
  }
  if (status === 'PENDING') {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
        <Clock3 className="h-5 w-5" />
      </span>
    )
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-200">
      <XCircle className="h-5 w-5" />
    </span>
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
