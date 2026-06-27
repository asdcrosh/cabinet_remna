// Компактное подключение подписки: автоопределение устройства, deeplink, QR и инструкции в модалке.

'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  Apple,
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  Laptop,
  Monitor,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'
import { toast } from '@/components/ui/toaster'
import { ConfirmDialog } from './confirm-dialog'

type Device = 'ios' | 'android' | 'macos' | 'windows' | 'desktop'
type AppId = 'happ' | 'v2ray' | 'rabbit-hole'

interface KeysCardProps {
  subscriptionUrl: string
}

interface AppOption {
  id: AppId
  name: string
  subtitle: string
  devices: Device[]
  primaryDevices: Device[]
  icon: typeof Smartphone
  deepLinks: (subscriptionUrl: string) => string[]
  installUrl: string
  steps: string[]
}

const appOptions: AppOption[] = [
  {
    id: 'happ',
    name: 'HAPP',
    subtitle: 'Рекомендуемый вариант',
    devices: ['ios', 'android', 'macos', 'windows', 'desktop'],
    primaryDevices: ['ios', 'android', 'desktop'],
    icon: ShieldCheck,
    deepLinks: () => [],
    installUrl: 'https://happ.su',
    steps: [
      'Установите HAPP на устройство.',
      'Нажмите “Скопировать для HAPP”: ссылка подписки скопируется автоматически.',
      'В HAPP нажмите “Буфер обмена” и подтвердите добавление подписки.',
    ],
  },
  {
    id: 'v2ray',
    name: 'V2Ray',
    subtitle: 'Android / Windows',
    devices: ['android', 'windows', 'desktop'],
    primaryDevices: ['android', 'windows'],
    icon: Smartphone,
    deepLinks: (url) => [
      `v2rayng://install-sub?url=${encodeURIComponent(url)}`,
      `v2rayn://install-sub?url=${encodeURIComponent(url)}`,
      `v2rayng://install-config?url=${encodeURIComponent(url)}`,
    ],
    installUrl: 'https://github.com/2dust/v2rayNG/releases',
    steps: [
      'Установите V2Ray-клиент для вашей системы.',
      'Нажмите “Подключить” или скопируйте ссылку подписки.',
      'Если приложение попросит тип импорта, выберите подписку по URL.',
    ],
  },
  {
    id: 'rabbit-hole',
    name: 'Rabbit Hole',
    subtitle: 'Apple-устройства',
    devices: ['ios', 'macos'],
    primaryDevices: ['macos'],
    icon: Apple,
    deepLinks: (url) => [
      `rabbithole://import?url=${encodeURIComponent(url)}`,
      `rabbit-hole://import?url=${encodeURIComponent(url)}`,
    ],
    installUrl: 'https://apps.apple.com/search?term=Rabbit%20Hole%20VPN',
    steps: [
      'Установите Rabbit Hole из App Store.',
      'Нажмите “Подключить” или отсканируйте QR-код.',
      'После импорта выберите профиль и включите VPN.',
    ],
  },
]

export function KeysCard({ subscriptionUrl }: KeysCardProps) {
  const [device, setDevice] = useState<Device>('desktop')
  const [selectedAppId, setSelectedAppId] = useState<AppId>('happ')
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    const detected = detectDevice(navigator.userAgent)
    setDevice(detected)
    setSelectedAppId(recommendedAppForDevice(detected).id)
  }, [])

  const availableApps = useMemo(() => {
    const filtered = appOptions.filter((option) => option.devices.includes(device))
    return filtered.length > 0 ? filtered : appOptions
  }, [device])

  const selectedApp = appOptions.find((option) => option.id === selectedAppId) ?? appOptions[0]
  const primaryLink = selectedApp.deepLinks(subscriptionUrl)[0] || subscriptionUrl

  async function copy(text: string, label = 'Ссылка') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast(`${label} скопирована`, 'success')
    } catch {
      toast('Не удалось скопировать')
    }
  }

  function openInApp() {
    if (!subscriptionUrl) return
    void copy(subscriptionUrl, 'Ссылка подписки')
    if (selectedApp.id === 'happ') {
      toast('Ссылка скопирована. В HAPP нажмите “Буфер обмена”.', 'success')
      setInstructionsOpen(true)
      return
    } else {
      toast(`Открываем ${selectedApp.name}. Ссылка уже скопирована на случай ручного импорта.`, 'success')
    }
    window.location.href = primaryLink
  }

  async function revoke() {
    setRevoking(true)
    try {
      await apiFetch('/api/subscription/revoke', { method: 'POST' })
      toast('Ссылка обновлена', 'success')
      setTimeout(() => window.location.reload(), 800)
    } catch {
      // apiFetch already shows a toast.
    } finally {
      setRevoking(false)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-surface-900">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">
                <DeviceIcon device={device} />
                {deviceLabel(device)} определено автоматически
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">Подключение</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">
                Выберите приложение, нажмите подключить или используйте QR-код.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={revoking}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.06] sm:shrink-0"
            >
              <RefreshCw className="h-4 w-4" />
              {revoking ? 'Обновляем' : 'Обновить ссылку'}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {availableApps.map((option) => {
              const active = option.id === selectedApp.id
              const Icon = option.icon
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedAppId(option.id)}
                  className={cn(
                    'flex min-h-20 items-center gap-3 rounded-lg border p-3 text-left transition',
                    active
                      ? 'border-slate-950 bg-slate-950 text-white shadow-sm dark:border-cyan-300 dark:bg-cyan-300 dark:text-slate-950'
                      : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'
                  )}
                >
                  <span
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-lg',
                      active ? 'bg-white/15' : 'bg-white text-cyan-700 shadow-sm dark:bg-white/10 dark:text-cyan-200'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{option.name}</span>
                    <span className={cn('mt-0.5 block truncate text-xs', active ? 'text-white/70 dark:text-slate-950/65' : 'text-slate-500')}>
                      {option.subtitle}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <button
              type="button"
              onClick={openInApp}
              disabled={!subscriptionUrl}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              <ExternalLink className="h-4 w-4" />
              {selectedApp.id === 'happ' ? 'Скопировать для HAPP' : `Подключить в ${selectedApp.name}`}
            </button>
            <button
              type="button"
              onClick={() => copy(subscriptionUrl, 'Ссылка подписки')}
              disabled={!subscriptionUrl}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.06]"
            >
              <Copy className="h-4 w-4" />
              Скопировать
            </button>
            <button
              type="button"
              onClick={() => setInstructionsOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.06]"
            >
              <HelpCircle className="h-4 w-4" />
              Инструкция
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 truncate rounded-lg bg-slate-50 px-3 py-2 font-mono dark:bg-white/[0.03]">
              {subscriptionUrl || 'Ссылка подписки пока недоступна'}
            </span>
            <a
              href={selectedApp.installUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-cyan-700 hover:text-cyan-900 dark:text-cyan-200"
            >
              Скачать {selectedApp.name}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <aside className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.025] lg:border-l lg:border-t-0">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="group w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-cyan-200 hover:shadow-md dark:border-white/10 dark:bg-surface-900"
          >
            {subscriptionUrl ? (
              <Image
                src={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`}
                alt="QR-код подписки"
                width={220}
                height={220}
                className="mx-auto h-auto w-full max-w-[180px] rounded-md"
                unoptimized
              />
            ) : (
              <div className="grid aspect-square place-items-center rounded-md border border-dashed text-center text-sm text-slate-400">
                QR появится после выдачи подписки
              </div>
            )}
            <div className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <QrCode className="h-4 w-4 text-cyan-600" />
              Открыть QR
            </div>
          </button>
        </aside>
      </div>

      <InstructionModal
        open={instructionsOpen}
        app={selectedApp}
        subscriptionUrl={subscriptionUrl}
        onClose={() => setInstructionsOpen(false)}
        onCopy={() => copy(subscriptionUrl, 'Ссылка подписки')}
        onOpen={openInApp}
      />
      <QrModal open={qrOpen} subscriptionUrl={subscriptionUrl} onClose={() => setQrOpen(false)} />

      <ConfirmDialog
        open={confirmOpen}
        title="Обновить ссылку подписки?"
        description="Старая ссылка перестанет работать. На подключённых устройствах потребуется добавить новую."
        confirmLabel="Обновить"
        loading={revoking}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          await revoke()
          setConfirmOpen(false)
        }}
      />
    </section>
  )
}

function InstructionModal({
  open,
  app,
  subscriptionUrl,
  onClose,
  onCopy,
  onOpen,
}: {
  open: boolean
  app: AppOption
  subscriptionUrl: string
  onClose: () => void
  onCopy: () => void
  onOpen: () => void
}) {
  useBodyScrollLock(open)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] grid place-items-end bg-slate-950/45 p-0 sm:place-items-center sm:p-4">
      <div className="max-h-[92dvh] w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-surface-950 sm:max-w-lg sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Инструкция</div>
            <h3 className="text-lg font-semibold">{app.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.06]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(92dvh-4rem)] overflow-y-auto p-4">
          <div className="space-y-3">
            {app.steps.map((step, index) => (
              <div key={step} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-white/[0.04]">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-sm font-bold text-cyan-700 shadow-sm dark:bg-white/10 dark:text-cyan-200">
                  {index + 1}
                </div>
                <div className="text-sm font-medium leading-6">{step}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50/70 p-3 text-sm leading-6 text-cyan-950 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-100">
            <div className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Если приложение не открылось автоматически, ссылка уже может быть скопирована. Добавьте её вручную как URL подписки.</span>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onOpen}
              disabled={!subscriptionUrl}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
            >
              <ExternalLink className="h-4 w-4" />
              {app.id === 'happ' ? 'Скопировать для HAPP' : `Открыть ${app.name}`}
            </button>
            <button
              type="button"
              onClick={onCopy}
              disabled={!subscriptionUrl}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/[0.06]"
            >
              <Copy className="h-4 w-4" />
              Скопировать
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function QrModal({ open, subscriptionUrl, onClose }: { open: boolean; subscriptionUrl: string; onClose: () => void }) {
  useBodyScrollLock(open)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/45 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-2xl dark:bg-surface-950">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">QR-код подписки</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.06]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {subscriptionUrl ? (
          <Image
            src={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`}
            alt="QR-код подписки"
            width={320}
            height={320}
            className="mx-auto h-auto w-full rounded-md"
            unoptimized
          />
        ) : (
          <div className="grid aspect-square place-items-center rounded-lg border border-dashed text-center text-sm text-slate-400">
            QR появится после выдачи подписки
          </div>
        )}
      </div>
    </div>
  )
}

function DeviceIcon({ device }: { device: Device }) {
  if (device === 'ios' || device === 'android') return <Smartphone className="h-3.5 w-3.5" />
  if (device === 'macos') return <Laptop className="h-3.5 w-3.5" />
  return <Monitor className="h-3.5 w-3.5" />
}

function detectDevice(userAgent: string): Device {
  const ua = userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos'
  return 'desktop'
}

function recommendedAppForDevice(device: Device) {
  if (device === 'android' || device === 'windows') return appOptions[1]
  if (device === 'macos') return appOptions[2]
  return appOptions[0]
}

function deviceLabel(device: Device) {
  if (device === 'ios') return 'iPhone/iPad'
  if (device === 'android') return 'Android'
  if (device === 'macos') return 'macOS'
  if (device === 'windows') return 'Windows'
  return 'Устройство'
}
