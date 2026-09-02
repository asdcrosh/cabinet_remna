'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, CheckCircle2, ChevronRight, CircleAlert, Copy, Loader2, RefreshCw, Wifi } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

type Device = {
  hwid: string
  updatedAt?: string | null
  createdAt?: string | null
}

type VpnCheckResponse = {
  status: 'vpn' | 'direct' | 'unknown'
  publicIp?: string
  message?: string
  node?: { name: string; country: string | null } | null
}

type ConnectionResult = {
  tone: 'success' | 'warning' | 'danger'
  title: string
  summary: string
  checkedAt: string
  publicIp?: string
  nodeName?: string
  country?: string | null
  deviceCount: number
  deviceLimit?: number | null
  checks: Array<{
    label: string
    detail: string
    state: 'ok' | 'warning' | 'danger'
  }>
  action: 'connection' | 'devices' | 'plans' | 'retry' | 'support' | null
}

type CheckState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'complete'; result: ConnectionResult }

export function VpnConnectionCheck({
  supportEnabled,
  onVerified,
  deviceLimit,
  compact = false,
}: {
  supportEnabled: boolean
  onVerified?: () => void
  deviceLimit?: number | null
  compact?: boolean
}) {
  const [state, setState] = useState<CheckState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  async function checkConnection() {
    setState({ status: 'loading' })
    setCopied(false)

    try {
      const [subscriptionResponse, devicesResponse, vpnResponse] = await Promise.all([
        apiFetch<{ subscription: { status?: string | null } | null; warning?: string }>('/api/subscription?refresh=1'),
        apiFetch<{ devices: Device[] }>('/api/devices'),
        apiFetch<VpnCheckResponse>('/api/vpn-check', { cache: 'no-store' }),
      ])
      const result = buildConnectionResult({
        subscription: subscriptionResponse.subscription,
        subscriptionWarning: subscriptionResponse.warning,
        devices: devicesResponse.devices,
        vpn: vpnResponse,
        deviceLimit,
      })
      setState({ status: 'complete', result })
      if (result.tone === 'success' && onVerified) window.setTimeout(onVerified, 900)
    } catch (error) {
      setState({ status: 'complete', result: buildConnectionError(error, deviceLimit) })
    }
  }

  async function copyResult(result: ConnectionResult) {
    const text = [
      `Проверка подключения: ${result.title}`,
      result.summary,
      result.nodeName ? `Нода: ${result.nodeName}${result.country ? `, ${result.country}` : ''}` : null,
      result.publicIp ? `IP: ${result.publicIp}` : null,
      `Устройства: ${result.deviceCount}${result.deviceLimit ? ` из ${result.deviceLimit}` : ''}`,
      `Проверено: ${result.checkedAt}`,
    ].filter(Boolean).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const result = state.status === 'complete' ? state.result : null

  return (
    <section className={`connection-recovery ${compact ? 'connection-recovery--compact' : ''}`} aria-live="polite">
      <div className="connection-recovery__heading">
        <span className="connection-recovery__icon"><Wifi className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-950 dark:text-white">
            {compact ? 'Проверьте подключение' : 'Диагностика подключения'}
          </div>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            {compact
              ? 'Включите VPN и убедитесь, что устройство подключилось.'
              : 'За один запуск проверим доступ, устройства и маршрут через VPN.'}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0 px-3"
          onClick={() => void checkConnection()}
          disabled={state.status === 'loading'}
        >
          {state.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {state.status === 'loading' ? 'Проверяем' : result ? 'Повторить' : 'Проверить'}
        </button>
      </div>

      {state.status === 'loading' && !compact ? (
        <div className="connection-recovery__loading">
          <span /> <span /> <span />
          <p>Получаем свежий статус подписки и подключения</p>
        </div>
      ) : null}

      {result ? (
        <div className={`connection-recovery__result connection-recovery__result--${result.tone}`}>
          <div className="connection-recovery__summary">
            {result.tone === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
            <div className="min-w-0 flex-1">
              <strong>{result.title}</strong>
              <p>{result.summary}</p>
            </div>
            <time>{result.checkedAt}</time>
          </div>

          {!compact ? (
            <>
              <div className="connection-recovery__checks">
                {result.checks.map((check) => (
                  <div key={check.label} className="connection-recovery__check">
                    <span className={`connection-recovery__check-mark connection-recovery__check-mark--${check.state}`}>
                      {check.state === 'ok' ? <Check className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                    </span>
                    <div>
                      <strong>{check.label}</strong>
                      <small>{check.detail}</small>
                    </div>
                  </div>
                ))}
              </div>

              <div className="connection-recovery__actions">
                <RecoveryAction action={result.action} supportEnabled={supportEnabled} />
                <button type="button" onClick={() => void copyResult(result)}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Скопировано' : 'Скопировать результат'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function RecoveryAction({ action, supportEnabled }: { action: ConnectionResult['action']; supportEnabled: boolean }) {
  if (action === 'connection') return <a href="#connection">Открыть подключение <ChevronRight className="h-4 w-4" /></a>
  if (action === 'devices') return <a href="#connected-devices">Управлять устройствами <ChevronRight className="h-4 w-4" /></a>
  if (action === 'plans') return <Link href="/dashboard/plans?intent=renew">Продлить доступ <ChevronRight className="h-4 w-4" /></Link>
  if ((action === 'support' || action === 'retry') && supportEnabled) return <Link href="/dashboard/support">Открыть поддержку <ChevronRight className="h-4 w-4" /></Link>
  return null
}

export function buildConnectionResult({
  subscription,
  subscriptionWarning,
  devices,
  vpn,
  deviceLimit,
  now = new Date(),
}: {
  subscription: { status?: string | null } | null
  subscriptionWarning?: string
  devices: Device[]
  vpn: VpnCheckResponse
  deviceLimit?: number | null
  now?: Date
}): ConnectionResult {
  const checkedAt = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  const active = Boolean(subscription && ['ACTIVE', 'LIMITED'].includes(subscription.status ?? ''))
  const deviceCount = devices.length
  const capacityReached = Boolean(deviceLimit && deviceCount >= deviceLimit)
  const routeReady = vpn.status === 'vpn' && Boolean(vpn.node)
  const checks: ConnectionResult['checks'] = [
    {
      label: 'Доступ',
      detail: subscriptionWarning ? 'Статус не удалось обновить' : active ? 'Подписка активна' : 'Подписка остановлена',
      state: subscriptionWarning ? 'warning' : active ? 'ok' : 'danger',
    },
    {
      label: 'Профиль',
      detail: subscription ? 'Ссылка подписки доступна' : 'Профиль не найден',
      state: subscription ? 'ok' : 'danger',
    },
    {
      label: 'Устройства',
      detail: deviceLimit ? `${deviceCount} из ${deviceLimit} подключено` : `${deviceCount} подключено`,
      state: capacityReached ? 'warning' : 'ok',
    },
    {
      label: 'Маршрут VPN',
      detail: routeReady && vpn.node
        ? `Через «${vpn.node.name}»${vpn.node.country ? `, ${vpn.node.country}` : ''}`
        : vpn.status === 'direct' ? 'Кабинет открыт напрямую' : 'Маршрут не определён',
      state: routeReady ? 'ok' : vpn.status === 'unknown' ? 'warning' : 'danger',
    },
  ]

  if (subscriptionWarning) return createResult({
    tone: 'warning', title: 'Статус подписки не обновился',
    summary: 'Подождите минуту и повторите проверку. Текущие настройки не изменены.',
    action: 'retry', checkedAt, vpn, deviceCount, deviceLimit, checks,
  })
  if (!active) return createResult({
    tone: 'danger', title: 'Доступ остановлен',
    summary: 'Продлите подписку. После оплаты заново настраивать устройства не потребуется.',
    action: 'plans', checkedAt, vpn, deviceCount, deviceLimit, checks,
  })
  if (!routeReady) return createResult({
    tone: 'warning',
    title: vpn.status === 'direct' ? 'VPN не включён на этом устройстве' : 'Маршрут пока не определён',
    summary: vpn.status === 'direct'
      ? 'Откройте INCY, включите VPN, загрузите любой сайт и повторите проверку.'
      : vpn.message || 'Проверьте подключение в INCY и повторите попытку через несколько секунд.',
    action: 'connection', checkedAt, vpn, deviceCount, deviceLimit, checks,
  })
  if (capacityReached) return createResult({
    tone: 'warning', title: 'VPN работает, но места для нового устройства нет',
    summary: 'Отключите неиспользуемое устройство перед добавлением нового.',
    action: 'devices', checkedAt, vpn, deviceCount, deviceLimit, checks,
  })
  return createResult({
    tone: 'success', title: 'Подключение работает',
    summary: `Это устройство подключено через сервер «${vpn.node?.name}»${vpn.node?.country ? `, ${vpn.node.country}` : ''}.`,
    action: deviceCount > 0 ? 'devices' : null, checkedAt, vpn, deviceCount, deviceLimit, checks,
  })
}

function createResult(input: {
  tone: ConnectionResult['tone']
  title: string
  summary: string
  action: ConnectionResult['action']
  checkedAt: string
  vpn: VpnCheckResponse
  deviceCount: number
  deviceLimit?: number | null
  checks: ConnectionResult['checks']
}): ConnectionResult {
  return {
    tone: input.tone,
    title: input.title,
    summary: input.summary,
    action: input.action,
    checkedAt: input.checkedAt,
    publicIp: input.vpn.publicIp,
    nodeName: input.vpn.node?.name,
    country: input.vpn.node?.country,
    deviceCount: input.deviceCount,
    deviceLimit: input.deviceLimit,
    checks: input.checks,
  }
}

function buildConnectionError(error: unknown, deviceLimit?: number | null): ConnectionResult {
  return {
    tone: 'danger',
    title: 'Проверка не завершилась',
    summary: error instanceof Error ? error.message : 'Сервис диагностики временно недоступен.',
    checkedAt: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    deviceCount: 0,
    deviceLimit,
    checks: [{ label: 'Диагностика', detail: 'Не удалось получить все данные', state: 'danger' }],
    action: 'support',
  }
}
