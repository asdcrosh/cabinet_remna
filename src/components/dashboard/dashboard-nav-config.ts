import {
  Activity,
  Bell,
  BookOpen,
  CalendarRange,
  CreditCard,
  Database,
  FileCheck2,
  FileClock,
  Gift,
  Home,
  KeyRound,
  Mail,
  MessageCircleQuestion,
  RotateCcw,
  Send,
  Server,
  ServerCog,
  Settings,
  SearchCheck,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  UserCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { legalNavigation, type LegalPath } from '@/lib/legal-links'
import type { FeatureFlags } from '@/lib/feature-flags'

export type NavigationItem = {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
}

export type UserRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'

export const userNavigation: NavigationItem[] = [
  { href: '/dashboard', label: 'Главная', icon: Home, exact: true },
  { href: '/dashboard/subscription', label: 'Подключение', icon: KeyRound },
  { href: '/dashboard/plans', label: 'Тарифы', icon: ShieldCheck },
  { href: '/dashboard/bonus-box', label: 'Бонусы', icon: Gift },
  { href: '/dashboard/support', label: 'Поддержка', icon: MessageCircleQuestion },
  { href: '/dashboard/settings', label: 'Аккаунт', icon: Settings },
]

export const userPrimaryNavigation = userNavigation.filter((item) => [
  '/dashboard',
  '/dashboard/subscription',
  '/dashboard/plans',
  '/dashboard/support',
].includes(item.href))

export const userSecondaryNavigation = userNavigation.filter((item) => [
  '/dashboard/bonus-box',
  '/dashboard/settings',
].includes(item.href))

export const bottomNavigation: NavigationItem[] = userPrimaryNavigation
export const bottomMoreNavigation: NavigationItem[] = [
  { href: '/dashboard/notifications', label: 'Уведомления', icon: Bell },
  ...userSecondaryNavigation,
]

const legalIcons: Record<LegalPath, LucideIcon> = {
  '/offer': FileCheck2,
  '/terms': BookOpen,
  '/privacy': ShieldCheck,
  '/consent': FileCheck2,
  '/refunds': RotateCcw,
  '/contacts': Mail,
}

export const informationNavigation: NavigationItem[] = legalNavigation.map((item) => ({
  ...item,
  icon: legalIcons[item.href],
}))

export const adminNavigation: NavigationItem[] = [
  { href: '/dashboard/admin', label: 'Обзор', icon: UserCog, exact: true },
  { href: '/dashboard/admin/campaigns', label: 'Кампании', icon: CalendarRange },
  { href: '/dashboard/admin/notifications', label: 'Уведомления', icon: Bell },
  { href: '/dashboard/admin/broadcasts', label: 'Рассылки', icon: Send },
  { href: '/dashboard/admin/support', label: 'Поддержка', icon: MessageCircleQuestion },
  { href: '/dashboard/admin/users', label: 'Пользователи', icon: UsersRound },
  { href: '/dashboard/admin/duplicates', label: 'Дубли аккаунтов', icon: SearchCheck },
  { href: '/dashboard/admin/referrals', label: 'Рефералы', icon: UsersRound },
  { href: '/dashboard/admin/offers', label: 'Предложения', icon: Sparkles },
  { href: '/dashboard/admin/plans', label: 'Тарифы', icon: SlidersHorizontal },
  { href: '/dashboard/admin/promo-codes', label: 'Промокоды', icon: Tag },
  { href: '/dashboard/admin/bonus-box', label: 'Бонусы', icon: Gift },
  { href: '/dashboard/admin/payments', label: 'Платежи', icon: CreditCard },
  { href: '/dashboard/admin/recovery', label: 'Контроль подписок', icon: FileClock },
  { href: '/dashboard/admin/remnashop-sync', label: 'Remnashop', icon: Database },
  { href: '/dashboard/admin/nodes', label: 'Ноды', icon: Server },
  { href: '/dashboard/admin/watch', label: 'Watch', icon: Activity },
  { href: '/dashboard/admin/system', label: 'Настройки', icon: ServerCog },
  { href: '/dashboard/admin/audit', label: 'История', icon: FileClock },
]

export const adminNavigationGroups = [
  {
    title: 'Главное',
    items: [
      '/dashboard/admin',
      '/dashboard/admin/users',
      '/dashboard/admin/payments',
      '/dashboard/admin/support',
    ],
  },
  {
    title: 'Продажи',
    items: [
      '/dashboard/admin/plans',
      '/dashboard/admin/promo-codes',
      '/dashboard/admin/offers',
      '/dashboard/admin/referrals',
      '/dashboard/admin/bonus-box',
      '/dashboard/admin/campaigns',
    ],
  },
  {
    title: 'Коммуникации',
    items: [
      '/dashboard/admin/notifications',
      '/dashboard/admin/broadcasts',
    ],
  },
  {
    title: 'Контроль',
    items: [
      '/dashboard/admin/duplicates',
      '/dashboard/admin/recovery',
    ],
  },
  { title: 'Интеграции', items: ['/dashboard/admin/remnashop-sync', '/dashboard/admin/nodes'] },
  { title: 'Система', items: ['/dashboard/admin/watch', '/dashboard/admin/system', '/dashboard/admin/audit'] },
]

export function filterUserNavigation<T extends NavigationItem>(items: T[], features: FeatureFlags) {
  return items.filter((item) => {
    if (item.href === '/dashboard/referrals') return features.referrals
    if (item.href === '/dashboard/bonus-box') return features.bonusBox
    if (item.href === '/dashboard/support') return features.support
    return true
  })
}

export function getAvailableAdminNavigation(role: UserRole, features: FeatureFlags) {
  const available = adminNavigation.filter((item) => {
    if (item.href === '/dashboard/admin/support') return features.support
    if (item.href === '/dashboard/admin/broadcasts') return features.broadcasts
    if (item.href === '/dashboard/admin/bonus-box') return features.bonusBox
    if (item.href === '/dashboard/admin/referrals') return features.referrals
    return true
  })

  if (role === 'MODERATOR') return available.filter((item) => item.href === '/dashboard/admin/support')
  if (role === 'ADMIN') {
    return available.filter((item) => ![
      '/dashboard/admin/nodes',
      '/dashboard/admin/watch',
      '/dashboard/admin/audit',
    ].includes(item.href))
  }
  return available
}
