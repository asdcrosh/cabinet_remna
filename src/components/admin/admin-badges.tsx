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
        'badge',
        provisioned
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      )}
    >
      {provisioned ? 'Выдана' : 'Нужен retry'}
    </span>
  )
}

function StatusPill({ status, labels }: { status: string; labels: Record<string, string> }) {
  const tone =
    status === 'SUCCEEDED' || status === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : status === 'PENDING' || status === 'LIMITED'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'

  return <span className={cn('badge', tone)}>{labels[status] ?? status}</span>
}
