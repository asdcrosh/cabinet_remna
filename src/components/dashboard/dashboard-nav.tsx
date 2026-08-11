'use client'

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  Home,
  MoreHorizontal,
  UserCog,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { BrandLogo } from '@/components/brand-logo'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import type { FeatureFlags } from '@/lib/feature-flags'
import { LogoutButton } from './logout-button'
import {
  adminNavigationGroups,
  bottomMoreNavigation,
  bottomNavigation,
  filterUserNavigation,
  getAvailableAdminNavigation,
  informationNavigation,
  userNavigation,
  type NavigationItem,
  type UserRole,
} from './dashboard-nav-config'

const NAV_BADGES_REFRESH_MS = 15_000

type NavItem = NavigationItem
type NavBadges = Record<string, number>

const NavBadgesContext = createContext<NavBadges | null>(null)

export function NavBadgesProvider({
  initialBadges,
  supportEnabled,
  showAdmin = false,
  children,
}: {
  initialBadges: NavBadges
  supportEnabled: boolean
  showAdmin?: boolean
  children: ReactNode
}) {
  const badges = useLiveBadges(initialBadges, supportEnabled, showAdmin)
  return <NavBadgesContext.Provider value={badges}>{children}</NavBadgesContext.Provider>
}

export function DashboardNav({
  role,
  badges = {},
  features,
}: {
  role: UserRole
  badges?: NavBadges
  features: FeatureFlags
}) {
  return <NavList role={role} badges={badges} features={features} className="space-y-1 py-1" />
}

export function MobileBottomNav({
  role,
  badges = {},
  features,
}: {
  role: UserRole
  badges?: NavBadges
  features: FeatureFlags
}) {
  const pathname = usePathname()
  const router = useRouter()
  const liveBadges = useNavBadgeValues(badges)
  const adminArea = pathname.startsWith('/dashboard/admin') && role !== 'USER'
  const availableAdminItems = adminArea ? getAvailableAdminNavigation(role, features) : []
  const adminPrimaryHrefs = new Set([
    '/dashboard/admin',
    '/dashboard/admin/users',
    '/dashboard/admin/payments',
    '/dashboard/admin/support',
  ])
  const items = adminArea
    ? availableAdminItems.filter((item) => adminPrimaryHrefs.has(item.href))
    : filterUserNavigation(bottomNavigation, features)
  const accountMoreItems = filterUserNavigation(bottomMoreNavigation, features)
  const moreItems = adminArea
    ? availableAdminItems.filter((item) => !adminPrimaryHrefs.has(item.href))
    : []
  const showMore = adminArea || accountMoreItems.length > 0
  const swipeHrefKey = adminArea ? '' : filterUserNavigation(userNavigation, features).map((item) => item.href).join('\n')
  const [moreOpen, setMoreOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const swipeStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null)
  const moreDialogRef = useRef<HTMLDivElement | null>(null)
  const moreCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeMore = () => setMoreOpen(false)
  const visibleMoreItems = adminArea ? moreItems : accountMoreItems
  const adminWorkspaceBadge = !adminArea && role !== 'USER'
    ? (liveBadges['/dashboard/admin/notifications'] ?? 0)
    : 0
  const moreActive = visibleMoreItems.some((item) => ('exact' in item && item.exact) ? pathname === item.href : pathname.startsWith(item.href))
  const moreBadge = visibleMoreItems.reduce((total, item) => total + (liveBadges[item.href] ?? 0), adminWorkspaceBadge)

  useBodyScrollLock(moreOpen)
  useDialogFocus({ open: moreOpen, onClose: closeMore, dialogRef: moreDialogRef, initialFocusRef: moreCloseButtonRef, returnFocusRef: moreTriggerRef })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!swipeHrefKey || moreOpen) return

    const content = document.getElementById('dashboard-content')
    if (!content) return

    const swipeHrefs = swipeHrefKey.split('\n')
    const activeIndex = swipeHrefs.findIndex((href) =>
      href === '/dashboard' ? pathname === href : pathname.startsWith(href)
    )
    if (activeIndex < 0) return

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (
        window.matchMedia('(min-width: 1024px)').matches ||
        event.touches.length !== 1 ||
        !touch ||
        touch.clientX < 24 ||
        touch.clientX > window.innerWidth - 24 ||
        shouldIgnoreDashboardSwipe(event.target)
      ) {
        swipeStartRef.current = null
        return
      }

      swipeStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      }
    }

    const onTouchEnd = (event: TouchEvent) => {
      const start = swipeStartRef.current
      const touch = event.changedTouches[0]
      swipeStartRef.current = null
      if (!start || !touch || Date.now() - start.time > 800) return

      const deltaX = touch.clientX - start.x
      const deltaY = touch.clientY - start.y
      const horizontalDistance = Math.abs(deltaX)
      if (horizontalDistance < 64 || horizontalDistance < Math.abs(deltaY) * 1.35) return

      const nextIndex = deltaX < 0 ? activeIndex + 1 : activeIndex - 1
      const destination = swipeHrefs[nextIndex]
      if (destination) router.push(destination)
    }

    const onTouchCancel = () => {
      swipeStartRef.current = null
    }

    content.addEventListener('touchstart', onTouchStart, { passive: true })
    content.addEventListener('touchend', onTouchEnd, { passive: true })
    content.addEventListener('touchcancel', onTouchCancel, { passive: true })

    return () => {
      content.removeEventListener('touchstart', onTouchStart)
      content.removeEventListener('touchend', onTouchEnd)
      content.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [moreOpen, pathname, router, swipeHrefKey])

  const moreDrawer = (
    <div className="fixed inset-0 z-[95] h-dvh w-dvw lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40"
        onClick={closeMore}
        aria-label="Закрыть меню"
      />
      <div
        id="mobile-more-menu"
        ref={moreDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-more-menu-title"
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-var(--telegram-miniapp-safe-top)-1rem)] overflow-y-auto overscroll-contain rounded-t-xl border border-slate-300 bg-surface-50 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-xl dark:border-white/10 dark:bg-surface-950"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div id="mobile-more-menu-title" className="font-semibold text-slate-950 dark:text-white">{adminArea ? 'Разделы админки' : 'Ещё'}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{adminArea ? 'Инструменты сгруппированы по задачам' : 'Разделы кабинета'}</div>
          </div>
          <button
            ref={moreCloseButtonRef}
            type="button"
            className="grid h-11 w-11 place-items-center rounded-md border bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={closeMore}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {adminArea ? (
          <div className="space-y-4">
            <WorkspaceSwitch adminArea onNavigate={closeMore} />
            <MobileAdminMoreSections
              items={moreItems}
              pathname={pathname}
              badges={liveBadges}
              onNavigate={closeMore}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {role !== 'USER' ? (
              <WorkspaceSwitch adminArea={false} adminBadge={adminWorkspaceBadge} onNavigate={closeMore} />
            ) : null}
            <MobileMoreSection
              title="Кабинет"
              items={accountMoreItems}
              pathname={pathname}
              badges={liveBadges}
              onNavigate={closeMore}
            />
            <MobileMoreSection
              title="Информация"
              items={informationNavigation}
              pathname={pathname}
              badges={liveBadges}
              onNavigate={closeMore}
            />
          </div>
        )}
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/10">
          <LogoutButton />
        </div>
      </div>
    </div>
  )

  return (
    <nav
      aria-label="Основная мобильная навигация"
      className="dashboard-mobile-nav fixed inset-x-2 bottom-[max(.5rem,env(safe-area-inset-bottom),var(--tg-content-safe-area-inset-bottom,0px),var(--telegram-miniapp-bottom-offset,0px))] z-40 rounded-xl border p-1.5 backdrop-blur lg:hidden"
    >
      <div
        className="mx-auto grid max-w-md gap-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length + (showMore ? 1 : 0))}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = item.icon
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          const badge = liveBadges[item.href] ?? 0

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border-t-2 px-1 py-1.5 text-[10px] font-semibold transition-colors',
                active
                  ? 'border-cyan-600 bg-white text-slate-950 dark:border-cyan-300 dark:bg-white/[0.06] dark:text-white'
                  : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-white'
              )}
            >
              <span className="relative">
                <Icon className={cn('h-[18px] w-[18px]', active && 'stroke-[2.5]')} />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-cyan-500 px-1 text-[10px] leading-4 text-white">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
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
            aria-label="Открыть ещё разделы"
            aria-controls="mobile-more-menu"
            aria-haspopup="dialog"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border-t-2 px-1 py-1.5 text-[10px] font-semibold transition-colors',
              moreActive
                ? 'border-cyan-600 bg-white text-slate-950 dark:border-cyan-300 dark:bg-white/[0.06] dark:text-white'
                : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-white'
            )}
          >
            <span className="relative">
              <MoreHorizontal className="h-[18px] w-[18px]" />
              {moreBadge > 0 && (
                <span className="absolute -right-2 -top-2 grid min-w-4 place-items-center rounded-full bg-cyan-500 px-1 text-[10px] leading-4 text-white">
                  {moreBadge > 9 ? '9+' : moreBadge}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">Ещё</span>
          </button>
        ) : null}
      </div>
      {showMore && mounted && moreOpen ? createPortal(moreDrawer, document.body) : null}
    </nav>
  )
}

function MobileAdminMoreSections({
  items,
  pathname,
  badges,
  onNavigate,
}: {
  items: NavItem[]
  pathname: string
  badges: NavBadges
  onNavigate: () => void
}) {
  const itemsByHref = new Map(items.map((item) => [item.href, item]))

  return (
    <div className="space-y-4">
      {adminNavigationGroups.map((group) => {
        const groupItems = group.items
          .map((href) => itemsByHref.get(href))
          .filter((item): item is NavItem => Boolean(item))

        return (
          <MobileMoreSection
            key={group.title}
            title={group.title}
            items={groupItems}
            pathname={pathname}
            badges={badges}
            onNavigate={onNavigate}
          />
        )
      })}
    </div>
  )
}

function shouldIgnoreDashboardSwipe(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return true
  if (
    target.closest(
      'a, button, input, textarea, select, label, [contenteditable="true"], [role="slider"], [role="dialog"], [data-swipe-navigation="ignore"]'
    )
  ) {
    return true
  }

  let element: HTMLElement | null = target
  while (element && element.id !== 'dashboard-content') {
    const overflowX = window.getComputedStyle(element).overflowX
    if ((overflowX === 'auto' || overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1) {
      return true
    }
    element = element.parentElement
  }

  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
}

function MobileMoreSection({
  title,
  items,
  pathname,
  badges,
  onNavigate,
}: {
  title: string
  items: NavItem[]
  pathname: string
  badges: NavBadges
  onNavigate: () => void
}) {
  if (items.length === 0) return null

  return (
    <section>
      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{title}</h2>
      <MobileMoreGrid items={items} pathname={pathname} badges={badges} onNavigate={onNavigate} />
    </section>
  )
}

function MobileMoreGrid({
  items,
  pathname,
  badges,
  onNavigate,
}: {
  items: NavItem[]
  pathname: string
  badges: NavBadges
  onNavigate: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        const badge = badges[item.href] ?? 0

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-12 min-w-0 items-center gap-3 rounded-md border px-3 py-2 text-sm font-semibold transition',
              active
                ? 'border-slate-300 bg-slate-100 text-slate-950 dark:border-white/15 dark:bg-white/10 dark:text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {badge > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[11px] text-white">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

export function Brand({ compact = false, brandName }: { compact?: boolean; brandName: string }) {
  return (
    <Link href="/dashboard" className="dashboard-brand flex min-w-0 items-center gap-3">
      <BrandLogo className={cn('brand-mark', compact ? 'h-9 w-9' : 'h-10 w-10')} priority />
      <div className="min-w-0">
        <div className={cn('truncate text-sm font-semibold tracking-tight', compact ? 'text-slate-950 dark:text-white' : 'text-white')}>{brandName}</div>
        {!compact && <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">Control room</div>}
      </div>
    </Link>
  )
}

function NavList({
  role,
  badges = {},
  className,
  onNavigate,
  features,
}: {
  role: UserRole
  badges?: NavBadges
  className?: string
  onNavigate?: () => void
  features: FeatureFlags
}) {
  const pathname = usePathname()
  const liveBadges = useNavBadgeValues(badges)
  const adminArea = pathname.startsWith('/dashboard/admin')

  return (
    <nav className={className}>
      {role === 'USER' ? (
        <NavGroup items={filterUserNavigation(userNavigation, features)} pathname={pathname} badges={liveBadges} onNavigate={onNavigate} />
      ) : (
        <div className="space-y-3">
          <WorkspaceSwitch adminArea={adminArea} onNavigate={onNavigate} />
          {adminArea ? (
            <AdminNavGroups role={role} features={features} pathname={pathname} badges={liveBadges} onNavigate={onNavigate} />
          ) : (
            <NavGroup items={filterUserNavigation(userNavigation, features)} pathname={pathname} badges={liveBadges} onNavigate={onNavigate} />
          )}
        </div>
      )}
    </nav>
  )
}

function WorkspaceSwitch({
  adminArea,
  adminBadge = 0,
  onNavigate,
}: {
  adminArea: boolean
  adminBadge?: number
  onNavigate?: () => void
}) {
  return (
    <div className="grid grid-cols-2 rounded-[10px] border border-white/10 bg-white/[0.04] p-1">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={cn(
          'flex h-9 items-center justify-center gap-1.5 rounded-[7px] px-2 text-xs font-semibold transition-colors',
          !adminArea
            ? 'bg-white text-slate-950'
            : 'text-slate-400 hover:text-white'
        )}
      >
        <Home className="h-3.5 w-3.5" />
        Кабинет
      </Link>
      <Link
        href="/dashboard/admin"
        onClick={onNavigate}
        aria-label="Админка"
        className={cn(
          'flex h-9 items-center justify-center gap-1.5 rounded-[7px] px-2 text-xs font-semibold transition-colors',
          adminArea
            ? 'bg-white text-slate-950'
            : 'text-slate-400 hover:text-white'
        )}
      >
        <UserCog className="h-3.5 w-3.5" />
        Админка
        {adminBadge > 0 ? (
          <span
            aria-hidden="true"
            className="grid h-4 min-w-4 place-items-center rounded-full bg-cyan-500 px-1 text-[9px] leading-4 text-white"
          >
            {adminBadge > 9 ? '9+' : adminBadge}
          </span>
        ) : null}
      </Link>
    </div>
  )
}

function useLiveBadges(initialBadges: NavBadges, supportEnabled: boolean, showAdmin: boolean) {
  const [badges, setBadges] = useState(initialBadges)

  useEffect(() => {
    if (!supportEnabled) return
    let active = true

    async function refreshBadges() {
      try {
        const res = await fetch('/api/support/summary', { cache: 'no-store' })
        const data = await res.json().catch(() => null)
        if (active && res.ok && data?.badges) {
          setBadges(data.badges)
        }
      } catch {
        // Quiet polling: menu keeps the last known counters.
      }
    }

    void refreshBadges()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshBadges()
    }, NAV_BADGES_REFRESH_MS)
    const refreshOnFocus = () => void refreshBadges()
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') void refreshBadges()
    }
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnVisible)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [supportEnabled])

  useEffect(() => {
    let active = true

    async function refreshNotificationBadges() {
      const [userSummary, adminSummary] = await Promise.all([
        fetchNotificationSummary('/api/notifications/summary'),
        showAdmin ? fetchNotificationSummary('/api/admin/notifications/summary') : Promise.resolve(null),
      ])
      if (!active) return

      const updates: NavBadges = {}
      if (userSummary !== null) updates['/dashboard/notifications'] = userSummary
      if (adminSummary !== null) updates['/dashboard/admin/notifications'] = adminSummary
      if (Object.keys(updates).length > 0) {
        setBadges((current) => ({ ...current, ...updates }))
      }
    }

    void refreshNotificationBadges()
    const interval = window.setInterval(refreshNotificationBadges, 60_000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [showAdmin])

  return badges
}

async function fetchNotificationSummary(url: string) {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data) return null
    const unreadCount = Number(data.unreadCount)
    return Number.isFinite(unreadCount) && unreadCount >= 0 ? unreadCount : null
  } catch {
    return null
  }
}

function useNavBadgeValues(fallback: NavBadges) {
  return useContext(NavBadgesContext) ?? fallback
}

function NavGroup({
  items,
  pathname,
  badges,
  onNavigate,
}: {
  items: NavItem[]
  pathname: string
  badges: NavBadges
  onNavigate?: () => void
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        const badge = badges[item.href] ?? 0
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center gap-3 rounded-[9px] px-3 py-2 text-sm font-medium transition-colors duration-150',
              active
                ? 'bg-white text-slate-950'
                : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-600' : 'text-slate-500')} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {badge > 0 && (
              <span
                className={cn(
                  'ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold',
                  active ? 'bg-brand-600 text-white' : 'bg-red-600 text-white'
                )}
              >
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

function AdminNavGroups({
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
  const availableItems = getAvailableAdminNavigation(role, features)
  const availableByHref = new Map(availableItems.map((item) => [item.href, item]))
  const groups = adminNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((href) => availableByHref.get(href))
        .filter((item): item is NavItem => Boolean(item)),
    }))
    .filter((group) => group.items.length > 0)

  if (role === 'MODERATOR') {
    return <NavGroup items={availableItems} pathname={pathname} badges={badges} onNavigate={onNavigate} />
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h2 className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {group.title}
          </h2>
          <NavGroup
            items={group.items}
            pathname={pathname}
            badges={badges}
            onNavigate={onNavigate}
          />
        </section>
      ))}
    </div>
  )
}
