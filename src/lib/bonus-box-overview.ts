import type { BonusBoxPrize, BonusBoxRarity } from '@prisma/client'

export function getCanOpenReason(input: {
  enabled: boolean
  attemptsCount: number
  configuredPrizesCount: number
  eligiblePrizesCount: number
  hasActiveSubscription: boolean
  welcomeAttemptsCount: number
}) {
  if (!input.enabled) return 'Подарочный бокс временно выключен'
  if (input.configuredPrizesCount <= 0) return 'Подарки ещё не настроены'
  if (input.eligiblePrizesCount <= 0) return 'Для текущего тарифа пока нет подходящих подарков'
  if (input.attemptsCount <= 0) {
    return 'Нет доступных открытий. Их можно получить за покупку, приглашение или еженедельный бонус.'
  }
  if (!input.hasActiveSubscription && input.welcomeAttemptsCount <= 0) {
    return 'Нужна активная подписка. Приветственные открытия можно использовать без покупки.'
  }
  return null
}

export function buildPityProgress(
  recentOpenings: Array<{ prize: { rarity: BonusBoxRarity } }>,
  config: { pityEnabled: boolean; pityOpenings: number }
) {
  const threshold = clamp(config.pityOpenings, 2, 100)
  const current = config.pityEnabled
    ? Math.min(openingsSinceRarityAtLeastFinite(recentOpenings, 1), threshold)
    : 0

  return {
    enabled: config.pityEnabled,
    threshold,
    current,
    remaining: config.pityEnabled ? Math.max(0, threshold - current) : null,
    guaranteedNext: config.pityEnabled && current >= threshold,
  }
}

export function buildOpeningStreak(openingsCount: number) {
  const targets = [3, 5, 10]
  const nextTarget = targets.find((target) => openingsCount < target) ?? null

  return {
    current: nextTarget ? openingsCount : Math.min(openingsCount, targets[targets.length - 1] ?? openingsCount),
    nextTarget,
    targets,
    completed: targets.filter((target) => openingsCount >= target),
  }
}

export function scoreOpening(prize: Pick<BonusBoxPrize, 'rarity' | 'type' | 'value'>) {
  const value = Math.max(0, prize.value)
  const typeScore =
    prize.type === 'SUBSCRIPTION_DAYS'
      ? value * 120
      : prize.type === 'TRAFFIC_GB'
        ? value * 70
        : prize.type === 'PROMO_CODE_PERCENT'
          ? value * 45
          : prize.type === 'BONUS_ATTEMPTS'
            ? value * 35
            : 0

  return rarityRank(prize.rarity) * 100_000 + typeScore
}

export function prizeValueLabel(prize: Pick<BonusBoxPrize, 'type' | 'value'>) {
  if (prize.type === 'SUBSCRIPTION_DAYS') return `+${prize.value} дн.`
  if (prize.type === 'TRAFFIC_GB') return `+${prize.value} ГБ`
  if (prize.type === 'BONUS_ATTEMPTS') return `+${prize.value} открытий`
  if (prize.type === 'PROMO_CODE_PERCENT') return `-${prize.value}%`
  return 'Без начисления'
}

export function maskEmail(email?: string | null) {
  if (!email) return null
  const [name, domain] = email.split('@')
  if (!domain) return name
  return `${(name || email).slice(0, 2)}***@${domain}`
}

export function getWeekKey(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function getCurrentWeeklyBonusDate(now: Date, weeklyDay: number) {
  const target = new Date(now)
  target.setHours(0, 0, 0, 0)
  const daysSinceBonusDay = (target.getDay() - weeklyDay + 7) % 7
  target.setDate(target.getDate() - daysSinceBonusDay)
  return target
}

export function envBool(key: string, fallback: boolean) {
  const raw = process.env[key]?.trim().toLowerCase()
  if (!raw) return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw)
}

export function envInt(key: string, fallback: number, min: number, max: number) {
  const raw = process.env[key]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return fallback
  return clamp(parsed, min, max)
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function openingsSinceRarityAtLeastFinite(
  recentOpenings: Array<{ prize: { rarity: BonusBoxRarity } }>,
  minRank: number
) {
  const index = recentOpenings.findIndex((opening) => rarityRank(opening.prize.rarity) >= minRank)
  return index === -1 ? recentOpenings.length : index
}

function rarityRank(rarity: BonusBoxRarity) {
  if (rarity === 'LEGENDARY') return 3
  if (rarity === 'EPIC') return 2
  if (rarity === 'RARE') return 1
  return 0
}
