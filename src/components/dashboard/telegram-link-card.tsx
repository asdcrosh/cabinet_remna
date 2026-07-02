'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ExternalLink, RefreshCw, Send } from 'lucide-react'
import { toast } from '@/components/ui/toaster'
import { apiFetch } from '@/lib/api-client'

interface TelegramLinkCardProps {
  telegramClientId: string | null
  appUrl: string | null
  telegramId: string | null
  telegramUsername: string | null
  remnashopUserId: number | null
  remnawaveUsername: string | null
  embedded?: boolean
}

export function TelegramLinkCard({
  telegramClientId,
  appUrl,
  telegramId,
  telegramUsername,
  remnashopUserId,
  remnawaveUsername,
  embedded = false,
}: TelegramLinkCardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [syncing, setSyncing] = useState(false)
  const telegramStartUrl = appUrl ? `${appUrl.replace(/\/+$/, '')}/api/me/telegram/oidc/start` : '/api/me/telegram/oidc/start'

  const syncTelegram = useCallback(async (clearCallbackState = false) => {
    setSyncing(true)
    try {
      const response = await apiFetch<{
        warnings?: string[]
        sync?: { devicesSynced?: number }
      }>('/api/me/telegram/sync', { method: 'POST' })
      const warnings = response.warnings?.filter(Boolean) ?? []
      toast(
        warnings.length
          ? `Синхронизация завершена с предупреждением: ${warnings.join('; ')}`
          : `Telegram синхронизирован. Устройств: ${response.sync?.devicesSynced ?? 0}`,
        warnings.length ? undefined : 'success'
      )
      if (clearCallbackState) {
        router.replace('/dashboard/settings')
      } else {
        router.refresh()
      }
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setSyncing(false)
    }
  }, [router])

  useEffect(() => {
    const error = searchParams.get('telegram_error')
    if (searchParams.get('telegram_linked') === '1') {
      if (searchParams.get('telegram_sync') === 'pending') {
        void syncTelegram(true)
        return
      }
      toast(
        searchParams.get('telegram_sync') === 'failed'
          ? 'Telegram привязан, но синхронизация не удалась'
          : 'Telegram привязан и синхронизирован',
        searchParams.get('telegram_sync') === 'failed' ? undefined : 'success'
      )
    } else if (error) {
      toast(`Telegram не привязан: ${error}`)
    }
  }, [searchParams, syncTelegram])

  return (
    <div className={embedded ? '' : 'card'}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300">
            <Send className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold">Перенос из Telegram</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Нужен только тем, кто покупал VPN раньше через Telegram.
            </p>
          </div>
        </div>
        {telegramId ? (
          <button type="button" className="btn-secondary shrink-0" onClick={() => void syncTelegram()} disabled={syncing}>
            <RefreshCw className="h-4 w-4" />
            {syncing ? 'Синхронизация...' : 'Синхронизировать'}
          </button>
        ) : null}
      </div>

      <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
        <Info label="Telegram" value={telegramId ? `@${telegramUsername || telegramId}` : 'не привязан'} />
        <Info label="Старая подписка" value={remnashopUserId ? 'найдена' : 'не найдена'} />
        <Info label="VPN-профиль" value={remnawaveUsername ? 'готов' : 'пока нет'} />
      </div>

      {telegramId ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
          Telegram привязан. Если старая подписка найдена, она появится в кабинете.
        </div>
      ) : !telegramClientId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Перенос старой подписки временно недоступен.
        </div>
      ) : (
        <div className="space-y-3">
          <a href={telegramStartUrl} className="btn btn-primary inline-flex w-full items-center justify-center gap-2 sm:w-auto">
            <Send className="h-4 w-4" />
            Найти старую подписку
            <ExternalLink className="h-4 w-4" />
          </a>
          <TelegramOidcHint />
        </div>
      )}

    </div>
  )
}

function TelegramOidcHint() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
      <div className="font-medium text-slate-700 dark:text-slate-100">Только для переноса старого аккаунта</div>
      <div className="mt-1">
        Новым пользователям этот шаг не нужен.
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-surface-950/35">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate font-medium text-slate-950 dark:text-white">{value}</div>
    </div>
  )
}
