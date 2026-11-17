// Навигация нового дизайна (флаг features.newDesign).
// Старый дизайн целиком живёт в dashboard-nav-config.ts и не зависит от этого файла.

import {
  Activity,
  BarChart3,
  CircleUserRound,
  CreditCard,
  Gift,
  Home,
  LifeBuoy,
  MessageCircleQuestion,
  Send,
  ServerCog,
  ShieldCheck,
  Tag,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { FeatureFlags } from '@/lib/feature-flags'
import { getAvailableAdminNavigation, type UserRole } from './dashboard-nav-config'

export type NavLinkV2 = {
  href: string
  label: string
  /** Префиксы адресов, на которых пункт подсвечивается. По умолчанию — сам href. */
  match?: string[]
  exact?: boolean
}

export type NavItemV2 = NavLinkV2 & {
  icon: LucideIcon
  /** Ключ счётчика в NavBadgesProvider. */
  badgeKey?: string
}

export type AdminSectionV2 = NavItemV2 & {
  /** Подразделы в боковом меню (раскрыты всегда). */
  children?: AdminSectionChildV2[]
  /** Вкладки над содержимым страницы. */
  tabs?: NavLinkV2[]
}

export type AdminSectionChildV2 = NavLinkV2 & {
  tabs?: NavLinkV2[]
}

export function isNavLinkActive(link: NavLinkV2, pathname: string) {
  if (link.exact) return pathname === link.href
  const prefixes = link.match ?? [link.href]
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

// ---------------------------------------------------------------------------
// Кабинет пользователя
// ---------------------------------------------------------------------------

const userHome: NavItemV2 = { href: '/dashboard', label: 'Главная', icon: Home, exact: true }
const userVpn: NavItemV2 = {
  href: '/dashboard/subscription',
  label: 'VPN',
  icon: ShieldCheck,
  match: ['/dashboard/subscription', '/dashboard/devices'],
}
const userSubscription: NavItemV2 = {
  href: '/dashboard/billing',
  label: 'Подписка',
  icon: CreditCard,
  match: ['/dashboard/billing', '/dashboard/plans'],
}
const userBonuses: NavItemV2 = {
  href: '/dashboard/bonus-box',
  label: 'Бонусы',
  icon: Gift,
  match: ['/dashboard/bonus-box', '/dashboard/referrals'],
}
const userInvite: NavItemV2 = {
  href: '/dashboard/referrals',
  label: 'Пригласить друга',
  icon: Gift,
}
const userHelp: NavItemV2 = {
  href: '/dashboard/support',
  label: 'Помощь',
  icon: LifeBuoy,
  badgeKey: '/dashboard/support',
}
const userProfile: NavItemV2 = {
  href: '/dashboard/settings',
  label: 'Профиль',
  icon: CircleUserRound,
  match: ['/dashboard/settings', '/dashboard/notifications'],
}

/** Боковое меню на ПК: всё, что есть у пользователя, без группы «Ещё». */
export function getUserSidebarNavigation(features: FeatureFlags): NavItemV2[] {
  return [
    userHome,
    userVpn,
    userSubscription,
    ...(features.bonusBox ? [userBonuses] : features.referrals ? [userInvite] : []),
    ...(features.support ? [userHelp] : []),
    userProfile,
  ]
}

/** Нижнее меню на телефоне: не больше пяти разделов. Бонусы — иконкой в верхней полосе. */
export function getUserTabNavigation(features: FeatureFlags): NavItemV2[] {
  return [
    userHome,
    userVpn,
    userSubscription,
    ...(features.support ? [userHelp] : []),
    userProfile,
  ]
}

// ---------------------------------------------------------------------------
// Админка: 8 разделов вместо 21 пункта
// ---------------------------------------------------------------------------

export const adminSectionsV2: AdminSectionV2[] = [
  {
    href: '/dashboard/admin',
    label: 'Сегодня',
    icon: Activity,
    match: ['/dashboard/admin/notifications'],
    exact: false,
    badgeKey: '/dashboard/admin/notifications',
    tabs: [
      { href: '/dashboard/admin', label: 'Что требует внимания', exact: true },
      { href: '/dashboard/admin/notifications', label: 'Уведомления' },
    ],
  },
  {
    href: '/dashboard/admin/users',
    label: 'Клиенты',
    icon: UsersRound,
    match: ['/dashboard/admin/users', '/dashboard/admin/whitelist-addons', '/dashboard/admin/duplicates'],
    tabs: [
      { href: '/dashboard/admin/users', label: 'Все клиенты' },
      { href: '/dashboard/admin/whitelist-addons', label: 'Белые списки' },
      { href: '/dashboard/admin/duplicates', label: 'Возможные дубли' },
    ],
  },
  {
    href: '/dashboard/admin/payments',
    label: 'Платежи',
    icon: CreditCard,
    match: ['/dashboard/admin/payments', '/dashboard/admin/recovery'],
    tabs: [
      { href: '/dashboard/admin/payments', label: 'Все платежи' },
      { href: '/dashboard/admin/recovery', label: 'Контроль выдачи' },
    ],
  },
  {
    href: '/dashboard/admin/support',
    label: 'Поддержка',
    icon: MessageCircleQuestion,
    badgeKey: '/dashboard/admin/support',
  },
  {
    href: '/dashboard/admin/plans',
    label: 'Продажи',
    icon: Tag,
    match: [
      '/dashboard/admin/plans',
      '/dashboard/admin/promo-codes',
      '/dashboard/admin/offers',
      '/dashboard/admin/campaigns',
      '/dashboard/admin/referrals',
      '/dashboard/admin/bonus-box',
    ],
    children: [
      { href: '/dashboard/admin/plans', label: 'Тарифы' },
      {
        href: '/dashboard/admin/promo-codes',
        label: 'Промокоды и акции',
        match: ['/dashboard/admin/promo-codes', '/dashboard/admin/offers', '/dashboard/admin/campaigns'],
        tabs: [
          { href: '/dashboard/admin/promo-codes', label: 'Промокоды' },
          { href: '/dashboard/admin/offers', label: 'Предложения' },
          { href: '/dashboard/admin/campaigns', label: 'Все акции' },
        ],
      },
      { href: '/dashboard/admin/referrals', label: 'Рефералы' },
      { href: '/dashboard/admin/bonus-box', label: 'Бонусы' },
    ],
  },
  { href: '/dashboard/admin/broadcasts', label: 'Рассылки', icon: Send },
  { href: '/dashboard/admin/analytics', label: 'Аналитика', icon: BarChart3 },
  {
    href: '/dashboard/admin/system',
    label: 'Система',
    icon: ServerCog,
    match: [
      '/dashboard/admin/system',
      '/dashboard/admin/remnashop-sync',
      '/dashboard/admin/nodes',
      '/dashboard/admin/watch',
      '/dashboard/admin/audit',
    ],
    tabs: [
      { href: '/dashboard/admin/system', label: 'Настройки' },
      { href: '/dashboard/admin/remnashop-sync', label: 'Remnashop' },
      { href: '/dashboard/admin/nodes', label: 'Ноды' },
      { href: '/dashboard/admin/watch', label: 'Мониторинг' },
      { href: '/dashboard/admin/audit', label: 'Журнал действий' },
    ],
  },
]

// «Сегодня» подсвечивается только на своих страницах, а не на всех /dashboard/admin/*.
function isAdminSectionActive(section: AdminSectionV2, pathname: string) {
  if (section.href === '/dashboard/admin') {
    return pathname === '/dashboard/admin' || (section.match ?? []).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  }
  return isNavLinkActive(section, pathname)
}

/**
 * Разделы админки с учётом роли и включённых функций.
 * Права не меняются: доступность каждого адреса берётся из getAvailableAdminNavigation.
 */
export function getAdminSectionsV2(role: UserRole, features: FeatureFlags): AdminSectionV2[] {
  const allowed = new Set(getAvailableAdminNavigation(role, features).map((item) => item.href))
  const allowLinks = <T extends NavLinkV2>(links: T[] | undefined) => (links ?? []).filter((link) => allowed.has(link.href))

  return adminSectionsV2.flatMap((section) => {
    const children = section.children
      ?.filter((child) => allowed.has(child.href))
      .map((child) => ({ ...child, tabs: allowLinks(child.tabs) }))
    const tabs = allowLinks(section.tabs)
    const candidates = [section.href, ...tabs.map((tab) => tab.href), ...(children ?? []).map((child) => child.href)]
    const href = candidates.find((candidate) => allowed.has(candidate))
    if (!href) return []
    return [{ ...section, href, tabs, children }]
  })
}

export function findActiveAdminSection(sections: AdminSectionV2[], pathname: string) {
  return sections.find((section) => isAdminSectionActive(section, pathname)) ?? null
}

/** Вкладки над страницей: показываем, только если в разделе их больше одной. */
export function getAdminSectionTabs(sections: AdminSectionV2[], pathname: string): NavLinkV2[] {
  const section = findActiveAdminSection(sections, pathname)
  if (!section) return []
  const child = section.children?.find((item) => isNavLinkActive(item, pathname))
  const tabs = child?.tabs?.length ? child.tabs : section.tabs ?? []
  return tabs.length > 1 ? tabs : []
}

export function isAdminSectionLinkActive(section: AdminSectionV2, pathname: string) {
  return isAdminSectionActive(section, pathname)
}

/** Плоский список адресов админки для поиска ⌘K. */
export function getAdminCommandItems(sections: AdminSectionV2[]) {
  const items = sections.flatMap((section) => {
    const links: Array<{ href: string; label: string; group: string; keywords?: string[] }> = []
    // У раздела с подразделами («Продажи») своей страницы нет: его адрес совпадает с первым подразделом.
    const tabs = section.tabs?.length
      ? section.tabs
      : section.children?.length
        ? []
        : [{ href: section.href, label: section.label }]
    for (const tab of tabs) {
      links.push({
        href: tab.href,
        label: tab.label === section.label ? section.label : `${section.label} · ${tab.label}`,
        group: 'Разделы',
      })
    }
    for (const child of section.children ?? []) {
      const childTabs = child.tabs?.length ? child.tabs : [{ href: child.href, label: child.label }]
      for (const tab of childTabs) {
        links.push({
          href: tab.href,
          label: tab.label === child.label ? `${section.label} · ${child.label}` : `${child.label} · ${tab.label}`,
          group: 'Разделы',
        })
      }
    }
    return links
  })
  // Один адрес — одна строка поиска: иначе дубли в списке и одинаковые ключи в React.
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.href)) return false
    seen.add(item.href)
    return true
  })
}

/** Мобильное нижнее меню админки: четыре главных раздела + «Ещё». */
export const adminMobilePrimaryHrefs = ['/dashboard/admin', '/dashboard/admin/users', '/dashboard/admin/payments', '/dashboard/admin/support']
