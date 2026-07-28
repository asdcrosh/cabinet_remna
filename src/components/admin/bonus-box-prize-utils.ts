export type PrizeType = 'SUBSCRIPTION_DAYS' | 'TRAFFIC_GB' | 'PROMO_CODE_PERCENT' | 'BONUS_ATTEMPTS' | 'NO_PRIZE'
export type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

export type BonusBoxSettingsAdminRow = {
  pityEnabled: boolean
  pityOpenings: number
  showBestRecentOpening: boolean
  activePromoRewardsLimit: number
}

export type BonusBoxPrizeAdminRow = {
  id: string
  title: string
  description: string | null
  type: PrizeType
  value: number
  weight: number
  rarity: Rarity
  isActive: boolean
  maxWins: number | null
  winsCount: number
  promoExpiresInDays: number | null
  estimatedCostKopecks: number
  eventOnly: boolean
  chance: number
}

export type BonusBoxOpeningAdminRow = {
  id: string
  createdAt: string
  userEmail: string
  userName: string | null
  attemptSource: string
  prizeTitle: string
  prizeType: PrizeType
  prizeValue: number
  prizeRarity: Rarity
  promoCode: string | null
  promoCodeExpiresAt: string | null
  remoteSynced: boolean
  syncAttempts: number
  lastSyncError: string | null
}

export type BonusBoxPrizeFormState = {
  title: string
  description: string
  type: PrizeType
  value: string
  weight: string
  rarity: Rarity
  isActive: boolean
  maxWins: string
  promoExpiresInDays: string
  estimatedCostRubles: string
  eventOnly: boolean
}

export const emptyBonusBoxPrizeForm: BonusBoxPrizeFormState = {
  title: '',
  description: '',
  type: 'SUBSCRIPTION_DAYS',
  value: '1',
  weight: '20',
  rarity: 'COMMON',
  isActive: true,
  maxWins: '',
  promoExpiresInDays: '',
  estimatedCostRubles: '0',
  eventOnly: false,
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function getPrizeStats(prizes: BonusBoxPrizeAdminRow[]) {
  const activePrizes = prizes.filter((prize) => prize.chance > 0)
  const noPrizeChance = activePrizes
    .filter((prize) => prize.type === 'NO_PRIZE')
    .reduce((sum, prize) => sum + prize.chance, 0)
  const promoChance = activePrizes
    .filter((prize) => prize.type === 'PROMO_CODE_PERCENT')
    .reduce((sum, prize) => sum + prize.chance, 0)
  const attemptChance = activePrizes
    .filter((prize) => prize.type === 'BONUS_ATTEMPTS')
    .reduce((sum, prize) => sum + prize.chance, 0)

  return {
    active: activePrizes.length,
    noPrizeChance,
    promoChance,
    attemptChance,
    rewardChance: Math.max(0, 1 - noPrizeChance),
  }
}

export function getEconomyWarnings(
  prizes: BonusBoxPrizeAdminRow[],
  settings: BonusBoxSettingsAdminRow
) {
  const activePrizes = prizes.filter((prize) => prize.chance > 0)
  const warnings: Array<{ title: string; detail: string; tone: 'warning' | 'danger' }> = []

  if (activePrizes.length === 0) {
    return [{
      title: 'Нет доступных исходов',
      detail: 'Все подарки отключены, имеют нулевой вес или исчерпали лимит выпадений.',
      tone: 'danger' as const,
    }]
  }

  const rewardPrizes = activePrizes.filter((prize) => prize.type !== 'NO_PRIZE')
  const welcomeRewards = rewardPrizes.filter(
    (prize) => prize.type === 'PROMO_CODE_PERCENT' || prize.type === 'BONUS_ATTEMPTS'
  )
  const unlimitedRewards = rewardPrizes.filter((prize) => prize.type !== 'TRAFFIC_GB')
  const rareRewards = rewardPrizes.filter((prize) => prize.rarity !== 'COMMON')
  const bonusAttemptReturn = activePrizes
    .filter((prize) => prize.type === 'BONUS_ATTEMPTS')
    .reduce((sum, prize) => sum + prize.chance * prize.value, 0)
  const almostExhausted = activePrizes.filter(
    (prize) => prize.maxWins != null && prize.maxWins - prize.winsCount <= 5
  )

  if (rewardPrizes.length === 0) {
    warnings.push({
      title: 'Шанс награды равен нулю',
      detail: 'Сейчас любое открытие заканчивается без начисления.',
      tone: 'danger',
    })
  }
  if (welcomeRewards.length === 0) {
    warnings.push({
      title: 'Стартовому открытию нечего выдать',
      detail: 'Добавьте активный промокод или дополнительные открытия для пользователя без подписки.',
      tone: 'danger',
    })
  }
  if (unlimitedRewards.length === 0) {
    warnings.push({
      title: 'Нет награды для безлимитной подписки',
      detail: 'Трафик к безлимиту не применяется. Нужны дни, промокод или дополнительные открытия.',
      tone: 'danger',
    })
  }
  if (settings.pityEnabled && rareRewards.length === 0) {
    warnings.push({
      title: 'Гарантия редкого не сработает',
      detail: 'Гарантия включена, но среди доступных наград нет редких, эпических или легендарных.',
      tone: 'warning',
    })
  }
  if (bonusAttemptReturn >= 1) {
    warnings.push({
      title: 'Дополнительные открытия воспроизводят сами себя',
      detail: `Средний возврат: ${bonusAttemptReturn.toFixed(2)} открытия на одно. Баланс попыток может расти без оплаты.`,
      tone: 'danger',
    })
  } else if (bonusAttemptReturn >= 0.5) {
    warnings.push({
      title: 'Высокий возврат дополнительных открытий',
      detail: `Средний возврат: ${bonusAttemptReturn.toFixed(2)} открытия на одно. Проверьте вес и размер награды.`,
      tone: 'warning',
    })
  }
  if (almostExhausted.length > 0) {
    const prizeWord = almostExhausted.length === 1 ? 'подарка' : 'подарков'
    warnings.push({
      title: 'Часть подарков скоро закончится',
      detail: `У ${almostExhausted.length} ${prizeWord} осталось не больше пяти выпадений.`,
      tone: 'warning',
    })
  }

  return warnings
}

export function estimatePrizeChance(
  prizes: BonusBoxPrizeAdminRow[],
  editingId: string | null,
  editingPrize: BonusBoxPrizeAdminRow | null,
  form: BonusBoxPrizeFormState
) {
  const weight = Number(form.weight)
  const maxWins = form.maxWins ? Number(form.maxWins) : null
  const isCurrentEligible = form.isActive
    && Number.isFinite(weight)
    && weight > 0
    && (maxWins == null || !editingPrize || editingPrize.winsCount < maxWins)
  const otherWeight = prizes
    .filter((prize) =>
      prize.id !== editingId
      && prize.isActive
      && prize.weight > 0
      && (prize.maxWins == null || prize.winsCount < prize.maxWins)
    )
    .reduce((sum, prize) => sum + prize.weight, 0)

  if (!isCurrentEligible) return 0
  return weight / (otherWeight + weight)
}

export function getFocusableElements(root: HTMLElement | null) {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
}

export function formatChance(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

export function valueLabel(type: PrizeType) {
  if (type === 'NO_PRIZE') return 'Значение'
  if (type === 'SUBSCRIPTION_DAYS') return 'Дни'
  if (type === 'TRAFFIC_GB') return 'ГБ'
  if (type === 'BONUS_ATTEMPTS') return 'Открытия'
  return 'Скидка, %'
}

export function prizeTypeLabel(type: PrizeType) {
  if (type === 'NO_PRIZE') return 'Открытие без начисления'
  if (type === 'SUBSCRIPTION_DAYS') return 'Дни подписки'
  if (type === 'TRAFFIC_GB') return 'Дополнительный трафик'
  if (type === 'BONUS_ATTEMPTS') return 'Дополнительные открытия'
  return 'Персональный промокод'
}

export function prizeValue(prize: BonusBoxPrizeAdminRow) {
  if (prize.type === 'NO_PRIZE') return 'Без подарка'
  return prizeValueFromParts(prize.type, prize.value)
}

export function prizeValueFromParts(type: PrizeType, value: number) {
  if (type === 'NO_PRIZE') return 'Без начислений'
  if (type === 'SUBSCRIPTION_DAYS') return `+${value} дн.`
  if (type === 'TRAFFIC_GB') return `+${value} ГБ`
  if (type === 'BONUS_ATTEMPTS') return `+${value} откр.`
  return `-${value}%`
}

export function previewPrizeValue(type: PrizeType, value: number) {
  if (type === 'NO_PRIZE') return 'Открытие без начисления'
  if (!Number.isFinite(value) || value <= 0) return 'Укажите значение подарка'
  return prizeValueFromParts(type, value)
}

export function sourceLabel(source: BonusBoxOpeningAdminRow['attemptSource']) {
  if (source === 'PAYMENT') return 'Оплата'
  if (source === 'WEEKLY') return 'Еженедельный бонус'
  if (source === 'REFERRAL') return 'Реферал'
  if (source === 'PRIZE') return 'Подарок из бокса'
  if (source === 'SEASONAL_EVENT') return 'Событие'
  if (source === 'MISSION') return 'Миссия'
  return 'Админ'
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateOnly(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function rarityLabel(rarity: Rarity) {
  if (rarity === 'LEGENDARY') return 'Легенда'
  if (rarity === 'EPIC') return 'Эпик'
  if (rarity === 'RARE') return 'Редкий'
  return 'База'
}

export function rarityClass(rarity: Rarity) {
  if (rarity === 'LEGENDARY') return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100'
  if (rarity === 'EPIC') return 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-100'
  if (rarity === 'RARE') return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-100'
  return 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
}
