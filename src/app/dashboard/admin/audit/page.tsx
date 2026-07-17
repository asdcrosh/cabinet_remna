import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock, Search } from 'lucide-react'
import { AuditAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { AdminFilterSubmitButton } from '@/components/admin/admin-filter-submit-button'
import { AdminFilterBar, AdminFilterField } from '@/components/admin/admin-filter-bar'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'История действий — Админка' }

const ACTION_LABELS: Record<AuditAction, string> = {
  ADMIN_PLAN_CREATED: 'Тариф создан',
  ADMIN_PLAN_UPDATED: 'Тариф изменён',
  ADMIN_PLAN_DELETED: 'Тариф удалён',
  ADMIN_PLAN_ASSIGNED: 'Тариф',
  ADMIN_ROLE_CHANGED: 'Роль',
  ADMIN_PROFILE_UPDATED: 'Профиль',
  ADMIN_USERS_MERGED: 'Объединение',
  PERSONAL_OFFER_UPDATED: 'Оффер',
  PROMO_CODE_CREATED: 'Промокод создан',
  PROMO_CODE_UPDATED: 'Промокод изменен',
  GIFT_CERTIFICATE_CREATED: 'Сертификат создан',
  GIFT_CERTIFICATE_UPDATED: 'Сертификат изменен',
  PAYMENT_SYNCED: 'Платеж',
  ADMIN_NOTIFICATIONS_UPDATED: 'Уведомления',
  ADMIN_BONUS_ATTEMPTS_GRANTED: 'Бонусы',
  ADMIN_BONUS_PRIZE_CREATED: 'Подарок создан',
  ADMIN_BONUS_PRIZE_UPDATED: 'Подарок изменён',
  ADMIN_BONUS_SETTINGS_UPDATED: 'Настройки подарков',
  ADMIN_FEATURES_UPDATED: 'Функции кабинета',
  ADMIN_PAYMENT_PROVIDERS_UPDATED: 'Платёжные системы',
  ADMIN_PAYMENT_PROVIDERS_RESET: 'Платёжные системы из .env',
  ADMIN_SUPPORT_UPDATED: 'Поддержка',
  ADMIN_BROADCAST_CREATED: 'Рассылка создана',
  ADMIN_BROADCAST_TEMPLATE_CREATED: 'Шаблон создан',
  ADMIN_BROADCAST_TEMPLATE_DELETED: 'Шаблон удалён',
  REMNASHOP_SYNC_RUN: 'Remnashop sync',
  SYSTEM_BACKUP_CREATED: 'Бэкап',
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; limit?: string }>
}) {
  const { user } = await requireAdminPage()
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard/admin')

  const params = await searchParams
  const q = params.q?.trim() ?? ''
  const action = params.action ?? 'ALL'
  const limit = normalizeLimit(params.limit)
  const where = {
    ...(action !== 'ALL' && action in AuditAction ? { action: action as AuditAction } : {}),
    ...(q
      ? {
          OR: [
            { message: { contains: q, mode: 'insensitive' as const } },
            { actor: { email: { contains: q, mode: 'insensitive' as const } } },
            { target: { email: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [total, logs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        actor: { select: { email: true, name: true } },
        target: { select: { email: true, name: true } },
      },
    }),
  ])
  const hasMore = logs.length > limit
  const visibleLogs = hasMore ? logs.slice(0, limit) : logs

  return (
    <div className="page-stack">
      <PageHeader title="История действий" description="Изменения и операции администраторов" />

      <AdminFilterBar
        action="/dashboard/admin/audit"
        resetHref="/dashboard/admin/audit"
        resetVisible={Boolean(q || action !== 'ALL')}
        count={{ shown: visibleLogs.length, total }}
        className="md:grid-cols-[minmax(14rem,1fr)_14rem_auto_auto]"
      >
        <input type="hidden" name="limit" value="50" />
        <AdminFilterField label="Поиск в истории">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" name="q" defaultValue={q} placeholder="Email или действие" className="input pl-9" />
          </div>
        </AdminFilterField>
        <AdminFilterField label="Тип действия">
          <select name="action" defaultValue={action} className="input">
            <option value="ALL">Все действия</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </AdminFilterField>
        <AdminFilterSubmitButton />
      </AdminFilterBar>

      <div className={visibleLogs.length > 0 ? 'overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-200 dark:border-white/10 dark:bg-white/[0.025] dark:divide-white/[0.07]' : ''}>
        {visibleLogs.length === 0 && (
          <AdminEmptyState title="Записей пока нет" description="История появится после админских действий." />
        )}
        {visibleLogs.map((log) => (
          <article key={log.id}>
            <div className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={auditActionBadgeClass(log.action)}>{ACTION_LABELS[log.action]}</span>
                  <h2 className="font-semibold leading-5">{log.message}</h2>
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {log.actor ? `Автор: ${log.actor.email}` : 'Системное действие'}
                  {log.target ? ` · Пользователь: ${log.target.email}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                <CalendarClock className="h-3.5 w-3.5" />
                {log.createdAt.toLocaleString('ru-RU')}
              </div>
            </div>
            {log.metadata && (
              <details className="border-t bg-slate-50/70 px-4 py-3 text-xs text-slate-500 dark:bg-white/[0.02]">
                <summary className="cursor-pointer font-semibold text-slate-600 dark:text-slate-300">
                  Технические данные
                </summary>
                <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3 font-mono [scrollbar-width:thin] dark:bg-surface-950">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </details>
            )}
          </article>
        ))}
        {hasMore && (
          <div className="text-center">
            <Link href={buildMoreHref(q, action, limit + 50)} className="btn-secondary my-3 w-[calc(100%-1.5rem)] justify-center sm:w-auto">
              Показать еще
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

function auditActionBadgeClass(action: AuditAction) {
  if (action.includes('DELETED')) return 'badge-expired'
  if (action.includes('CREATED')) return 'badge-active'
  if (action.includes('MERGED')) return 'badge-limited'
  return 'badge-muted'
}

function normalizeLimit(value: string | undefined) {
  const limit = Number(value)
  if (!Number.isFinite(limit)) return 50
  return Math.min(200, Math.max(20, Math.floor(limit)))
}

function buildMoreHref(q: string, action: string, limit: number) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (action !== 'ALL') params.set('action', action)
  params.set('limit', String(limit))
  return `/dashboard/admin/audit?${params.toString()}`
}
