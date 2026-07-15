'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { Bell, CheckCheck, ExternalLink, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { UserNotificationView } from '@/lib/user-notifications'
import type { AdminNotificationView } from '@/lib/admin-notifications'
import { ConfirmDialog } from './confirm-dialog'
import { toast } from '@/components/ui/toaster'

const NOTIFICATION_REFRESH_MS = 15_000
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type NotificationSummary = {
  unreadCount: number
  notifications: UserNotificationView[]
}

type AdminNotificationSummary = {
  unreadCount: number
  notifications: AdminNotificationView[]
}

export function NotificationBell({ showAdmin = false }: { showAdmin?: boolean }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'user' | 'admin'>('user')
  const [summary, setSummary] = useState<NotificationSummary>({ unreadCount: 0, notifications: [] })
  const [adminSummary, setAdminSummary] = useState<AdminNotificationSummary>({ unreadCount: 0, notifications: [] })
  const [mounted, setMounted] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearLoading, setClearLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const userTabRef = useRef<HTMLButtonElement | null>(null)
  const adminTabRef = useRef<HTMLButtonElement | null>(null)
  const activeSummary = tab === 'admin' ? adminSummary : summary
  const totalUnread = summary.unreadCount + (showAdmin ? adminSummary.unreadCount : 0)

  const closePanel = useCallback(() => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [userRes, adminRes] = await Promise.all([
        fetch('/api/notifications/summary', { cache: 'no-store' }),
        showAdmin ? fetch('/api/admin/notifications/summary', { cache: 'no-store' }) : Promise.resolve(null),
      ])
      const data = await userRes.json().catch(() => null)
      if (userRes.ok && data) {
        setSummary({
          unreadCount: Number(data.unreadCount || 0),
          notifications: Array.isArray(data.notifications) ? data.notifications : [],
        })
      }
      if (adminRes) {
        const adminData = await adminRes.json().catch(() => null)
        if (adminRes.ok && adminData) {
          setAdminSummary({
            unreadCount: Number(adminData.unreadCount || 0),
            notifications: Array.isArray(adminData.notifications) ? adminData.notifications : [],
          })
        }
      }
    } catch {
      // Silent polling. The last known state is enough for the header.
    }
  }, [showAdmin])

  async function markAllRead() {
    const previousUser = summary
    const previousAdmin = adminSummary
    if (tab === 'admin') {
      setAdminSummary((current) => ({
        unreadCount: 0,
        notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      }))
    } else {
      setSummary((current) => ({
        unreadCount: 0,
        notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      }))
    }
    try {
      const res = await fetch(tab === 'admin' ? '/api/admin/notifications' : '/api/notifications', { method: 'PATCH' })
      if (!res.ok) {
        setSummary(previousUser)
        setAdminSummary(previousAdmin)
      }
    } catch {
      setSummary(previousUser)
      setAdminSummary(previousAdmin)
    }
  }

  async function markOneRead(id: string) {
    if (tab === 'admin') {
      setAdminSummary((current) => ({
        unreadCount: Math.max(0, current.unreadCount - (current.notifications.find((item) => item.id === id)?.readAt ? 0 : 1)),
        notifications: current.notifications.map((item) =>
          item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item
        ),
      }))
    } else {
      setSummary((current) => ({
        unreadCount: Math.max(0, current.unreadCount - (current.notifications.find((item) => item.id === id)?.readAt ? 0 : 1)),
        notifications: current.notifications.map((item) =>
          item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item
        ),
      }))
    }
    try {
      await fetch(tab === 'admin' ? `/api/admin/notifications/${id}` : `/api/notifications/${id}`, { method: 'PATCH' })
    } catch {
      // Counter will self-heal on the next polling cycle.
    }
  }

  async function clearNotifications() {
    if (activeSummary.notifications.length === 0) return
    setClearConfirmOpen(true)
  }

  async function confirmClearNotifications() {
    setClearLoading(true)
    const previousUser = summary
    const previousAdmin = adminSummary
    if (tab === 'admin') {
      setAdminSummary({ unreadCount: 0, notifications: [] })
    } else {
      setSummary({ unreadCount: 0, notifications: [] })
    }

    try {
      const res = await fetch(tab === 'admin' ? '/api/admin/notifications' : '/api/notifications', { method: 'DELETE' })
      if (!res.ok) {
        setSummary(previousUser)
        setAdminSummary(previousAdmin)
        toast('Не удалось очистить уведомления')
      } else {
        setClearConfirmOpen(false)
        toast('Уведомления очищены', 'success')
      }
    } catch {
      setSummary(previousUser)
      setAdminSummary(previousAdmin)
      toast('Не удалось очистить уведомления')
    } finally {
      setClearLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    void refresh()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, NOTIFICATION_REFRESH_MS)
    const onFocus = () => void refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refresh])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      const insideButton = rootRef.current?.contains(target)
      const insidePanel = panelRef.current?.contains(target)
      if (!insideButton && !insidePanel) closePanel()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [closePanel, open])

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => panelRef.current?.focus())
  }, [open])

  const handlePanelKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePanel()
      return
    }

    if (event.key !== 'Tab') return
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
      .filter((item) => !item.hasAttribute('disabled') && item.offsetParent !== null)
    if (focusable.length === 0) return

    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    const active = document.activeElement

    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }, [closePanel])

  const handleTabKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!showAdmin || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextTab = event.key === 'Home' ? 'user' : event.key === 'End' ? 'admin' : tab === 'user' ? 'admin' : 'user'
    setTab(nextTab)
    window.requestAnimationFrame(() => (nextTab === 'user' ? userTabRef.current : adminTabRef.current)?.focus())
  }, [showAdmin, tab])

  const panel = open ? (
    <div
      id="notification-panel"
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="notification-panel-title"
      tabIndex={-1}
      onKeyDown={handlePanelKeyDown}
      className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] top-auto z-[120] max-h-[72dvh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-white/10 dark:bg-surface-950 dark:shadow-black/30 sm:absolute sm:bottom-auto sm:inset-x-auto sm:right-6 sm:top-16 sm:w-[min(24rem,calc(100vw-2rem))] sm:max-h-[34rem] lg:right-6"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
        <div>
          <div id="notification-panel-title" className="text-sm font-semibold text-slate-950 dark:text-white">Уведомления</div>
          <div className="text-xs text-slate-500">
            {activeSummary.unreadCount > 0 ? `Новых: ${activeSummary.unreadCount}` : 'Новых нет'}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={markAllRead}
            disabled={activeSummary.unreadCount === 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Прочитано
          </button>
          <button
            type="button"
            onClick={clearNotifications}
            disabled={activeSummary.notifications.length === 0}
            className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-red-500/10 dark:hover:text-red-200"
            title="Очистить"
            aria-label="Очистить уведомления"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {showAdmin && (
        <div
          role="tablist"
          aria-label="Тип уведомлений"
          className="grid grid-cols-2 gap-1 border-b border-slate-100 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]"
        >
          <button
            ref={userTabRef}
            type="button"
            id="notification-tab-user"
            role="tab"
            aria-selected={tab === 'user'}
            aria-controls="notification-tabpanel-user"
            tabIndex={tab === 'user' ? 0 : -1}
            className={cn('rounded-xl px-3 py-2 text-sm font-medium transition', tab === 'user' ? 'bg-white text-slate-950 shadow-sm dark:bg-surface-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}
            onClick={() => setTab('user')}
            onKeyDown={handleTabKeyDown}
          >
            Мои {summary.unreadCount > 0 ? `· ${summary.unreadCount}` : ''}
          </button>
          <button
            ref={adminTabRef}
            type="button"
            id="notification-tab-admin"
            role="tab"
            aria-selected={tab === 'admin'}
            aria-controls="notification-tabpanel-admin"
            tabIndex={tab === 'admin' ? 0 : -1}
            className={cn('rounded-xl px-3 py-2 text-sm font-medium transition', tab === 'admin' ? 'bg-white text-slate-950 shadow-sm dark:bg-surface-900 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white')}
            onClick={() => setTab('admin')}
            onKeyDown={handleTabKeyDown}
          >
            Админка {adminSummary.unreadCount > 0 ? `· ${adminSummary.unreadCount}` : ''}
          </button>
        </div>
      )}

      <div
        id={tab === 'admin' ? 'notification-tabpanel-admin' : 'notification-tabpanel-user'}
        role={showAdmin ? 'tabpanel' : undefined}
        aria-labelledby={showAdmin ? (tab === 'admin' ? 'notification-tab-admin' : 'notification-tab-user') : undefined}
        className="max-h-[calc(72dvh-10rem)] overflow-y-auto p-2 sm:max-h-96"
      >
        {activeSummary.notifications.length > 0 ? (
          activeSummary.notifications.map((item) => (
            tab === 'admin' ? (
              <AdminNotificationRow
                key={item.id}
                notification={item as AdminNotificationView}
                onNavigate={() => {
                  void markOneRead(item.id)
                  closePanel()
                }}
              />
            ) : (
              <NotificationRow
                key={item.id}
                notification={item as UserNotificationView}
                onNavigate={() => {
                  void markOneRead(item.id)
                  closePanel()
                }}
              />
            )
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500">Уведомлений пока нет</div>
        )}
      </div>

      <Link
        href={tab === 'admin' ? '/dashboard/admin/notifications' : '/dashboard/notifications'}
        onClick={closePanel}
        className="flex items-center justify-center gap-2 border-t border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
      >
        {tab === 'admin' ? 'Все события' : 'Все уведомления'}
        <ExternalLink className="h-4 w-4" />
      </Link>
    </div>
  ) : null

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/70 bg-white/80 text-slate-700 shadow-sm shadow-slate-200/60 transition hover:bg-white hover:text-slate-950 dark:border-white/10 dark:bg-surface-900/80 dark:text-slate-200 dark:shadow-black/20 dark:hover:bg-surface-800 dark:hover:text-white"
        aria-label={totalUnread > 0 ? `Уведомления, новых: ${totalUnread}` : 'Уведомления, новых нет'}
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {totalUnread > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-surface-950">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
      <ConfirmDialog
        open={clearConfirmOpen}
        title="Очистить уведомления"
        description={tab === 'admin' ? 'Админские уведомления будут очищены только для вашего аккаунта.' : 'Ваши уведомления будут очищены из списка.'}
        confirmLabel="Очистить"
        loading={clearLoading}
        onConfirm={() => void confirmClearNotifications()}
        onCancel={() => setClearConfirmOpen(false)}
      />
    </div>
  )
}

function AdminNotificationRow({
  notification,
  onNavigate,
}: {
  notification: AdminNotificationView
  onNavigate: () => void
}) {
  const content = (
    <div
      className={cn(
        'rounded-xl px-3 py-2.5 transition',
        notification.readAt ? 'hover:bg-slate-50 dark:hover:bg-white/10' : 'bg-orange-50/80 hover:bg-orange-50 dark:bg-orange-950/20 dark:hover:bg-orange-950/30'
      )}
    >
      <div className="flex items-start gap-2">
        {!notification.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-semibold text-slate-950 dark:text-white">{notification.title}</div>
          <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{notification.body}</div>
          <div className="mt-1 text-[11px] text-slate-400">{formatDate(notification.createdAt)}</div>
        </div>
      </div>
    </div>
  )

  if (notification.actionHref) {
    return (
      <Link href={notification.actionHref} onClick={onNavigate} className="block">
        {content}
      </Link>
    )
  }

  return content
}

function NotificationRow({
  notification,
  onNavigate,
}: {
  notification: UserNotificationView
  onNavigate: () => void
}) {
  const content = (
    <div
      className={cn(
        'rounded-xl px-3 py-2.5 transition',
        notification.readAt ? 'hover:bg-slate-50 dark:hover:bg-white/10' : 'bg-cyan-50/70 hover:bg-cyan-50 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/30'
      )}
    >
      <div className="flex items-start gap-2">
        {!notification.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-cyan-500" />}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-semibold text-slate-950 dark:text-white">{notification.title}</div>
          <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{notification.body}</div>
          <div className="mt-1 text-[11px] text-slate-400">{formatDate(notification.createdAt)}</div>
        </div>
      </div>
    </div>
  )

  if (notification.actionHref) {
    return (
      <Link href={notification.actionHref} onClick={onNavigate} className="block">
        {content}
      </Link>
    )
  }

  return content
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
