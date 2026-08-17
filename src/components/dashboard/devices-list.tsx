'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CircleAlert, Laptop, Loader2, Monitor, Plus, RefreshCw, Smartphone, Tablet, Trash2, Unlink2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { InlineAlert } from './empty-state'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/cn'

interface Device {
  hwid: string
  platform?: string | null
  osVersion?: string | null
  deviceModel?: string | null
  userAgent?: string | null
  ip?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

interface DevicesListProps {
  embedded?: boolean
  deviceLimit?: number | null
  subscriptionUrl?: string
}

export function DevicesList({ embedded = false, deviceLimit, subscriptionUrl }: DevicesListProps = {}) {
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [removingHwid, setRemovingHwid] = useState<string | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkRemoving, setBulkRemoving] = useState(false)

  const loadDevices = useCallback(async () => {
    setLoadError(null)
    setActionError(null)
    setRefreshing(true)
    try {
      const data = await apiFetch<{ devices: Device[] }>('/api/devices')
      setDevices(data.devices)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Не удалось загрузить устройства')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  async function removeDevice(device: Device) {
    setRemovingHwid(device.hwid)
    setActionError(null)
    try {
      await apiFetch(`/api/devices/${encodeURIComponent(device.hwid)}`, { method: 'DELETE' })
      setDevices((current) => current?.filter((item) => item.hwid !== device.hwid) ?? [])
      setSelectedDevice(null)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Не удалось отвязать устройство')
    } finally {
      setRemovingHwid(null)
    }
  }

  async function removeAllDevices() {
    setBulkRemoving(true)
    setActionError(null)
    try {
      await apiFetch('/api/devices', { method: 'DELETE' })
      setDevices([])
      setBulkDialogOpen(false)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Не удалось отвязать устройства')
    } finally {
      setBulkRemoving(false)
    }
  }

  function addDevice() {
    if (!subscriptionUrl) {
      window.location.assign('/dashboard/subscription#connection')
      return
    }

    window.location.assign(`incy://import/${subscriptionUrl}`)
    window.setTimeout(() => {
      void navigator.clipboard?.writeText(subscriptionUrl).catch(() => undefined)
    }, 500)
  }

  if (loadError && !devices) {
    return (
      <div className="space-y-3">
        <InlineAlert tone="danger" title="Не удалось загрузить устройства" description={loadError} />
        <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => void loadDevices()}>
          <RefreshCw className="h-4 w-4" />
          Попробовать снова
        </button>
      </div>
    )
  }
  if (!devices) return <DevicesSkeleton compact={embedded} />
  if (devices.length === 0) {
    if (embedded) {
      return (
        <section id="connected-devices" className="device-panel device-panel--embedded overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="border-b border-slate-200 p-4 dark:border-white/10">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Устройства</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
              Появятся после первого запуска VPN.
            </p>
          </div>
          <div className="px-4 py-7 text-center">
            <Smartphone className="mx-auto h-6 w-6 text-slate-400" />
            <div className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">Пока пусто</div>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Сначала подключите приложение слева.
            </p>
            <Link href="/dashboard/subscription#connection" className="btn-secondary mt-4 w-full justify-center">
              К подключению
            </Link>
          </div>
        </section>
      )
    }

    return (
      <section id="connected-devices" className="device-panel overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Проверьте подключение</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">После первого запуска VPN устройство появится здесь автоматически.</p>
        </div>
        <div className="px-4 py-8 text-center sm:px-5 sm:py-10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
            <Smartphone className="h-6 w-6" />
          </span>
          <div className="mt-4 font-semibold text-slate-950 dark:text-white">Устройств пока нет</div>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">Вернитесь к подключению, добавьте подписку в приложение и включите VPN.</p>
          <Link href="/dashboard/subscription#connection" className="btn-primary mt-5 w-full sm:w-auto">Подключить устройство</Link>
        </div>
      </section>
    )
  }

  const recentDevices = countRecentDevices(devices)
  const devicesValue = deviceLimit && deviceLimit > 0 ? `${devices.length} из ${deviceLimit}` : devices.length.toString()
  const limitState = getDeviceLimitState(devices.length, deviceLimit)

  if (embedded) {
    return (
      <>
        {(loadError || actionError) && (
          <InlineAlert
            tone="danger"
            title={actionError ? 'Не удалось отвязать устройство' : 'Не удалось обновить список'}
            description={actionError || loadError || undefined}
          />
        )}
        <section id="connected-devices" className="device-panel device-panel--embedded overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Устройства</h2>
                <span className="device-count-chip rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">
                  {devicesValue}
                </span>
              </div>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                {recentDevices > 0 ? 'VPN использовался сегодня.' : 'Сегодня подключений не было.'}
              </p>
              <DeviceLimitNotice state={limitState} compact />
            </div>
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              onClick={() => void loadDevices()}
              disabled={refreshing}
              aria-label="Обновить устройства"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {devices.map((device) => (
              <CompactDeviceRow
                key={device.hwid}
                device={device}
                loading={removingHwid === device.hwid}
                onRemove={() => setSelectedDevice(device)}
              />
            ))}
          </div>
          <DeviceListActions
            deviceCount={devices.length}
            onAdd={addDevice}
            onRemoveAll={() => setBulkDialogOpen(true)}
          />
        </section>
        <ConfirmDialog
          open={Boolean(selectedDevice)}
          title="Отвязать устройство?"
          description="Устройство исчезнет из списка привязок. При следующем подключении может потребоваться повторная авторизация."
          confirmLabel="Отвязать"
          loading={Boolean(removingHwid)}
          onCancel={() => setSelectedDevice(null)}
          onConfirm={() => selectedDevice && removeDevice(selectedDevice)}
        />
        <ConfirmDialog
          open={bulkDialogOpen}
          title="Отвязать все устройства?"
          description="Доступ, профиль и платежи сохранятся. На каждом устройстве потребуется повторно открыть подписку."
          confirmLabel="Отвязать все"
          loading={bulkRemoving}
          onCancel={() => setBulkDialogOpen(false)}
          onConfirm={removeAllDevices}
        />
      </>
    )
  }

  return (
    <>
      {(loadError || actionError) && (
        <InlineAlert
          tone="danger"
          title={actionError ? 'Не удалось отвязать устройство' : 'Не удалось обновить список'}
          description={actionError || loadError || undefined}
        />
      )}
      <section id="connected-devices" className="device-panel overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5 sm:py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Подключённые устройства</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {recentDevices > 0 ? 'Подключение работает. Здесь можно проверить активность и отвязать старые устройства.' : 'Устройства найдены, но сегодня ещё не подключались.'}
              </p>
              <DeviceLimitNotice state={limitState} />
            </div>
            <button
              type="button"
              className="btn-secondary min-h-10 w-full shrink-0 px-3 sm:w-auto"
              onClick={() => void loadDevices()}
              disabled={refreshing}
              aria-label="Обновить устройства"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Обновить
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <DeviceMetric label={deviceLimit && deviceLimit > 0 ? 'использовано' : 'всего'} value={devicesValue} />
            <DeviceMetric label="активны сегодня" value={recentDevices.toString()} active={recentDevices > 0} />
          </div>
        </div>

        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
          {devices.map((d) => (
            <DeviceCard
              key={d.hwid}
              device={d}
              loading={removingHwid === d.hwid}
              onRemove={() => setSelectedDevice(d)}
            />
          ))}
        </div>
        <DeviceListActions
          deviceCount={devices.length}
          onAdd={addDevice}
          onRemoveAll={() => setBulkDialogOpen(true)}
        />
      </section>
      <ConfirmDialog
        open={Boolean(selectedDevice)}
        title="Отвязать устройство?"
        description="Устройство исчезнет из списка привязок. При следующем подключении может потребоваться повторная авторизация."
        confirmLabel="Отвязать"
        loading={Boolean(removingHwid)}
        onCancel={() => setSelectedDevice(null)}
        onConfirm={() => selectedDevice && removeDevice(selectedDevice)}
      />
      <ConfirmDialog
        open={bulkDialogOpen}
        title="Отвязать все устройства?"
        description="Доступ, профиль и платежи сохранятся. На каждом устройстве потребуется повторно открыть подписку."
        confirmLabel="Отвязать все"
        loading={bulkRemoving}
        onCancel={() => setBulkDialogOpen(false)}
        onConfirm={removeAllDevices}
      />
    </>
  )
}

function DeviceLimitNotice({ state, compact = false }: { state: DeviceLimitState; compact?: boolean }) {
  const Icon = state.tone === 'danger' || state.tone === 'warning' ? CircleAlert : null
  return (
    <div className={cn('device-limit-notice', `device-limit-notice--${state.tone}`, compact && 'device-limit-notice--compact')}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      <span>{state.text}</span>
    </div>
  )
}

function DeviceListActions({
  deviceCount,
  onAdd,
  onRemoveAll,
}: {
  deviceCount: number
  onAdd: () => void
  onRemoveAll: () => void
}) {
  return (
    <div className="device-list-actions">
      <button type="button" className="btn-secondary device-list-actions__add" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Подключить ещё
      </button>
      {deviceCount > 1 && (
        <button type="button" className="device-list-actions__remove" onClick={onRemoveAll}>
          <Trash2 className="h-3.5 w-3.5" />
          Отвязать все
        </button>
      )}
    </div>
  )
}

function DeviceCard({
  device,
  loading,
  onRemove,
}: {
  device: Device
  loading: boolean
  onRemove: () => void
}) {
  const activity = getActivityState(device.updatedAt || device.createdAt)
  const Icon = getDeviceIcon(device)

  return (
    <article className="device-card flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-white/[0.08] dark:bg-white/[0.025]">
      <div className="flex min-w-0 items-start gap-3">
        <div className="device-card__icon grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-cyan-700 shadow-sm dark:bg-white/[0.06] dark:text-cyan-200 dark:shadow-none">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col items-start gap-1.5 min-[380px]:flex-row min-[380px]:justify-between min-[380px]:gap-2">
            <h3 className="min-w-0 break-words text-sm font-semibold text-slate-950 dark:text-white sm:text-base">{getDeviceTitle(device)}</h3>
            <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold', activity.className)}>{activity.label}</span>
          </div>
          <p className="mt-1 break-words text-sm leading-5 text-slate-500 dark:text-slate-400">{getDeviceSubtitle(device)}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col items-stretch gap-3 border-t border-slate-200/70 pt-3 dark:border-white/[0.08] min-[380px]:flex-row min-[380px]:items-end min-[380px]:justify-between">
        <div className="min-w-0 text-xs text-slate-400 dark:text-slate-500">
          <div>Последняя активность</div>
          <div className="mt-0.5 break-words font-medium text-slate-600 dark:text-slate-300">{formatDeviceDate(device.updatedAt || device.createdAt)}</div>
          <div className="mt-0.5 break-all font-mono text-[11px]" title={device.hwid}>ID {shortDeviceId(device.hwid)}</div>
        </div>
        <DeviceActionButton loading={loading} label="Отвязать" onClick={onRemove} />
      </div>
    </article>
  )
}

function CompactDeviceRow({
  device,
  loading,
  onRemove,
}: {
  device: Device
  loading: boolean
  onRemove: () => void
}) {
  const activity = getActivityState(device.updatedAt || device.createdAt)
  const Icon = getDeviceIcon(device)

  return (
    <article className="device-row flex min-w-0 items-center gap-3 px-4 py-3.5">
      <span className="device-row__icon grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-cyan-700 dark:bg-white/[0.06] dark:text-cyan-200">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-slate-950 dark:text-white" title={getDeviceTitle(device)}>
          {getDeviceTitle(device)}
        </h3>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            activity.label === 'Активно сегодня' ? 'bg-emerald-500' : 'bg-slate-400'
          )} />
          <span className="truncate">{activity.label}</span>
        </div>
      </div>
      <button
        type="button"
        className="device-row__remove grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:hover:bg-red-500/10 dark:hover:text-red-200"
        disabled={loading}
        onClick={onRemove}
        aria-label={`Отвязать ${getDeviceTitle(device)}`}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink2 className="h-4 w-4" />}
      </button>
    </article>
  )
}

function DeviceMetric({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={cn('device-metric rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]', active && 'device-metric--active')}>
      <div className={cn('text-lg font-semibold tracking-tight text-slate-950 dark:text-white', active && 'text-emerald-700 dark:text-emerald-200')}>{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}

function DeviceActionButton({
  loading,
  label = 'Отвязать',
  onClick,
}: {
  loading: boolean
  label?: string
  onClick: () => void
}) {
  const Icon = loading ? Loader2 : Unlink2

  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200/80 bg-white px-3 text-sm font-medium text-red-700 transition-colors',
        'hover:border-red-300 hover:bg-red-50 hover:text-red-800',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/15',
        'w-full shrink-0 min-[380px]:w-auto'
      )}
      disabled={loading}
      onClick={onClick}
    >
      <Icon className={cn('h-4 w-4 shrink-0', loading && 'animate-spin')} />
      <span className="truncate">{loading ? 'Ждём...' : label}</span>
    </button>
  )
}

function DevicesSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
        <div className="space-y-2 border-b border-slate-200 p-4 dark:border-white/10">
          <div className="skeleton h-5 w-28 rounded-md" />
          <div className="skeleton h-3 w-44 max-w-full rounded-md" />
        </div>
        <div className="divide-y divide-slate-200 dark:divide-white/10">
          {[0, 1].map((item) => (
            <div key={item} className="flex items-center gap-3 px-4 py-3.5">
              <div className="skeleton h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="skeleton h-3.5 w-32 max-w-full rounded" />
                <div className="skeleton h-3 w-20 rounded" />
              </div>
              <div className="skeleton h-9 w-9 shrink-0 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
      <div className="space-y-2 border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5 sm:py-5">
        <div className="h-4 w-16 animate-pulse rounded-lg bg-slate-200 dark:bg-surface-800" />
        <div className="h-7 w-56 max-w-full animate-pulse rounded-lg bg-slate-200 dark:bg-surface-800" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-lg bg-slate-100 dark:bg-surface-800" />
        <div className="grid grid-cols-2 gap-2 pt-2">
          <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-surface-800" />
          <div className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-surface-800" />
        </div>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
        {[0, 1].map((item) => (
          <div key={item} className="rounded-2xl border border-slate-100 p-4 dark:border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-slate-200 dark:bg-surface-800" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-36 max-w-full animate-pulse rounded bg-slate-200 dark:bg-surface-800" />
                <div className="h-3 w-48 max-w-[80%] animate-pulse rounded bg-slate-100 dark:bg-surface-800" />
              </div>
            </div>
            <div className="mt-5 h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-surface-800" />
          </div>
        ))}
      </div>
    </div>
  )
}

function getDeviceTitle(device: Device) {
  if (device.deviceModel && device.platform) return `${device.deviceModel} · ${device.platform}`
  return device.deviceModel || device.platform || 'Неизвестное устройство'
}

function getDeviceSubtitle(device: Device) {
  const parts = [device.osVersion ? `OS ${device.osVersion}` : null, device.ip].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : device.userAgent || 'Детали устройства не переданы'
}

function getDeviceIcon(device: Device) {
  const text = `${device.platform ?? ''} ${device.deviceModel ?? ''} ${device.userAgent ?? ''}`.toLowerCase()
  if (text.includes('iphone') || text.includes('ios') || text.includes('android')) return Smartphone
  if (text.includes('ipad') || text.includes('tablet')) return Tablet
  if (text.includes('windows') || text.includes('linux') || text.includes('desktop')) return Monitor
  return Laptop
}

function getActivityState(date: string | null | undefined) {
  if (!date) {
    return {
      label: 'Нет активности',
      className: 'border-slate-200 bg-white text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400',
    }
  }
  const diffMs = Date.now() - new Date(date).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  if (diffMs <= dayMs) {
    return {
      label: 'Активно сегодня',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200',
    }
  }
  if (diffMs <= 7 * dayMs) {
    return {
      label: 'На этой неделе',
      className: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200',
    }
  }
  return {
    label: 'Давно не было',
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200',
  }
}

function countRecentDevices(devices: Device[]) {
  const dayMs = 24 * 60 * 60 * 1000
  return devices.filter((device) => {
    const date = device.updatedAt || device.createdAt
    return date ? Date.now() - new Date(date).getTime() <= dayMs : false
  }).length
}

type DeviceLimitState = {
  tone: 'neutral' | 'warning' | 'danger'
  text: string
}

function getDeviceLimitState(used: number, limit?: number | null): DeviceLimitState {
  if (!limit || limit < 1) return { tone: 'neutral', text: 'Количество устройств не ограничено.' }

  const remaining = Math.max(limit - used, 0)
  if (remaining === 0) return { tone: 'danger', text: 'Лимит достигнут. Отвяжите старое устройство перед новым подключением.' }
  if (remaining === 1) return { tone: 'warning', text: 'Осталось одно свободное место.' }
  return { tone: 'neutral', text: `Свободно мест: ${remaining}.` }
}

function shortDeviceId(hwid: string) {
  return hwid.length > 18 ? `${hwid.slice(0, 18)}...` : hwid
}

function formatDeviceDate(date: string | null | undefined) {
  if (!date) return '—'
  return new Date(date).toLocaleString('ru-RU')
}
