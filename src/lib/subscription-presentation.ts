export type SubscriptionDisplayStatus = 'ACTIVE' | 'LIMITED' | 'PAUSED' | 'EXPIRED' | 'DISABLED'

export type SubscriptionPhase =
  | 'active'
  | 'limited'
  | 'grace'
  | 'paused'
  | 'expired'
  | 'disabled'
  | 'syncing'

export type SubscriptionPresentation = {
  status: SubscriptionDisplayStatus
  phase: SubscriptionPhase
  title: string
  description: string
  expireAt: Date | null
  daysLeft: number | null
  usable: boolean
  requiresRenewal: boolean
  remoteUnavailable: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

export function resolveSubscriptionPresentation(input: {
  localStatus?: string | null
  remoteStatus?: string | null
  localExpireAt?: Date | null
  remoteExpireAt?: Date | null
  remoteDaysLeft?: number | null
  graceExpireAt?: Date | null
  unlimitedDuration?: boolean
  pendingSync?: boolean
  remoteUnavailable?: boolean
  now?: Date
}): SubscriptionPresentation {
  const now = input.now ?? new Date()
  const graceActive = Boolean(input.graceExpireAt && input.graceExpireAt > now)
  const paused = input.localStatus === 'PAUSED'
  const remoteUnavailable = Boolean(input.remoteUnavailable)
  const expireAt = graceActive
    ? input.graceExpireAt ?? null
    : input.remoteExpireAt ?? input.localExpireAt ?? null
  const daysLeft = input.unlimitedDuration
    ? null
    : graceActive || remoteUnavailable || input.remoteDaysLeft == null
      ? expireAt ? Math.ceil((expireAt.getTime() - now.getTime()) / DAY_MS) : null
      : input.remoteDaysLeft

  let status = normalizeStatus(paused ? 'PAUSED' : input.remoteStatus ?? input.localStatus)
  const expiredByTime = !input.unlimitedDuration && (
    (expireAt != null && expireAt.getTime() < now.getTime())
    || (daysLeft != null && daysLeft < 0)
  )

  if (graceActive) status = 'LIMITED'
  else if (!paused && (status === 'EXPIRED' || expiredByTime)) status = 'EXPIRED'

  const phase: SubscriptionPhase = graceActive
    ? 'grace'
    : paused
      ? 'paused'
      : input.pendingSync && status !== 'EXPIRED' && status !== 'DISABLED'
        ? 'syncing'
        : status.toLowerCase() as SubscriptionPhase
  const usable = phase === 'active' || phase === 'limited' || phase === 'grace' || phase === 'syncing'

  return {
    status,
    phase,
    title: titleForPhase(phase),
    description: descriptionForPhase(phase, remoteUnavailable),
    expireAt,
    daysLeft,
    usable,
    requiresRenewal: phase === 'expired' || phase === 'disabled',
    remoteUnavailable,
  }
}

function normalizeStatus(value: string | null | undefined): SubscriptionDisplayStatus {
  if (value === 'ACTIVE' || value === 'LIMITED' || value === 'PAUSED' || value === 'EXPIRED') return value
  return 'DISABLED'
}

function titleForPhase(phase: SubscriptionPhase) {
  if (phase === 'active') return 'Подписка активна'
  if (phase === 'limited') return 'Подписка ограничена'
  if (phase === 'grace') return 'Льготный период'
  if (phase === 'paused') return 'Подписка на паузе'
  if (phase === 'expired') return 'Подписка истекла'
  if (phase === 'syncing') return 'Доступ обновляется'
  return 'Подписка отключена'
}

function descriptionForPhase(phase: SubscriptionPhase, remoteUnavailable: boolean) {
  if (remoteUnavailable) return 'Показаны последние сохранённые данные. Сервис подключения временно не ответил.'
  if (phase === 'active') return 'Доступ работает. Можно подключать устройства и управлять оплатой.'
  if (phase === 'limited') return 'Доступ работает с ограничениями. Проверьте условия подписки.'
  if (phase === 'grace') return 'Доступ временно сохранён. Продлите подписку до конца льготного периода.'
  if (phase === 'paused') return 'Остаток срока сохранён. Возобновите доступ в управлении подпиской.'
  if (phase === 'expired') return 'Продлите подписку. Повторно настраивать подключённые устройства не потребуется.'
  if (phase === 'syncing') return 'Оплаченные изменения применяются. Обновите страницу через минуту.'
  return 'Доступ выключен. Откройте управление подпиской или обратитесь в поддержку.'
}
