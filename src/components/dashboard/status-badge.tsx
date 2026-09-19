import { cn } from '@/lib/cn'
import type { SubscriptionDisplayStatus } from '@/lib/subscription-presentation'

const labels: Record<SubscriptionDisplayStatus, { text: string; cls: string }> = {
  ACTIVE:   { text: 'Активна',   cls: 'badge-active' },
  LIMITED:  { text: 'Лимит',     cls: 'badge-limited' },
  PAUSED:   { text: 'На паузе',  cls: 'badge-limited' },
  EXPIRED:  { text: 'Истекла',   cls: 'badge-expired' },
  DISABLED: { text: 'Отключена', cls: 'badge-disabled' },
}

export function StatusBadge({ status }: { status: SubscriptionDisplayStatus }) {
  const item = labels[status] ?? labels.DISABLED
  return <span className={cn(item.cls)}>{item.text}</span>
}
