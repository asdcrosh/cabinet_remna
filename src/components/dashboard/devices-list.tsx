'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CircleAlert, Laptop, Monitor, Pencil, RefreshCw, Smartphone, Tablet } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { InlineAlert } from './empty-state'
import { cn } from '@/lib/cn'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatDeviceClientName } from '@/lib/device-client'

interface Device {
  hwid: string
  displayName?: string | null
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
}

export function DevicesList({ embedded = false, deviceLimit }: DevicesListProps = {}) {
  const [devices, setDevices] = useState<Device[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  const loadDevices = useCallback(async () => {
    setLoadError(null)
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

  function openRename(device: Device) {
    setRenameError(null)
    setEditingDevice(device)
    setRenameDraft(device.displayName ?? '')
  }

  async function renameDevice() {
    if (!editingDevice) return
    const displayName = renameDraft.trim()
    if (!displayName || displayName.length > 40) {
      setRenameError('Название должно содержать от 1 до 40 символов')
      return
    }
    setRenaming(true)
    setRenameError(null)
    try {
      await apiFetch(`/api/devices/${encodeURIComponent(editingDevice.hwid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName }),
      })
      setDevices((current) => current?.map((device) => (
        device.hwid === editingDevice.hwid ? { ...device, displayName } : device
      )) ?? [])
      setEditingDevice(null)
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : 'Не удалось переименовать устройство')
    } finally {
      setRenaming(false)
    }
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
        <section id="connected-devices" aria-labelledby="connected-devices-title" className="device-panel device-panel--embedded overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="border-b border-slate-200 p-4 dark:border-white/10">
            <h2 id="connected-devices-title" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Устройства</h2>
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
      <section id="connected-devices" aria-labelledby="connected-devices-title" className="device-panel overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5">
          <h2 id="connected-devices-title" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Проверьте подключение</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">После первого запуска VPN устройство появится здесь автоматически.</p>
        </div>
        <div className="px-4 py-8 text-center sm:px-5 sm:py-10">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-300">
            <Smartphone className="h-6 w-6" />
          </span>
          <div className="mt-4 font-semibold text-slate-950 dark:text-white">Устройств пока нет</div>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">Вернитесь к подключению, добавьте подписку в приложение и включите VPN.</p>
          <Link href="#add-device-guide" className="btn-secondary mt-5 w-full sm:w-auto">Как подключить устройство</Link>
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
        {loadError && (
          <InlineAlert
            tone="danger"
            title="Не удалось обновить список"
            description={loadError}
          />
        )}
        <section id="connected-devices" aria-labelledby="connected-devices-title" className="device-panel device-panel--embedded overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="connected-devices-title" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Устройства</h2>
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
            {devices.length === 0 && (
              <div className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">Активных устройств нет.</div>
            )}
            {devices.slice(0, 3).map((device) => (
              <CompactDeviceRow
                key={device.hwid}
                device={device}
                onRename={() => openRename(device)}
              />
            ))}
            {devices.length > 3 && (
              <Link
                href="/dashboard/devices"
                className="flex min-h-11 items-center justify-between px-4 py-3 text-sm font-medium text-cyan-700 transition hover:bg-slate-50 dark:text-cyan-300 dark:hover:bg-white/[0.04]"
              >
                <span>Ещё {devices.length - 3}</span>
                <span>Все устройства</span>
              </Link>
            )}
          </div>
          <div className="device-list-actions">
            <Link href="/dashboard/devices#add-device-guide" className="btn-secondary device-list-actions__add">
              Как подключить другое устройство
            </Link>
            <Link href="/dashboard/devices" className="text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300">
              Управлять устройствами
            </Link>
          </div>
        </section>
        <DeviceRenameDialog
          device={editingDevice}
          value={renameDraft}
          loading={renaming}
          error={renameError}
          onChange={setRenameDraft}
          onClose={() => !renaming && setEditingDevice(null)}
          onSave={() => void renameDevice()}
        />
      </>
    )
  }

  return (
    <>
      {loadError && (
        <InlineAlert
          tone="danger"
          title="Не удалось обновить список"
          description={loadError}
        />
      )}
      <section id="connected-devices" aria-labelledby="connected-devices-title" className="device-panel overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
        <div className="border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="connected-devices-title" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Ваши устройства</h2>
                <span className="device-count-chip rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/[0.07] dark:text-slate-300">
                  {devicesValue}
                </span>
              </div>
              {limitState.tone !== 'neutral' ? <DeviceLimitNotice state={limitState} /> : null}
            </div>
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-950 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              onClick={() => void loadDevices()}
              disabled={refreshing}
              aria-label="Обновить устройства"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-white/10">
          {devices.length === 0 && (
            <div className="px-4 py-5 text-sm text-slate-500 dark:text-slate-400">Активных устройств нет.</div>
          )}
          {devices.map((device) => (
            <CompactDeviceRow
              key={device.hwid}
              device={device}
              onRename={() => openRename(device)}
            />
          ))}
        </div>
      </section>
      <DeviceRenameDialog
        device={editingDevice}
        value={renameDraft}
        loading={renaming}
        error={renameError}
        onChange={setRenameDraft}
        onClose={() => !renaming && setEditingDevice(null)}
        onSave={() => void renameDevice()}
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

function CompactDeviceRow({
  device,
  onRename,
}: {
  device: Device
  onRename: () => void
}) {
  const activity = getActivityState(device.updatedAt || device.createdAt)
  const Icon = getDeviceIcon(device)
  const clientName = formatDeviceClientName(device.userAgent)

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
          <span className="truncate">{activity.label}{clientName ? ` · ${clientName}` : ''}</span>
        </div>
      </div>
      <button
        type="button"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
        onClick={onRename}
        aria-label={`Переименовать ${getDeviceTitle(device)}`}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </article>
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
  if (device.displayName) return device.displayName
  return device.deviceModel || device.platform || 'Неизвестное устройство'
}

function DeviceRenameDialog({
  device,
  value,
  loading,
  error,
  onChange,
  onClose,
  onSave,
}: {
  device: Device | null
  value: string
  loading: boolean
  error: string | null
  onChange: (value: string) => void
  onClose: () => void
  onSave: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  return (
    <Modal
      open={Boolean(device)}
      title="Название устройства"
      description="Например: iPhone Артёма или Рабочий ноутбук"
      variant="sheet"
      panelClassName="sm:max-w-md"
      initialFocusRef={inputRef}
      onClose={onClose}
      footer={(
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button variant="secondary" disabled={loading} onClick={onClose}>Отмена</Button>
          <Button disabled={loading || !value.trim() || value.trim().length > 40} onClick={onSave}>
            {loading ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      )}
    >
      <Input
        ref={inputRef}
        value={value}
        maxLength={40}
        placeholder="Введите название"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim() && !loading) onSave()
        }}
      />
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-300">{error}</p> : null}
      <div className="mt-2 text-right text-xs text-slate-400">{value.length}/40</div>
    </Modal>
  )
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

export function getDeviceLimitState(used: number, limit?: number | null): DeviceLimitState {
  if (!limit || limit < 1) return { tone: 'neutral', text: 'Без ограничений' }

  const remaining = limit - used
  if (remaining < 0) return { tone: 'danger', text: `Лимит превышен на ${Math.abs(remaining)}. Увеличьте число устройств в тарифе.` }
  if (remaining === 0) return { tone: 'danger', text: 'Лимит достигнут. Для нового устройства увеличьте лимит в тарифе.' }
  if (remaining === 1) return { tone: 'warning', text: 'Осталось 1 место' }
  return { tone: 'neutral', text: `Свободно: ${remaining}` }
}
