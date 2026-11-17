'use client'

// Навигация нового дизайна. Включается флагом features.newDesign в layout кабинета.

import { type ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Gift, Home, MoreHorizontal, UserCog, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { FeatureFlags } from '@/lib/feature-flags'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import { Brand, useNavBadgeValues } from './dashboard-nav'
import type { UserRole } from './dashboard-nav-config'
import { LogoutButton } from './logout-button'
import {
  adminMobilePrimaryHrefs,
  getAdminSectionTabs,
  getAdminSectionsV2,
  getUserSidebarNavigation,
  getUserTabNavigation,
  isAdminSectionLinkActive,
  isNavLinkActive,
  type AdminSectionV2,
  type NavItemV2,
} from './dashboard-nav-v2-config'

type NavBadges = Record<string, number>

function useAdminArea(role: UserRole) {
  const pathname = usePathname()
  return { pathname, adminArea: role !== 'USER' && pathname.startsWith('/dashboard/admin') }
}

function formatBadge(value: number, max = 99) {
  return value > max ? `${max}+` : String(value)
}

// ---------------------------------------------------------------------------
// Боковое меню (ПК)
// ---------------------------------------------------------------------------

export function SidebarNavV2({
  role,
  features,
  badges = {},
  adminSearch,
}: {
  role: UserRole
  features: FeatureFlags
  badges?: NavBadges
  adminSearch?: ReactNode
}) {
  const { pathname, adminArea } = useAdminArea(role)
  const liveBadges = useNavBadgeValues(badges)
  const adminBadge = liveBadges['/dashboard/admin/notifications'] ?? 0

  return (
    <nav aria-label="Основное меню" className="space-y-3 py-1">
      {role !== 'USER' ? <WorkspaceSwitchV2 adminArea={adminArea} adminBadge={adminArea ? 0 : adminBadge} /> : null}
      {adminArea ? (
        <>
          {adminSearch}
          <AdminSidebarSections role={role} features={features} pathname={pathname} badges={liveBadges} />
        </>
      ) : (
        <div className="space-y-1">
          {getUserSidebarNavigation(features).map((item) => (
            <SidebarLink key={item.href} item={item} active={isNavLinkActive(item, pathname)} badge={item.badgeKey ? liveBadges[item.badgeKey] : 0} />
          ))}
        </div>
      )}
    </nav>
  )
}

function SidebarLink({
  item,
  active,
  badge = 0,
  nested = false,
  onNavigate,
}: {
  item: { href: string; label: string; icon?: NavItemV2['icon'] }
  active: boolean
  badge?: number
  nested?: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-10 items-center gap-3 rounded-[9px] px-3 py-2 text-sm font-medium transition-colors duration-150',
        nested && 'min-h-9 pl-10 text-[13px]',
        active ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
      )}
    >
      {Icon ? <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-600' : 'text-slate-500')} /> : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge > 0 ? (
        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">
          {formatBadge(badge)}
        </span>
      ) : null}
    </Link>
  )
}

function AdminSidebarSections({
  role,
  features,
  pathname,
  badges,
  onNavigate,
}: {
  role: UserRole
  features: FeatureFlags
  pathname: string
  badges: NavBadges
  onNavigate?: () => void
}) {
  const sections = getAdminSectionsV2(role, features)
  return (
    <div className="space-y-1">
      {sections.map((section) => (
        <AdminSidebarSection key={section.label} section={section} pathname={pathname} badges={badges} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function AdminSidebarSection({
  section,
  pathname,
  badges,
  onNavigate,
}: {
  section: AdminSectionV2
  pathname: string
  badges: NavBadges
  onNavigate?: () => void
}) {
  const children = section.children ?? []
  if (children.length > 0) {
    const Icon = section.icon
    return (
      <div className="pt-1">
        <div className="flex min-h-9 items-center gap-3 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          <Icon className="h-4 w-4 shrink-0" />
          {section.label}
        </div>
        <div className="space-y-0.5">
          {children.map((child) => (
            <SidebarLink key={child.href} item={child} nested active={isNavLinkActive(child, pathname)} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    )
  }
  return (
    <SidebarLink
      item={section}
      active={isAdminSectionLinkActive(section, pathname)}
      badge={section.badgeKey ? badges[section.badgeKey] : 0}
      onNavigate={onNavigate}
    />
  )
}

function WorkspaceSwitchV2({
  adminArea,
  adminBadge = 0,
  onNavigate,
}: {
  adminArea: boolean
  adminBadge?: number
  onNavigate?: () => void
}) {
  const linkClass = (active: boolean) => cn(
    'flex h-9 items-center justify-center gap-1.5 rounded-[7px] px-2 text-xs font-semibold transition-colors',
    active ? 'bg-white text-slate-950' : 'text-slate-400 hover:text-white'
  )
  return (
    <div className="grid grid-cols-2 rounded-[10px] border border-white/10 bg-white/[0.04] p-1">
      <Link href="/dashboard" onClick={onNavigate} className={linkClass(!adminArea)} aria-current={!adminArea ? 'page' : undefined}>
        <Home className="h-3.5 w-3.5" />
        Кабинет
      </Link>
      <Link href="/dashboard/admin" onClick={onNavigate} className={linkClass(adminArea)} aria-current={adminArea ? 'page' : undefined}>
        <UserCog className="h-3.5 w-3.5" />
        Админка
        {adminBadge > 0 ? (
          <span aria-hidden="true" className="grid h-4 min-w-4 place-items-center rounded-full bg-cyan-500 px-1 text-[9px] leading-4 text-white">
            {formatBadge(adminBadge, 9)}
          </span>
        ) : null}
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Верхняя полоса: бонусы и уведомления. На ПК логотип уже есть в боковом меню.
// ---------------------------------------------------------------------------

export function MobileTopBarV2({
  brandName,
  showBonus,
  bonusAttempts,
  bell,
}: {
  brandName: string
  showBonus: boolean
  bonusAttempts: number
  bell: ReactNode
}) {
  const pathname = usePathname()
  const bonusActive = pathname.startsWith('/dashboard/bonus-box')
  // В админке бонусы пользователя не нужны: оставляем только колокольчик.
  const bonusVisible = showBonus && !pathname.startsWith('/dashboard/admin')
  return (
    <header className="dashboard-topbar-v2 sticky top-0 z-40 border-b border-slate-200/80 bg-[color-mix(in_srgb,var(--app-bg)_92%,transparent)] backdrop-blur dark:border-white/[0.07] xl:static xl:border-transparent xl:bg-transparent xl:backdrop-blur-none">
      <div className="mx-auto flex h-14 max-w-[92rem] items-center gap-2 px-4 sm:px-7 xl:h-auto xl:px-9 xl:pt-7">
        <div className="min-w-0 flex-1 xl:invisible">
          <Brand compact brandName={brandName} />
        </div>
        {bonusVisible ? (
          <Link
            href="/dashboard/bonus-box"
            aria-label={bonusAttempts > 0 ? `Бонусы: ${bonusAttempts} попыток` : 'Бонусы'}
            aria-current={bonusActive ? 'page' : undefined}
            className={cn(
              'relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-white text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-white',
              bonusActive ? 'border-brand-400 text-brand-700 dark:border-brand-300/60 dark:text-brand-200' : 'border-slate-200 dark:border-white/10'
            )}
          >
            <Gift className="h-5 w-5" />
            {bonusAttempts > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">
                {formatBadge(bonusAttempts, 9)}
              </span>
            ) : null}
          </Link>
        ) : null}
        {bell}
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Нижнее меню (телефон и планшет)
// ---------------------------------------------------------------------------

export function MobileTabBarV2({
  role,
  features,
  badges = {},
}: {
  role: UserRole
  features: FeatureFlags
  badges?: NavBadges
}) {
  const { pathname, adminArea } = useAdminArea(role)
  const liveBadges = useNavBadgeValues(badges)
  const [moreOpen, setMoreOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null)
  const moreDialogRef = useRef<HTMLDivElement | null>(null)
  const moreCloseRef = useRef<HTMLButtonElement | null>(null)
  const closeMore = () => setMoreOpen(false)

  useBodyScrollLock(moreOpen)
  useDialogFocus({ open: moreOpen, onClose: closeMore, dialogRef: moreDialogRef, initialFocusRef: moreCloseRef, returnFocusRef: moreTriggerRef })
  useEffect(() => setMounted(true), [])

  const adminSections = adminArea ? getAdminSectionsV2(role, features) : []
  const tabs: Array<NavItemV2 & { active: boolean }> = adminArea
    ? adminSections
        .filter((section) => adminMobilePrimaryHrefs.includes(section.href))
        .map((section) => ({ ...section, active: isAdminSectionLinkActive(section, pathname) }))
    : getUserTabNavigation(features).map((item) => ({ ...item, active: isNavLinkActive(item, pathname) }))
  const moreSections = adminArea ? adminSections.filter((section) => !adminMobilePrimaryHrefs.includes(section.href)) : []
  const moreActive = moreSections.some((section) => isAdminSectionLinkActive(section, pathname))
  const showMore = adminArea && moreSections.length > 0
  const columns = tabs.length + (showMore ? 1 : 0)

  return (
    <nav
      aria-label="Нижнее меню"
      className="dashboard-mobile-nav fixed inset-x-2 bottom-[var(--app-mobile-nav-offset)] z-40 rounded-xl border p-1.5 backdrop-blur xl:hidden"
    >
      <div className="mx-auto grid max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, minmax(0, 1fr))` }}>
        {tabs.map((item) => {
          const Icon = item.icon
          const badge = item.badgeKey ? liveBadges[item.badgeKey] ?? 0 : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border-t-2 px-0.5 py-1.5 text-[11px] font-semibold tracking-[-0.01em] transition-colors min-[400px]:text-xs',
                item.active
                  ? 'border-cyan-600 bg-white text-slate-950 dark:border-cyan-300 dark:bg-white/[0.06] dark:text-white'
                  : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-white'
              )}
            >
              <span className="relative">
                <Icon className={cn('h-[18px] w-[18px]', item.active && 'stroke-[2.5]')} />
                {badge > 0 ? (
                  <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-cyan-500 px-1 text-[10px] leading-4 text-white">
                    {formatBadge(badge, 9)}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          )
        })}
        {showMore ? (
          <button
            ref={moreTriggerRef}
            type="button"
            aria-expanded={moreOpen}
            aria-controls="mobile-admin-more"
            aria-haspopup="dialog"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border-t-2 px-1 py-1.5 text-xs font-semibold transition-colors',
              moreActive
                ? 'border-cyan-600 bg-white text-slate-950 dark:border-cyan-300 dark:bg-white/[0.06] dark:text-white'
                : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-white'
            )}
          >
            <MoreHorizontal className="h-[18px] w-[18px]" />
            <span className="max-w-full truncate">Ещё</span>
          </button>
        ) : null}
      </div>
      {showMore && mounted && moreOpen ? createPortal(
        <div className="fixed inset-0 z-[95] h-dvh w-dvw xl:hidden">
          <button type="button" className="absolute inset-0 bg-slate-950/40" onClick={closeMore} aria-label="Закрыть меню" />
          <div
            id="mobile-admin-more"
            ref={moreDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-admin-more-title"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-var(--app-safe-top)-1rem)] overflow-y-auto overscroll-contain rounded-t-xl border border-slate-300 bg-surface-50 p-4 pb-[calc(var(--app-safe-bottom)+1rem)] shadow-xl dark:border-white/10 dark:bg-surface-950"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div id="mobile-admin-more-title" className="font-semibold text-slate-950 dark:text-white">Разделы админки</div>
              <button
                ref={moreCloseRef}
                type="button"
                className="grid h-11 w-11 place-items-center rounded-md border bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
                onClick={closeMore}
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              {moreSections.map((section) => {
                const links = section.children?.length
                  ? section.children
                  : section.tabs?.length
                    ? section.tabs
                    : [{ href: section.href, label: section.label }]
                return (
                  <section key={section.label}>
                    <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{section.label}</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {links.map((link) => {
                        const active = isNavLinkActive(link, pathname)
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={closeMore}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex min-h-12 min-w-0 items-center rounded-md border px-3 py-2 text-sm font-semibold transition',
                              active
                                ? 'border-slate-300 bg-slate-100 text-slate-950 dark:border-white/15 dark:bg-white/10 dark:text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
                            )}
                          >
                            <span className="truncate">{link.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
              <Link
                href="/dashboard"
                onClick={closeMore}
                className="flex min-h-12 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200"
              >
                <Home className="h-4 w-4" />
                Вернуться в кабинет
              </Link>
            </div>
            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/10">
              <LogoutButton />
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Вкладки раздела админки (над содержимым страницы)
// ---------------------------------------------------------------------------

export function AdminSectionTabsV2({ role, features }: { role: UserRole; features: FeatureFlags }) {
  const pathname = usePathname()
  const tabs = getAdminSectionTabs(getAdminSectionsV2(role, features), pathname)
  if (tabs.length === 0) return null
  return (
    <nav aria-label="Подразделы" className="-mx-1 mb-5 overflow-x-auto px-1 sm:mb-6" data-swipe-navigation="ignore">
      <div className="flex min-w-max gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.03]">
        {tabs.map((tab) => {
          const active = isNavLinkActive(tab, pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors',
                active
                  ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
