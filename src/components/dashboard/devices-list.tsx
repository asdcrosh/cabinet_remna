'use client'

import { useEffect, useState } from 'react'
import { Loader2, Unlink2 } from 'lucide-react'
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
    <div className="table-shell hidden xl:block">
      <table className="data-table min-w-[860px]">
        <thead className="bg-slate-50 dark:bg-surface-800 text-left text-slate-500">
          <tr>
            <th className="w-[320px]">Устройство</th>
            <th className="w-[220px]">ID устройства</th>
            <th className="w-[200px]">Последняя активность</th>
            <th className="sticky-actions-head w-[112px] min-w-[112px] text-center">Действие</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {devices.map((d) => (
            <tr key={d.hwid}>
              <td>
                <div className="max-w-[290px] truncate font-medium">{getDeviceTitle(d)}</div>
                <div className="max-w-[290px] truncate text-xs text-slate-500">{getDeviceSubtitle(d)}</div>
              </td>
              <td className="font-mono text-xs">{d.hwid.slice(0, 16)}…</td>
              <td className="text-sm text-slate-500">{formatDeviceDate(d.updatedAt || d.createdAt)}</td>
              <td className="sticky-actions-cell w-[112px] min-w-[112px] text-center">
                <DeviceActionButton
                  loading={removingHwid === d.hwid}
                  onClick={() => setSelectedDevice(d)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="space-y-3 xl:hidden">
      {devices.map((d) => (
        <div key={d.hwid} className="card space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{getDeviceTitle(d)}</div>
              <div className="mt-1 break-words text-sm text-slate-500">{getDeviceSubtitle(d)}</div>
              <div className="mt-2 font-mono text-xs text-slate-500">ID: {d.hwid.slice(0, 16)}...</div>
              <div className="mt-2 text-xs text-slate-400">
                Последняя активность: {formatDeviceDate(d.updatedAt || d.createdAt)}
              </div>
            </div>
          </div>
          <DeviceActionButton
            loading={removingHwid === d.hwid}
            fullWidth
            label="Отвязать устройство"
            onClick={() => setSelectedDevice(d)}
          />
        </div>
      ))}
    </div>
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
    <div className="card space-y-3">
      <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-surface-800" />
      <div className="h-12 animate-pulse rounded-xl bg-slate-200 dark:bg-surface-800" />
      <div className="h-12 animate-pulse rounded-xl bg-slate-200 dark:bg-surface-800" />
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

function formatDeviceDate(date: string | null | undefined) {
  if (!date) return '—'
  return new Date(date).toLocaleString('ru-RU')
}
