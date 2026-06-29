import type { PersonalOfferScenario, PersonalOfferSetting, PersonalOfferTone } from '@prisma/client'

export type PersonalOfferSettingSeed = Pick<
  PersonalOfferSetting,
  'scenario' | 'enabled' | 'priority' | 'eyebrow' | 'title' | 'description' | 'cta' | 'href' | 'meta' | 'tone'
>

export const defaultPersonalOfferSettings: PersonalOfferSettingSeed[] = [
  {
    scenario: 'RETURN_PROMO',
    enabled: true,
    priority: 10,
    eyebrow: 'Личный оффер',
    title: 'Промокод {promo}',
    description: 'Скидка {discount}% на оплату VPN. Код уже можно применить в тарифах.',
    cta: 'Выбрать тариф',
    href: '/dashboard/plans',
    meta: 'не покупали {inactive_days} дн.',
    tone: 'VIOLET',
  },
  {
    scenario: 'NO_SUBSCRIPTION',
    enabled: true,
    priority: 20,
    eyebrow: 'Рекомендация',
    title: '{plan}',
    description: '{duration} дн. доступа за {price}. Подходит для первого подключения.',
    cta: 'Купить VPN',
    href: '/dashboard/plans?plan={plan_id}',
    meta: 'лучший старт',
    tone: 'CYAN',
  },
  {
    scenario: 'RENEWAL_SOON',
    enabled: true,
    priority: 30,
    eyebrow: 'Продление',
    title: 'Осталось {days_left} дн.',
    description: 'Продлите {plan}, чтобы доступ не прерывался.',
    cta: 'Продлить',
    href: '/dashboard/plans',
    meta: 'важно',
    tone: 'AMBER',
  },
  {
    scenario: 'CONNECT_DEVICE',
    enabled: true,
    priority: 40,
    eyebrow: 'Следующий шаг',
    title: 'Подключите устройство',
    description: 'Откройте подписку, выберите приложение и добавьте VPN в один переход.',
    cta: 'Подключить',
    href: '/dashboard/subscription',
    meta: 'быстрый доступ',
    tone: 'EMERALD',
  },
  {
    scenario: 'REFERRAL',
    enabled: true,
    priority: 50,
    eyebrow: 'Бонус',
    title: 'Пригласите друга',
    description: 'Отправьте реферальную ссылку и получите дополнительные дни после оплаты друга.',
    cta: 'Открыть рефералку',
    href: '/dashboard/referrals',
    meta: 'активная подписка',
    tone: 'EMERALD',
  },
]

export const personalOfferScenarioLabels: Record<PersonalOfferScenario, string> = {
  RETURN_PROMO: 'Давно не покупал',
  NO_SUBSCRIPTION: 'Нет подписки',
  RENEWAL_SOON: 'Скоро закончится',
  CONNECT_DEVICE: 'Нет устройств',
  REFERRAL: 'Активная подписка',
}

export const personalOfferToneLabels: Record<PersonalOfferTone, string> = {
  CYAN: 'Голубой',
  EMERALD: 'Зелёный',
  AMBER: 'Жёлтый',
  VIOLET: 'Фиолетовый',
}

export const personalOfferPlaceholders = [
  '{name}',
  '{email}',
  '{plan}',
  '{plan_id}',
  '{price}',
  '{duration}',
  '{days_left}',
  '{promo}',
  '{discount}',
  '{inactive_days}',
] as const

export function normalizeOfferTone(tone: PersonalOfferTone): 'cyan' | 'emerald' | 'amber' | 'violet' {
  if (tone === 'EMERALD') return 'emerald'
  if (tone === 'AMBER') return 'amber'
  if (tone === 'VIOLET') return 'violet'
  return 'cyan'
}

export function renderPersonalOfferTemplate(template: string | null | undefined, values: Record<string, string>) {
  if (!template) return ''
  return template.replace(/\{([a-z_]+)\}/g, (match, key) => values[key] ?? match)
}
