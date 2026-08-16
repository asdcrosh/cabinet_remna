'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert, Wifi } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

type Device = {
  hwid: string
  deviceModel?: string | null
  platform?: string | null
  updatedAt?: string | null
  createdAt?: string | null
}

type CheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'connected'; deviceCount: number; checkedAt: string }
  | { status: 'waiting'; checkedAt: string }
  | { status: 'stopped'; checkedAt: string }
  | { status: 'error'; message: string }

export function VpnConnectionCheck({ supportEnabled }: { supportEnabled: boolean }) {
  const [state, setState] = useState<CheckState>({ status: 'idle' })

  async function checkConnection() {
    setState({ status: 'loading' })

    try {
      const [subscriptionResponse, devicesResponse] = await Promise.all([
        apiFetch<{ subscription: { status?: string | null } | null; warning?: string }>('/api/subscription?refresh=1'),
        apiFetch<{ devices: Device[] }>('/api/devices'),
      ])
      const checkedAt = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

      if (subscriptionResponse.warning) {
        setState({ status: 'error', message: 'Не удалось получить свежий статус подписки. Попробуйте ещё раз чуть позже.' })
        return
      }

      if (!subscriptionResponse.subscription || !['ACTIVE', 'LIMITED'].includes(subscriptionResponse.subscription.status ?? '')) {
        setState({ status: 'stopped', checkedAt })
        return
      }

      const activeDevices = devicesResponse.devices.filter((device) => isActiveToday(device.updatedAt ?? device.createdAt))
      if (activeDevices.length > 0) {
        setState({ status: 'connected', deviceCount: activeDevices.length, checkedAt })
        return
      }

      setState({ status: 'waiting', checkedAt })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Не удалось проверить подключение.',
      })
    }
  }

  return (
    <section className="connection-client-check" aria-live="polite">
      <div className="flex min-w-0 items-start gap-3">
        <span className="connection-client-check__icon"><Wifi className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-950 dark:text-white">Проверить VPN</div>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Проверим подписку и увидим, дошло ли подключение с вашего устройства до сервера.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 px-3"
          onClick={() => void checkConnection()}
          disabled={state.status === 'loading'}
        >
          {state.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Проверить
        </button>
      </div>

      {state.status !== 'idle' && state.status !== 'loading' && (
        <div className={`connection-client-check__result connection-client-check__result--${state.status}`}>
          {state.status === 'connected' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
          {(state.status === 'waiting' || state.status === 'stopped' || state.status === 'error') && <ShieldAlert className="h-4 w-4 shrink-0" />}
          <div className="min-w-0 text-xs leading-5">
            {state.status === 'connected' && (
              <><strong>VPN работает.</strong> Сегодня сервер уже видел активность: {state.deviceCount} {pluralDevices(state.deviceCount)}. Проверено в {state.checkedAt}.</>
            )}
            {state.status === 'waiting' && (
              <><strong>Подписка готова, но подключения пока не видно.</strong> Включите VPN в INCY, откройте любой сайт, подождите несколько секунд и проверьте снова. Проверено в {state.checkedAt}.</>
            )}
            {state.status === 'stopped' && (
              <><strong>Доступ сейчас не активен.</strong> Продлите подписку, затем снова включите VPN в INCY. Проверено в {state.checkedAt}.</>
            )}
            {state.status === 'error' && (
              <><strong>Проверка не завершилась.</strong> {state.message} {supportEnabled && <Link href="/dashboard/support" className="underline underline-offset-2">Написать в поддержку</Link>}</>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function isActiveToday(value?: string | null) {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return Date.now() - date.getTime() <= 24 * 60 * 60 * 1000
}

function pluralDevices(value: number) {
  const remainder = value % 100
  if (remainder >= 11 && remainder <= 14) return 'устройство'
  switch (value % 10) {
    case 1: return 'устройство'
    case 2:
    case 3:
    case 4: return 'устройства'
    default: return 'устройств'
  }
}
