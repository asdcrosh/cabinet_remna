'use client'

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  Bell,
  ChevronDown,
  CreditCard,
  Database,
  FileClock,
  Gift,
  Home,
  KeyRound,
  Laptop,
  Menu,
  MessageCircleQuestion,
  MoreHorizontal,
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
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import type { FeatureFlags } from '@/lib/feature-flags'
import { LogoutButton } from './logout-button'

const nav = [
  { href: '/dashboard', label: 'Главная', icon: Home, exact: true },
  { href: '/dashboard/subscription', label: 'Подписка', icon: KeyRound },
  { href: '/dashboard/plans', label: 'Тарифы', icon: ShieldCheck },
  { href: '/dashboard/billing', label: 'Платежи', icon: CreditCard },
  { href: '/dashboard/bonus-box', label: 'Бонусы', icon: Gift },
  { href: '/dashboard/referrals', label: 'Рефералы', icon: UsersRound },
  { href: '/dashboard/devices', label: 'Устройства', icon: Laptop },
  { href: '/dashboard/support', label: 'Поддержка', icon: MessageCircleQuestion },
  { href: '/dashboard/settings', label: 'Настройки', icon: Settings },
]

const bottomNav = [
  { href: '/dashboard', label: 'Главная', icon: Home, exact: true },
  { href: '/dashboard/subscription', label: 'Подписка', icon: KeyRound },
  { href: '/dashboard/plans', label: 'Тарифы', icon: ShieldCheck },
  { href: '/dashboard/support', label: 'Поддержка', icon: MessageCircleQuestion },
]

const bottomMoreNav = [
  { href: '/dashboard/billing', label: 'Платежи', icon: CreditCard },
  { href: '/dashboard/bonus-box', label: 'Бонусы', icon: Gift },
  { href: '/dashboard/referrals', label: 'Рефералы', icon: UsersRound },
  { href: '/dashboard/devices', label: 'Устройства', icon: Laptop },
  { href: '/dashboard/notifications', label: 'Уведомления', icon: Bell },
  { href: '/dashboard/settings', label: 'Настройки', icon: Settings },
]

const NAV_BADGES_REFRESH_MS = 15_000

const adminNav = [
  { href: '/dashboard/admin', label: 'Обзор', icon: UserCog, exact: true },
  { href: '/dashboard/admin/notifications', label: 'Уведомления', icon: Bell },
  { href: '/dashboard/admin/broadcasts', label: 'Рассылки', icon: Send },
  { href: '/dashboard/admin/support', label: 'Поддержка', icon: MessageCircleQuestion },
  { href: '/dashboard/admin/users', label: 'Пользователи', icon: UsersRound },
  { href: '/dashboard/admin/duplicates', label: 'Дубли', icon: SearchCheck },
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

const adminNavGroups = [
  {
    title: 'Аккаунты',
    items: [
      '/dashboard/admin',
      '/dashboard/admin/users',
      '/dashboard/admin/duplicates',
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
  {
    title: 'Продажи',
    items: [
      '/dashboard/admin/offers',
      '/dashboard/admin/plans',
      '/dashboard/admin/promo-codes',
      '/dashboard/admin/bonus-box',
      '/dashboard/admin/payments',
      '/dashboard/admin/recovery',
    ],
  },
  {
    title: 'Система',
    items: [
      '/dashboard/admin/remnashop-sync',
      '/dashboard/admin/system',
      '/dashboard/admin/audit',
    ],
  },
]

type NavItem = (typeof nav)[number] | (typeof adminNav)[number]
type NavBadges = Record<string, number>
type UserRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'

const NavBadgesContext = createContext<NavBadges | null>(null)

export function NavBadgesProvider({
  initialBadges,
  supportEnabled,
  children,
}: {
  initialBadges: NavBadges
  supportEnabled: boolean
  children: ReactNode
}) {
  const badges = useLiveBadges(initialBadges, supportEnabled)
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

export function MobileDashboardNav({
  role,
  email,
  brandName,
  badges = {},
  features,
}: {
  role: UserRole
  email: string
  brandName: string
  badges?: NavBadges
  features: FeatureFlags
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeMenu = () => setOpen(false)
  useBodyScrollLock(open)
  useDialogFocus({ open, onClose: closeMenu, dialogRef, initialFocusRef: closeButtonRef, returnFocusRef: triggerRef })

  useEffect(() => {
    setMounted(true)
  }, [])

  const menu = (
    <div className="fixed inset-0 z-[100] h-dvh w-dvw lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40"
        onClick={closeMenu}
        aria-label="Закрыть меню"
      />
      <aside
        id="mobile-dashboard-menu"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Меню кабинета"
        tabIndex={-1}
        className="absolute right-0 top-0 z-10 flex h-dvh w-[min(22rem,88vw)] flex-col border-l border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-surface-950/90"
      >
        <div className="flex items-center justify-between border-b border-white/70 px-4 py-4 dark:border-white/10">
          <Brand brandName={brandName} />
          <button
            ref={closeButtonRef}
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl border bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:bg-surface-900 dark:hover:bg-surface-800 dark:hover:text-white"
            onClick={closeMenu}
            aria-label="Закрыть меню"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList role={role} badges={badges} features={features} onNavigate={closeMenu} className="space-y-1" />
        </div>
        <div className="border-t border-white/70 p-3 dark:border-white/10">
          <div className="mb-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-surface-900/80">
            <div className="truncate font-medium text-slate-700 dark:text-slate-200">{email}</div>
            <div>{roleLabel(role)}</div>
          </div>
          <LogoutButton />
        </div>
      </aside>
    </div>
  )

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/70 bg-white/80 text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur transition-colors hover:bg-white dark:border-white/10 dark:bg-surface-900/80 dark:text-slate-200 dark:shadow-black/20 dark:hover:bg-surface-800 lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Открыть меню"
        aria-expanded={open}
        aria-controls="mobile-dashboard-menu"
        aria-haspopup="dialog"
      >
        <Menu className="h-5 w-5" />
      </button>
      {mounted && open ? createPortal(menu, document.body) : null}
    </>
  )
}

export function MobileBottomNav({ badges = {}, features }: { badges?: NavBadges; features: FeatureFlags }) {
  const pathname = usePathname()
  const liveBadges = useNavBadgeValues(badges)
  const items = filterUserNav(bottomNav, features)
  const moreItems = filterUserNav(bottomMoreNav, features)
  const [moreOpen, setMoreOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null)
  const moreDialogRef = useRef<HTMLDivElement | null>(null)
  const moreCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeMore = () => setMoreOpen(false)
  const moreActive = moreItems.some((item) => ('exact' in item && item.exact) ? pathname === item.href : pathname.startsWith(item.href))

  useBodyScrollLock(moreOpen)
  useDialogFocus({ open: moreOpen, onClose: closeMore, dialogRef: moreDialogRef, initialFocusRef: moreCloseButtonRef, returnFocusRef: moreTriggerRef })

  useEffect(() => {
    setMounted(true)
  }, [])

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
        className="absolute inset-x-0 bottom-0 rounded-t-2xl border border-white/70 bg-white/95 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-surface-950/95"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div id="mobile-more-menu-title" className="font-semibold text-slate-950 dark:text-white">Ещё</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">Разделы кабинета</div>
          </div>
          <button
            ref={moreCloseButtonRef}
            type="button"
            className="grid h-10 w-10 place-items-center rounded-xl border bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={closeMore}
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {moreItems.map((item) => {
            const Icon = item.icon
            const active = ('exact' in item && item.exact) ? pathname === item.href : pathname.startsWith(item.href)
            const badge = liveBadges[item.href] ?? 0

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMore}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-12 min-w-0 items-center gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                  active
                    ? 'nav-active-glow border-cyan-200 bg-cyan-50 text-cyan-900 dark:border-cyan-400/25 dark:bg-cyan-400/10 dark:text-cyan-100'
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
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/10">
          <LogoutButton />
        </div>
      </div>
    </div>
  )

  return (
    <nav
      aria-label="Основная мобильная навигация"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/[0.94] pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-1.5 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-surface-900/[0.96] dark:shadow-black/25 lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2">
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
                'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors',
                active
                  ? 'bg-cyan-50 text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-200'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
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
        <button
          ref={moreTriggerRef}
          type="button"
          aria-expanded={moreOpen}
          aria-label="Открыть ещё разделы"
          aria-controls="mobile-more-menu"
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
          className={cn(
            'relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors',
            moreActive
              ? 'bg-cyan-50 text-cyan-800 dark:bg-cyan-400/10 dark:text-cyan-200'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
          )}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
          <span className="max-w-full truncate">Ещё</span>
        </button>
      </div>
      {mounted && moreOpen ? createPortal(moreDrawer, document.body) : null}
    </nav>
  )
}

export function Brand({ compact = false, brandName }: { compact?: boolean; brandName: string }) {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-cyan-200 shadow-sm shadow-slate-950/15 ring-1 ring-white/10 dark:bg-white dark:text-slate-950 dark:shadow-black/20">
        <ShieldCheck className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate font-semibold tracking-tight">{brandName}</div>
        <div className={cn('truncate text-xs text-slate-500', compact && 'hidden')}>
          Личный кабинет
        </div>
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

  return (
    <nav className={className}>
      <NavGroup items={filterUserNav(nav, features)} pathname={pathname} badges={liveBadges} onNavigate={onNavigate} />
      {role !== 'USER' && (
        <div className="pt-3">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Администрирование
          </div>
          <AdminNavGroups role={role} features={features} pathname={pathname} badges={liveBadges} onNavigate={onNavigate} />
        </div>
      )}
    </nav>
  )
}

function filterUserNav<T extends NavItem>(items: T[], features: FeatureFlags) {
  return items.filter((item) => {
    if (item.href === '/dashboard/referrals') return features.referrals
    if (item.href === '/dashboard/bonus-box') return features.bonusBox
    if (item.href === '/dashboard/support') return features.support
    return true
  })
}

function getAdminItems(role: UserRole, features: FeatureFlags) {
  const available = adminNav.filter((item) => {
    if (item.href === '/dashboard/admin/support') return features.support
    if (item.href === '/dashboard/admin/broadcasts') return features.broadcasts
    if (item.href === '/dashboard/admin/bonus-box') return features.bonusBox
    return true
  })
  if (role === 'MODERATOR') return available.filter((item) => item.href === '/dashboard/admin/support')
  if (role === 'ADMIN') return available.filter((item) => item.href !== '/dashboard/admin/audit')
  return available
}

function roleLabel(role: UserRole) {
  if (role === 'SUPER_ADMIN') return 'Главный администратор'
  if (role === 'ADMIN') return 'Администратор'
  if (role === 'MODERATOR') return 'Модератор поддержки'
  return 'Аккаунт пользователя'
}

function useLiveBadges(initialBadges: NavBadges, supportEnabled: boolean) {
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

  return badges
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
              'flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
              active
                ? 'nav-active-glow bg-cyan-50 text-cyan-900 dark:bg-cyan-400/10 dark:text-cyan-100'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', active && 'text-cyan-600 dark:text-cyan-300')} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {badge > 0 && (
              <span
                className={cn(
                  'ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold',
                  active ? 'bg-cyan-600 text-white dark:bg-cyan-300 dark:text-slate-950' : 'bg-red-600 text-white'
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
  const availableItems = getAdminItems(role, features)
  const availableByHref = new Map(availableItems.map((item) => [item.href, item]))
  const groups = adminNavGroups
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
    <div className="space-y-1.5">
      {groups.map((group) => (
        <AdminNavGroup
          key={group.title}
          title={group.title}
          items={group.items}
          pathname={pathname}
          badges={badges}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

function AdminNavGroup({
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
  onNavigate?: () => void
}) {
  const hasActiveItem = items.some((item) => item.exact ? pathname === item.href : pathname.startsWith(item.href))
  const [open, setOpen] = useState(hasActiveItem)

  useEffect(() => {
    if (hasActiveItem) setOpen(true)
  }, [hasActiveItem])

  return (
    <div className="rounded-xl border border-slate-100 bg-white/45 p-1 dark:border-white/10 dark:bg-white/[0.03]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-200"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          <NavGroup items={items} pathname={pathname} badges={badges} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}
