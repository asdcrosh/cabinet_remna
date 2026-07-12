'use client'

import { useCallback, useEffect, useState } from 'react'
import { Clock3, Hash, Laptop, Loader2, Monitor, RefreshCw, Smartphone, Tablet, Unlink2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { EmptyState, InlineAlert } from './empty-state'
import { ConfirmDialog } from './confirm-dialog'
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

export function DevicesList() {
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [removingHwid, setRemovingHwid] = useState<string | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)

  const loadDevices = useCallback(async () => {
    setError(null)
    setRefreshing(true)
    try {
      const data = await apiFetch<{ devices: Device[] }>('/api/devices')
      setDevices(data.devices)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить устройства')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadDevices()
  }, [loadDevices])

  async function removeDevice(device: Device) {
    setRemovingHwid(device.hwid)
    setError(null)
    try {
      await apiFetch(`/api/devices/${encodeURIComponent(device.hwid)}`, { method: 'DELETE' })
      setDevices((current) => current?.filter((item) => item.hwid !== device.hwid) ?? [])
      setSelectedDevice(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отвязать устройство')
    } finally {
      setRemovingHwid(null)
    }
  }

  if (error) return <InlineAlert tone="danger" title="Не удалось загрузить устройства" description={error} />
  if (!devices) return <DevicesSkeleton />
  if (devices.length === 0) {
    return (
      <EmptyState
        title="Устройств пока нет"
        description="Они появятся здесь после первого подключения к VPN."
      />
    )
  }

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white/90 shadow-sm shadow-slate-200/50 backdrop-blur dark:border-white/10 dark:bg-white/[0.035] dark:shadow-black/20">
        <div className="border-b border-slate-100 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.02] sm:p-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">Подключенные устройства</div>
                <h2 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{devices.length}</h2>
              </div>
              <button
                type="button"
                className="btn-secondary min-h-10 shrink-0 px-3"
                onClick={() => void loadDevices()}
                disabled={refreshing}
                aria-label="Обновить устройства"
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                <span className="hidden sm:inline">Обновить</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <DeviceMetric label="За сутки" value={countRecentDevices(devices).toString()} />
              <DeviceMetric label="За неделю" value={countWeekDevices(devices).toString()} />
              <DeviceMetric label="Всего" value={devices.length.toString()} />
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 p-3 sm:gap-3 sm:p-5 lg:grid-cols-2 2xl:grid-cols-3">
          {devices.map((d) => (
            <DeviceCard
              key={d.hwid}
              device={d}
              loading={removingHwid === d.hwid}
              onRemove={() => setSelectedDevice(d)}
            />
          ))}
        </div>
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
    </>
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
    <article className="group relative overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-white hover:shadow-lg hover:shadow-slate-950/5 dark:border-white/10 dark:bg-surface-950/35 dark:hover:border-cyan-500/30 dark:hover:bg-white/[0.055] sm:p-4">
      <div className="relative space-y-3 sm:space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-sm dark:bg-cyan-300/10 dark:text-cyan-200">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-950 dark:text-white sm:text-base">{getDeviceTitle(device)}</h2>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500 dark:text-slate-400">{getDeviceSubtitle(device)}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
              <Clock3 className="h-3.5 w-3.5" />
              Активность
            </div>
            <div className="mt-1">{formatDeviceDate(device.updatedAt || device.createdAt)}</div>
          </div>
          <div className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
              <Hash className="h-3.5 w-3.5" />
              ID
            </div>
            <div className="mt-1 truncate font-mono">{shortDeviceId(device.hwid)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', activity.className)}>
            {activity.label}
          </span>
          <DeviceActionButton
            loading={loading}
            label="Отвязать"
            onClick={onRemove}
          />
        </div>
      </div>
    </article>
  )
}

function DeviceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/80 px-2.5 py-2 text-sm shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-surface-950/35 dark:shadow-black/10 sm:px-3">
      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">{label}</div>
      <div className="mt-0.5 font-semibold text-slate-950 dark:text-white">{value}</div>
    </div>
  )
}

function DeviceActionButton({
  loading,
  fullWidth = false,
  label = 'Отвязать',
  onClick,
}: {
  loading: boolean
  fullWidth?: boolean
  label?: string
  onClick: () => void
}) {
  const Icon = loading ? Loader2 : Unlink2

  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-700 shadow-sm shadow-red-950/5 transition-all',
        'hover:-translate-y-0.5 hover:border-red-300 hover:bg-red-100 hover:text-red-800',
        'disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60',
        'dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/15',
        fullWidth ? 'w-full' : 'w-[104px]'
      )}
      disabled={loading}
      onClick={onClick}
    >
      <Icon className={cn('h-4 w-4 shrink-0', loading && 'animate-spin')} />
      <span className="truncate">{loading ? 'Ждем...' : label}</span>
    </button>
  )
}

function DevicesSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-900">
      <div className="mb-4 h-10 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-surface-800" />
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-44 animate-pulse rounded-lg bg-slate-100 dark:bg-surface-800" />
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

function countWeekDevices(devices: Device[]) {
  const weekMs = 7 * 24 * 60 * 60 * 1000
  return devices.filter((device) => {
    const date = device.updatedAt || device.createdAt
    return date ? Date.now() - new Date(date).getTime() <= weekMs : false
  }).length
}

function shortDeviceId(hwid: string) {
  return hwid.length > 18 ? `${hwid.slice(0, 18)}...` : hwid
}

function formatDeviceDate(date: string | null | undefined) {
  if (!date) return '—'
  return new Date(date).toLocaleString('ru-RU')
}
