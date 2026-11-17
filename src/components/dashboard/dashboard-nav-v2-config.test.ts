import { describe, expect, it } from 'vitest'
import type { FeatureFlags } from '@/lib/feature-flags'
import {
  findActiveAdminSection,
  getAdminCommandItems,
  getAdminSectionTabs,
  getAdminSectionsV2,
  getUserSidebarNavigation,
  getUserTabNavigation,
  isNavLinkActive,
} from './dashboard-nav-v2-config'
import { getAvailableAdminNavigation } from './dashboard-nav-config'

const allFeatures: FeatureFlags = { referrals: true, bonusBox: true, support: true, broadcasts: true, newDesign: true }

describe('user navigation v2', () => {
  it('keeps the phone tab bar at five sections and moves bonuses out of it', () => {
    const tabs = getUserTabNavigation(allFeatures).map((item) => item.label)
    expect(tabs).toEqual(['Главная', 'VPN', 'Подписка', 'Помощь', 'Профиль'])
  })

  it('shows every section in the desktop sidebar, including the ones hidden before', () => {
    const items = getUserSidebarNavigation(allFeatures).map((item) => item.href)
    expect(items).toEqual([
      '/dashboard',
      '/dashboard/subscription',
      '/dashboard/billing',
      '/dashboard/bonus-box',
      '/dashboard/support',
      '/dashboard/settings',
    ])
  })

  it('falls back to the invite page when bonuses are off but referrals are on', () => {
    const items = getUserSidebarNavigation({ ...allFeatures, bonusBox: false }).map((item) => item.href)
    expect(items).toContain('/dashboard/referrals')
    expect(items).not.toContain('/dashboard/bonus-box')
  })

  it('hides help when support is disabled', () => {
    expect(getUserTabNavigation({ ...allFeatures, support: false }).map((item) => item.label)).not.toContain('Помощь')
  })

  it('highlights merged sections on their old addresses', () => {
    const [, vpn, subscription] = getUserTabNavigation(allFeatures)
    expect(isNavLinkActive(vpn!, '/dashboard/devices')).toBe(true)
    expect(isNavLinkActive(subscription!, '/dashboard/plans')).toBe(true)
    expect(isNavLinkActive(subscription!, '/dashboard/billingx')).toBe(false)
    const home = getUserTabNavigation(allFeatures)[0]!
    expect(isNavLinkActive(home, '/dashboard/billing')).toBe(false)
  })
})

describe('admin navigation v2', () => {
  it('groups the super admin menu into eight sections', () => {
    const sections = getAdminSectionsV2('SUPER_ADMIN', allFeatures)
    expect(sections.map((section) => section.label)).toEqual([
      'Сегодня',
      'Клиенты',
      'Платежи',
      'Поддержка',
      'Продажи',
      'Рассылки',
      'Аналитика',
      'Система',
    ])
  })

  it('keeps every old admin page reachable from the new menu', () => {
    const sections = getAdminSectionsV2('SUPER_ADMIN', allFeatures)
    const reachable = new Set(getAdminCommandItems(sections).map((item) => item.href))
    // Берём список из старой навигации: новая страница админки без места в новом меню уронит тест.
    for (const { href } of getAvailableAdminNavigation('SUPER_ADMIN', allFeatures)) {
      expect(reachable.has(href), href).toBe(true)
    }
  })

  it('lists every address in the admin search only once', () => {
    const items = getAdminCommandItems(getAdminSectionsV2('SUPER_ADMIN', allFeatures))
    const hrefs = items.map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(items.find((item) => item.href === '/dashboard/admin/plans')?.label).toBe('Продажи · Тарифы')
  })

  it('does not widen access: admins still do not see nodes, watch and audit', () => {
    const sections = getAdminSectionsV2('ADMIN', allFeatures)
    const reachable = getAdminCommandItems(sections).map((item) => item.href)
    expect(reachable).not.toContain('/dashboard/admin/nodes')
    expect(reachable).not.toContain('/dashboard/admin/watch')
    expect(reachable).not.toContain('/dashboard/admin/audit')
    const system = sections.find((section) => section.label === 'Система')!
    expect(system.tabs?.map((tab) => tab.label)).toEqual(['Настройки', 'Remnashop'])
  })

  it('gives moderators only support', () => {
    const sections = getAdminSectionsV2('MODERATOR', allFeatures)
    expect(sections.map((section) => section.label)).toEqual(['Поддержка'])
  })

  it('drops disabled features from sections', () => {
    const sections = getAdminSectionsV2('SUPER_ADMIN', { ...allFeatures, broadcasts: false, bonusBox: false })
    expect(sections.map((section) => section.label)).not.toContain('Рассылки')
    const sales = sections.find((section) => section.label === 'Продажи')!
    expect(sales.children?.map((child) => child.label)).not.toContain('Бонусы')
  })

  it('shows section tabs for merged pages and highlights the right section', () => {
    const sections = getAdminSectionsV2('SUPER_ADMIN', allFeatures)
    expect(findActiveAdminSection(sections, '/dashboard/admin/recovery')?.label).toBe('Платежи')
    expect(findActiveAdminSection(sections, '/dashboard/admin/users/user-1')?.label).toBe('Клиенты')
    expect(findActiveAdminSection(sections, '/dashboard/admin/offers')?.label).toBe('Продажи')
    expect(findActiveAdminSection(sections, '/dashboard/admin')?.label).toBe('Сегодня')
    expect(findActiveAdminSection(sections, '/dashboard/admin/plans')?.label).toBe('Продажи')

    expect(getAdminSectionTabs(sections, '/dashboard/admin/offers').map((tab) => tab.label)).toEqual(['Промокоды', 'Предложения', 'Все акции'])
    expect(getAdminSectionTabs(sections, '/dashboard/admin/plans')).toEqual([])
    expect(getAdminSectionTabs(sections, '/dashboard/admin/support')).toEqual([])
  })
})
