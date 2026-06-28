'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  Bell,
  CreditCard,
  Database,
  FileClock,
  Gift,
  Home,
  KeyRound,
  Laptop,
  Menu,
  MessageCircleQuestion,
  Send,
  ServerCog,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  UserCog,
  UsersRound,
  X,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'
import { LogoutButton } from './logout-button'

const nav = [
  { href: '/dashboard', label: 'Главная', icon: Home, exact: true },
  { href: '/dashboard/subscription', label: 'Подписка', icon: KeyRound },
  { href: '/dashboard/plans', label: 'Тарифы', icon: ShieldCheck },
  { href: '/dashboard/billing', label: 'Платежи', icon: CreditCard },
  { href: '/dashboard/notifications', label: 'Уведомления', icon: Bell },
  { href: '/dashboard/bonus-box', label: 'Бонусы', icon: Gift },
  { href: '/dashboard/referrals', label: 'Рефералы', icon: UsersRound },
  { href: '/dashboard/devices', label: 'Устройства', icon: Laptop },
  { href: '/dashboard/support', label: 'Поддержка', icon: MessageCircleQuestion },
  { href: '/dashboard/settings', label: 'Настройки', icon: Settings },
]

const adminNav = [
  { href: '/dashboard/admin', label: 'Обзор', icon: UserCog, exact: true },
  { href: '/dashboard/admin/notifications', label: 'Уведомления', icon: Bell },
  { href: '/dashboard/admin/broadcasts', label: 'Рассылки', icon: Send },
  { href: '/dashboard/admin/support', label: 'Поддержка', icon: MessageCircleQuestion },
  { href: '/dashboard/admin/users', label: 'Пользователи', icon: UsersRound },
  { href: '/dashboard/admin/plans', label: 'Тарифы', icon: SlidersHorizontal },
  { href: '/dashboard/admin/promo-codes', label: 'Промокоды', icon: Tag },
  { href: '/dashboard/admin/bonus-box', label: 'Подарки', icon: Gift },
  { href: '/dashboard/admin/payments', label: 'Платежи', icon: CreditCard },
  { href: '/dashboard/admin/subscriptions', label: 'Подписки', icon: ShieldCheck },
  { href: '/dashboard/admin/remnashop-sync', label: 'Синхронизация', icon: Database },
  { href: '/dashboard/admin/system', label: 'Система', icon: ServerCog },
  { href: '/dashboard/admin/audit', label: 'История', icon: FileClock },
]

type NavItem = (typeof nav)[number] | (typeof adminNav)[number]
type NavBadges = Record<string, number>
type UserRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'

export function DashboardNav({ role, badges = {} }: { role: UserRole; badges?: NavBadges }) {
  return <NavList role={role} badges={badges} className="space-y-1 py-1" />
}

export function MobileDashboardNav({
  role,
  email,
  brandName,
  badges = {},
}: {
  role: UserRole
  email: string
  brandName: string
  badges?: NavBadges
}) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useBodyScrollLock(open)

  useEffect(() => {
    setMounted(true)
  }, [])

  const menu = (
    <div className="fixed inset-0 z-[100] h-dvh w-dvw lg:hidden">
      <button
        className="absolute inset-0 bg-slate-950/40"
        onClick={() => setOpen(false)}
        aria-label="Закрыть меню"
      />
      <aside className="absolute right-0 top-0 z-10 flex h-dvh w-[min(22rem,88vw)] flex-col border-l border-white/70 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-surface-950/90">
        <div className="flex items-center justify-between border-b border-white/70 px-4 py-4 dark:border-white/10">
          <Brand brandName={brandName} />
          <button
            className="grid h-9 w-9 place-items-center rounded-lg border bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:bg-surface-900 dark:hover:bg-surface-800 dark:hover:text-white"
            onClick={() => setOpen(false)}
            aria-label="Закрыть меню"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList role={role} badges={badges} onNavigate={() => setOpen(false)} className="space-y-1" />
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
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/70 bg-white/80 text-slate-700 shadow-sm shadow-slate-200/60 backdrop-blur transition-colors hover:bg-white dark:border-white/10 dark:bg-surface-900/80 dark:text-slate-200 dark:shadow-black/20 dark:hover:bg-surface-800 lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Открыть меню"
      >
        <Menu className="h-5 w-5" />
      </button>
      {mounted && open ? createPortal(menu, document.body) : null}
    </>
  )
}

export function Brand({ compact = false, brandName }: { compact?: boolean; brandName: string }) {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-lg shadow-slate-950/15 ring-1 ring-white/10 dark:bg-white dark:text-slate-950 dark:shadow-black/20">
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
}: {
  role: UserRole
  badges?: NavBadges
  className?: string
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const liveBadges = useLiveBadges(badges)

  return (
    <nav className={className}>
      <NavGroup items={nav} pathname={pathname} badges={liveBadges} onNavigate={onNavigate} />
      {role !== 'USER' && (
        <div className="pt-3">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Администрирование
          </div>
          <NavGroup
            items={getAdminItems(role)}
            pathname={pathname}
            badges={liveBadges}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </nav>
  )
}

function getAdminItems(role: UserRole) {
  if (role === 'MODERATOR') return adminNav.filter((item) => item.href === '/dashboard/admin/support')
  if (role === 'ADMIN') return adminNav.filter((item) => item.href !== '/dashboard/admin/audit')
  return adminNav
}

function roleLabel(role: UserRole) {
  if (role === 'SUPER_ADMIN') return 'Главный администратор'
  if (role === 'ADMIN') return 'Администратор'
  if (role === 'MODERATOR') return 'Модератор поддержки'
  return 'Аккаунт пользователя'
}

function useLiveBadges(initialBadges: NavBadges) {
  const [badges, setBadges] = useState(initialBadges)

  useEffect(() => {
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
    }, 3000)
    const refreshOnFocus = () => void refreshBadges()
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnFocus)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnFocus)
    }
  }, [])

  return badges
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
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
              active
                ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:bg-white dark:text-slate-950 dark:shadow-black/20'
                : 'text-slate-600 hover:bg-white/80 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0', active && 'text-cyan-200 dark:text-cyan-700')} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {badge > 0 && (
              <span
                className={cn(
                  'ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold',
                  active ? 'bg-white text-slate-950 dark:bg-slate-950 dark:text-white' : 'bg-red-600 text-white'
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
