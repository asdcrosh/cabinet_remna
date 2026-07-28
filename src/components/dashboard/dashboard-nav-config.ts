import {
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
  { href: '/dashboard/settings', label: 'Аккаунт', icon: Settings },
]

export const bottomNavigation: NavigationItem[] = [...userNavigation]
export const bottomMoreNavigation: NavigationItem[] = []

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
  { href: '/dashboard/admin/duplicates', label: 'Дубли', icon: SearchCheck },
  { href: '/dashboard/admin/referrals', label: 'Рефералы', icon: UsersRound },
  { href: '/dashboard/admin/offers', label: 'Офферы', icon: Sparkles },
  { href: '/dashboard/admin/plans', label: 'Тарифы', icon: SlidersHorizontal },
  { href: '/dashboard/admin/promo-codes', label: 'Промокоды', icon: Tag },
  { href: '/dashboard/admin/bonus-box', label: 'Подарки', icon: Gift },
  { href: '/dashboard/admin/payments', label: 'Платежи', icon: CreditCard },
  { href: '/dashboard/admin/recovery', label: 'Довыдача', icon: FileClock },
  { href: '/dashboard/admin/remnashop-sync', label: 'Синхронизация', icon: Database },
  { href: '/dashboard/admin/system', label: 'Система', icon: ServerCog },
  { href: '/dashboard/admin/audit', label: 'История', icon: FileClock },
]

export const adminNavigationGroups = [
  {
    title: 'Очередь',
    items: [
      '/dashboard/admin',
      '/dashboard/admin/duplicates',
      '/dashboard/admin/recovery',
      '/dashboard/admin/remnashop-sync',
    ],
  },
  { title: 'Пользователи', items: ['/dashboard/admin/users'] },
  {
    title: 'Продажи',
    items: [
      '/dashboard/admin/payments',
      '/dashboard/admin/plans',
      '/dashboard/admin/campaigns',
      '/dashboard/admin/referrals',
      '/dashboard/admin/offers',
      '/dashboard/admin/promo-codes',
      '/dashboard/admin/bonus-box',
    ],
  },
  {
    title: 'Коммуникации',
    items: [
      '/dashboard/admin/notifications',
      '/dashboard/admin/broadcasts',
      '/dashboard/admin/support',
    ],
  },
  { title: 'Настройки', items: ['/dashboard/admin/system', '/dashboard/admin/audit'] },
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
  if (role === 'ADMIN') return available.filter((item) => item.href !== '/dashboard/admin/audit')
  return available
}

export function userRoleLabel(role: UserRole) {
  if (role === 'SUPER_ADMIN') return 'Главный администратор'
  if (role === 'ADMIN') return 'Администратор'
  if (role === 'MODERATOR') return 'Модератор поддержки'
  return 'Аккаунт пользователя'
}
