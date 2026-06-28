'use client'

import { useEffect, useState } from 'react'
import { Clock3, Hash, Laptop, Loader2, Monitor, Smartphone, Tablet, Unlink2 } from 'lucide-react'
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
  const [removingHwid, setRemovingHwid] = useState<string | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)

  useEffect(() => {
    apiFetch<{ devices: Device[] }>('/api/devices')
      .then((d) => setDevices(d.devices))
      .catch((e) => setError(e.message))
  }, [])

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
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-surface-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Подключенные устройства</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">{devices.length}</div>
        </div>
        <div className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200">
          {countRecentDevices(devices)} активных за сутки
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
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
    <article className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 p-4 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:bg-white hover:shadow-lg hover:shadow-slate-950/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-cyan-500/30 dark:hover:bg-white/[0.05]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-cyan-100/70 blur-2xl opacity-0 transition group-hover:opacity-100 dark:bg-cyan-500/10" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-sm dark:bg-white dark:text-slate-950">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-950 dark:text-white">{getDeviceTitle(device)}</h2>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500 dark:text-slate-400">{getDeviceSubtitle(device)}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-surface-900/70">
            <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
              <Clock3 className="h-3.5 w-3.5" />
              Активность
            </div>
            <div className="mt-1">{formatDeviceDate(device.updatedAt || device.createdAt)}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-surface-900/70">
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

function shortDeviceId(hwid: string) {
  return hwid.length > 18 ? `${hwid.slice(0, 18)}...` : hwid
}

function formatDeviceDate(date: string | null | undefined) {
  if (!date) return '—'
  return new Date(date).toLocaleString('ru-RU')
}
