import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Activity, CalendarClock, Search } from 'lucide-react'
import { AuditAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdminPage } from '@/lib/auth/admin-page'
import { PageHeader } from '@/components/dashboard/page-header'
import { AdminFilterSubmitButton } from '@/components/admin/admin-filter-submit-button'
import { AdminFilterBar } from '@/components/admin/admin-filter-bar'
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
      <PageHeader title="История действий" description="Админские операции, выдачи тарифов и важные изменения" />

      <AdminFilterBar
        action="/dashboard/admin/audit"
        resetHref="/dashboard/admin/audit"
        resetVisible={Boolean(q || action !== 'ALL')}
        count={{ shown: visibleLogs.length, total }}
        className="md:grid-cols-[minmax(14rem,1fr)_14rem_auto_auto]"
      >
        <input type="hidden" name="limit" value="50" />
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={q} placeholder="Поиск по email или действию" className="input pl-9" />
        </div>
        <select name="action" defaultValue={action} className="input">
          <option value="ALL">Все действия</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <AdminFilterSubmitButton />
      </AdminFilterBar>

      <div className="space-y-3">
        {visibleLogs.length === 0 && (
          <AdminEmptyState title="Записей пока нет" description="История появится после админских действий." />
        )}
        {visibleLogs.map((log) => (
          <article key={log.id} className="card p-0">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950">
                  <Activity className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge-active">{ACTION_LABELS[log.action]}</span>
                    <h2 className="font-semibold">{log.message}</h2>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {log.actor ? `Автор: ${log.actor.email}` : 'Системное действие'}
                    {log.target ? ` · Пользователь: ${log.target.email}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                <CalendarClock className="h-3.5 w-3.5" />
                {log.createdAt.toLocaleString('ru-RU')}
              </div>
            </div>
            {log.metadata && (
              <div className="border-t bg-slate-50/70 px-4 py-3 text-xs text-slate-500 dark:bg-white/[0.02]">
                <pre className="max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            )}
          </article>
        ))}
        {hasMore && (
          <div className="text-center">
            <Link href={buildMoreHref(q, action, limit + 50)} className="btn-secondary inline-flex">
              Показать еще
            </Link>
          </div>
        )}
      </div>
    </div>
  )
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
