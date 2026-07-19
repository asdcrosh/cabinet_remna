import { cn } from '@/lib/cn'

const paymentLabels: Record<string, string> = {
  SUCCEEDED: 'Оплачен',
  PENDING: 'Ожидает',
  CANCELED: 'Отменён',
  REFUNDED: 'Возврат',
}

const subscriptionLabels: Record<string, string> = {
  ACTIVE: 'Активна',
  LIMITED: 'Лимит',
  EXPIRED: 'Истекла',
  DISABLED: 'Отключена',
}

export function PaymentBadge({ status }: { status: string }) {
  return <StatusPill status={status} labels={paymentLabels} />
}

export function SubscriptionBadge({ status }: { status: string }) {
  return <StatusPill status={status} labels={subscriptionLabels} />
}

export function ProvisioningBadge({ provisioned }: { provisioned: boolean }) {
  return (
    <span
      className={cn(
        'badge gap-1.5 whitespace-nowrap ring-1 ring-inset',
        provisioned
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20'
          : 'bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20'
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', provisioned ? 'bg-emerald-500' : 'bg-amber-500')} />
      {provisioned ? 'Выдана' : 'Нужен retry'}
    </span>
  )
}

function StatusPill({ status, labels }: { status: string; labels: Record<string, string> }) {
  const tone =
    status === 'SUCCEEDED' || status === 'ACTIVE'
      ? {
          className: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20',
          dot: 'bg-emerald-500',
        }
      : status === 'PENDING' || status === 'LIMITED'
        ? {
            className: 'bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20',
            dot: 'bg-amber-500',
          }
        : status === 'CANCELED' || status === 'REFUNDED' || status === 'EXPIRED' || status === 'DISABLED'
          ? {
              className: 'bg-rose-50 text-rose-700 ring-rose-200/80 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20',
              dot: 'bg-rose-500',
            }
          : {
              className: 'bg-slate-100 text-slate-600 ring-slate-200/80 dark:bg-white/[0.06] dark:text-slate-300 dark:ring-white/10',
              dot: 'bg-slate-400',
            }

  return (
    <span className={cn('badge gap-1.5 whitespace-nowrap ring-1 ring-inset', tone.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} />
      {labels[status] ?? status}
    </span>
  )
}
