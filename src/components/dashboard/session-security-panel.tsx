'use client'

import { useState } from 'react'
import { Clock3, KeyRound, Laptop, LogOut, Send, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LogoutButton } from '@/components/dashboard/logout-button'

type SecurityEvent = {
  id: string
  action: 'USER_PASSWORD_CHANGED' | 'USER_SESSIONS_REVOKED' | 'ADMIN_PROFILE_UPDATED'
  createdAt: string
  userAgent: string | null
  message: string
}

export function SessionSecurityPanel({
  expiresAt,
  events,
}: {
  expiresAt: string | null
  events: SecurityEvent[]
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function revokeAllSessions() {
    setLoading(true)
    try {
      await apiFetch('/api/me/sessions', { method: 'DELETE' })
      router.push('/login?sessions=revoked')
      router.refresh()
    } catch {
      setConfirmOpen(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/[0.08]" aria-labelledby="sessions-title">
      <div className="flex items-start gap-3 bg-slate-50/70 p-4 dark:bg-white/[0.025]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="sessions-title" className="text-sm font-semibold text-slate-950 dark:text-white">Сеансы аккаунта</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Здесь можно завершить текущий сеанс или сразу отозвать доступ на всех устройствах.
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-200 bg-white dark:divide-white/[0.08] dark:bg-transparent">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Laptop className="h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Это устройство</div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {expiresAt ? `Вход действует до ${formatSessionExpiry(expiresAt)}` : 'Текущий сеанс активен'}
              </div>
            </div>
          </div>
          <div className="w-full overflow-hidden rounded-xl border border-slate-200 sm:w-36 dark:border-white/10">
            <LogoutButton />
          </div>
        </div>

        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Все устройства</div>
            <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Завершит все входы в кабинет, включая этот. Пароль останется прежним.
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary min-h-10 w-full shrink-0 justify-center border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-400/20 dark:text-rose-200 dark:hover:bg-rose-400/10 sm:w-auto"
            onClick={() => setConfirmOpen(true)}
          >
            <LogOut className="h-4 w-4" />
            Выйти везде
          </button>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-slate-400" />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Последние действия</h4>
          </div>
          {events.length > 0 ? (
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/[0.03]">
                  {event.action === 'USER_PASSWORD_CHANGED' ? (
                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  ) : event.action === 'ADMIN_PROFILE_UPDATED' ? (
                    <Send className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  ) : (
                    <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {event.action === 'USER_PASSWORD_CHANGED'
                        ? 'Пароль изменён'
                        : event.action === 'ADMIN_PROFILE_UPDATED'
                          ? event.message.includes('изменил') ? 'Telegram изменён' : 'Telegram подключён'
                          : 'Все сеансы завершены'}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatSecurityEventDate(event.createdAt)}{event.userAgent ? ` · ${browserLabel(event.userAgent)}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Здесь появятся смена пароля, Telegram и завершение всех сеансов.
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Завершить все сеансы?"
        description="На всех устройствах потребуется снова войти в кабинет. Используйте это действие, если заметили неизвестный вход."
        confirmLabel="Выйти на всех устройствах"
        loading={loading}
        tone="danger"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void revokeAllSessions()}
      />
    </section>
  )
}

function formatSessionExpiry(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatSecurityEventDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function browserLabel(userAgent: string) {
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Chrome\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return 'браузер'
}
