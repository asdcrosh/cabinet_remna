import { cn } from '@/lib/cn'
import type { UserStatus } from '@/lib/remnawave'

const labels: Record<UserStatus, { text: string; cls: string }> = {
  ACTIVE:   { text: 'Активна',   cls: 'badge-active' },
  LIMITED:  { text: 'Лимит',     cls: 'badge-limited' },
  EXPIRED:  { text: 'Истекла',   cls: 'badge-expired' },
  DISABLED: { text: 'Отключена', cls: 'badge-disabled' },
}

export function StatusBadge({ status }: { status: UserStatus }) {
  const item = labels[status] ?? labels.DISABLED
  return <span className={cn(item.cls)}>{item.text}</span>
}
