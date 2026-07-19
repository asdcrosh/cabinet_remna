// Компактное подключение подписки: автоопределение устройства, deeplink, QR и инструкции в модалке.

'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import {
  Apple,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  Laptop,
  Monitor,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { Modal } from '@/components/ui/modal'
import { toast } from '@/components/ui/toaster'
import { ConfirmDialog } from './confirm-dialog'

type Device = 'ios' | 'android' | 'macos' | 'windows' | 'desktop'
type AppId = 'happ' | 'v2ray' | 'rabbit-hole'

interface KeysCardProps {
  subscriptionUrl: string
  happLink?: string | null
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
  getOpenLinks?: (input: { subscriptionUrl: string; happLink?: string | null; device: Device }) => string[]
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
    getOpenLinks: ({ subscriptionUrl, happLink }) => buildHappLinks(subscriptionUrl, happLink),
    installUrl: 'https://happ.su',
    steps: [
      'Установите HAPP на устройство.',
      'Нажмите “Подключить в HAPP”. Если приложение не открылось, используйте кнопку копирования.',
      'При ручном добавлении в HAPP нажмите “Буфер обмена” и подтвердите подписку.',
    ],
  },
  {
    id: 'v2ray',
    name: 'V2Ray',
    subtitle: 'Android / Windows',
    devices: ['android', 'windows', 'desktop'],
    primaryDevices: ['android', 'windows'],
    icon: Smartphone,
    deepLinks: () => [],
    getOpenLinks: ({ subscriptionUrl, device }) => buildV2RayLinks(subscriptionUrl, device),
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
const defaultApp = appOptions[0] as AppOption

export function KeysCard({ subscriptionUrl, happLink }: KeysCardProps) {
  const [device, setDevice] = useState<Device>('desktop')
  const [selectedAppId, setSelectedAppId] = useState<AppId>('happ')
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const detected = detectDevice(navigator.userAgent)
    setDevice(detected)
    setSelectedAppId(recommendedAppForDevice(detected).id)
  }, [])

  const availableApps = useMemo(() => orderAppsForDevice(device), [device])

  const selectedApp = appOptions.find((option) => option.id === selectedAppId) ?? defaultApp
  const SelectedAppIcon = selectedApp.icon
  const selectedDeepLinks = selectedApp.getOpenLinks
    ? selectedApp.getOpenLinks({ subscriptionUrl, happLink, device })
    : selectedApp.deepLinks(subscriptionUrl)
  const primaryLink = selectedDeepLinks[0]
  const selectedIsRecommended = selectedApp.id === recommendedAppForDevice(device).id

  async function copy(text: string, label = 'Ссылка') {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
      toast(`${label} скопирована`, 'success')
    } catch {
      toast('Не удалось скопировать')
    }
  }

  function openInApp() {
    if (!subscriptionUrl) return

    if (!primaryLink) {
      void copy(subscriptionUrl, 'Ссылка подписки')
      toast('Ссылка скопирована. Добавьте её в приложение вручную.', 'success')
      setInstructionsOpen(true)
      return
    }

    openExternal(primaryLink, selectedDeepLinks.slice(1), selectedApp.name)
    toast(`Открываем ${selectedApp.name}. Если приложение не открылось, скопируйте ссылку вручную.`, 'success')
    window.setTimeout(() => {
      void navigator.clipboard?.writeText(subscriptionUrl).catch(() => undefined)
    }, 500)
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
    <section id="connection" aria-labelledby="connection-title" className="overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
      <header className="border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-200">Подключение устройства</div>
            <h2 id="connection-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-2xl">Откройте подписку в приложении</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Мы выбрали подходящее приложение. Установите его и нажмите основную кнопку.</p>
          </div>
          <span className="inline-flex w-fit min-w-0 items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">
            <DeviceIcon device={device} />
            <span className="truncate">{deviceLabel(device)}</span>
          </span>
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 p-4 sm:p-5">
          <article className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-400/20 dark:bg-cyan-400/[0.07] sm:p-5">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-cyan-700 shadow-sm dark:bg-white/[0.08] dark:text-cyan-200 dark:shadow-none">
                <SelectedAppIcon className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{selectedApp.name}</h3>
                  <span className="rounded-full bg-cyan-700 px-2 py-0.5 text-[11px] font-semibold text-white dark:bg-cyan-200 dark:text-slate-950">
                    {selectedIsRecommended ? 'Рекомендуем' : 'Выбрано'}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">{selectedApp.subtitle} · {deviceLabel(device)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={openInApp}
              disabled={!subscriptionUrl}
              className="btn-primary mt-4 w-full justify-center"
            >
              <ExternalLink className="h-4 w-4" />
              {`Подключить в ${selectedApp.name}`}
            </button>
            <a
              href={selectedApp.installUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary mt-2 w-full justify-center"
            >
              <Download className="h-4 w-4" />
              Скачать {selectedApp.name}
            </a>

            <div className="mt-3 grid gap-2 rounded-2xl border border-cyan-200/70 bg-white/70 p-3 dark:border-cyan-400/15 dark:bg-white/[0.035] min-[380px]:grid-cols-2">
              <ConnectionStep number="1" text={`Установите ${selectedApp.name}`} />
              <ConnectionStep number="2" text="Откройте подписку" />
            </div>
          </article>

          <section className="mt-3 rounded-2xl border border-slate-200 p-3.5 dark:border-white/[0.08] sm:p-4">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Ручное подключение</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Используйте ссылку или QR-код, если приложение не открылось автоматически.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => copy(subscriptionUrl, 'Ссылка подписки')}
                disabled={!subscriptionUrl}
                className="btn-secondary h-11 px-3 disabled:cursor-not-allowed"
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Скопировано' : 'Копировать ссылку'}
              </button>
              <button
                type="button"
                onClick={() => setQrOpen(true)}
                className="btn-secondary h-11 px-3"
              >
                <QrCode className="h-4 w-4" />
                Показать QR-код
              </button>
            </div>
            <button
              type="button"
              onClick={() => setInstructionsOpen(true)}
              className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-200 dark:hover:bg-cyan-400/10"
            >
              <HelpCircle className="h-4 w-4" />
              Открыть пошаговую инструкцию
            </button>
          </section>

          <details className="group mt-3 rounded-2xl border border-slate-200 dark:border-white/[0.08]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-sm font-semibold text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
              Выбрать другое приложение
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid gap-1 border-t border-slate-100 p-1.5 dark:border-white/[0.08] sm:grid-cols-2">
              {availableApps.filter((option) => option.id !== selectedApp.id).map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={(event) => {
                      setSelectedAppId(option.id)
                      event.currentTarget.closest('details')?.removeAttribute('open')
                    }}
                    className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{option.name}</span>
                      <span className="block truncate text-xs text-slate-500">{option.subtitle}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </details>
        </div>

        <aside className="hidden border-l border-slate-100 bg-slate-50/55 p-5 dark:border-white/10 dark:bg-white/[0.02] lg:flex lg:flex-col lg:justify-center">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="group w-full rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-cyan-300 dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-cyan-400/30"
          >
            {subscriptionUrl ? (
              <Image
                src={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`}
                alt="QR-код подписки"
                width={220}
                height={220}
                className="mx-auto h-auto w-full max-w-[220px] rounded-xl"
                unoptimized
              />
            ) : (
              <div className="grid aspect-square place-items-center rounded-xl border border-dashed text-center text-sm text-slate-400">
                QR появится после выдачи подписки
              </div>
            )}
            <div className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <QrCode className="h-4 w-4 text-cyan-600" />
              Подключить по QR
            </div>
          </button>
          <p className="mt-3 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">Откройте камеру в VPN-приложении на другом устройстве.</p>
        </aside>
      </div>

      <footer className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span>Ссылка подписки приватная. Не отправляйте её другим людям.</span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={revoking}
          className="inline-flex min-h-9 w-fit items-center gap-1.5 font-semibold text-slate-500 hover:text-slate-950 disabled:opacity-60 dark:text-slate-400 dark:hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {revoking ? 'Обновляем' : 'Обновить ссылку'}
        </button>
      </footer>

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

function ConnectionStep({ number, text }: { number: string; text: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-cyan-700 text-xs font-semibold text-white dark:bg-cyan-200 dark:text-slate-950">
        {number}
      </span>
      <span className="min-w-0 text-sm font-medium text-slate-700 dark:text-slate-200">{text}</span>
    </div>
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
  return (
    <Modal
      open={open}
      title={app.name}
      description="Инструкция подключения"
      onClose={onClose}
      footer={(
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpen}
            disabled={!subscriptionUrl}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950"
          >
            <ExternalLink className="h-4 w-4" />
            {`Открыть ${app.name}`}
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
      )}
    >
      <div className="space-y-3">
        {app.steps.map((step, index) => (
          <div key={step} className="flex gap-3 rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]">
            <div className="grid h-8 w-8 shrink-0 place-items-center text-sm font-bold text-cyan-700 dark:text-cyan-200">
              {index + 1}
            </div>
            <div className="text-sm font-medium leading-6">{step}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/70 p-3 text-sm leading-6 text-cyan-950 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-100">
        <div className="flex gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Если приложение не открылось автоматически, ссылка уже может быть скопирована. Добавьте её вручную как URL подписки.</span>
        </div>
      </div>
    </Modal>
  )
}

function QrModal({ open, subscriptionUrl, onClose }: { open: boolean; subscriptionUrl: string; onClose: () => void }) {
  return (
    <Modal open={open} title="QR-код подписки" onClose={onClose}>
      {subscriptionUrl ? (
        <Image
          src={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`}
          alt="QR-код подписки"
          width={320}
          height={320}
          className="mx-auto h-auto w-full max-w-sm rounded-xl"
          unoptimized
        />
      ) : (
        <div className="grid aspect-square place-items-center rounded-xl border border-dashed text-center text-sm text-slate-400">
          QR появится после выдачи подписки
        </div>
      )}
    </Modal>
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

function buildHappLinks(subscriptionUrl: string, happLink?: string | null) {
  const links = [
    `happ://add/${subscriptionUrl}`,
    happLink,
  ].filter((link): link is string => Boolean(link))

  return Array.from(new Set(links))
}

function buildV2RayLinks(subscriptionUrl: string, device: Device) {
  const encodedUrl = encodeURIComponent(subscriptionUrl)
  if (device === 'android') {
    return [
      `v2rayng://install-sub?url=${encodedUrl}`,
      `v2rayng://install-config?url=${encodedUrl}`,
    ]
  }
  if (device === 'windows') {
    return [`v2rayn://install-sub?url=${encodedUrl}`]
  }
  return []
}

function openExternal(url: string, fallbackUrls: string[] = [], appName = 'приложение') {
  const webApp = window.Telegram?.WebApp
  const isMiniApp = isTelegramMiniAppContext()
  if (isMiniApp && webApp?.openLink && /^https?:\/\//i.test(url)) {
    webApp.openLink(url, { try_instant_view: false })
    return
  }

  if (isMiniApp && webApp?.openLink && !/^https?:\/\//i.test(url)) {
    webApp.openLink(buildOpenAppBridgeUrl(url, fallbackUrls[0], appName), { try_instant_view: false })
    return
  }

  if (!/^https?:\/\//i.test(url)) {
    window.location.assign(url)
  }

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.rel = 'noreferrer'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  fallbackUrls.forEach((fallbackUrl, index) => {
    window.setTimeout(() => {
      if (!/^https?:\/\//i.test(fallbackUrl)) {
        window.location.assign(fallbackUrl)
        return
      }
      const fallbackAnchor = document.createElement('a')
      fallbackAnchor.href = fallbackUrl
      fallbackAnchor.rel = 'noreferrer'
      fallbackAnchor.style.display = 'none'
      document.body.appendChild(fallbackAnchor)
      fallbackAnchor.click()
      fallbackAnchor.remove()
    }, 700 + index * 700)
  })
}

function isTelegramMiniAppContext() {
  const initData = window.Telegram?.WebApp?.initData
  if (initData) return true
  const hash = window.location.hash || ''
  const search = window.location.search || ''
  return hash.includes('tgWebAppData=') || search.includes('tgWebAppData=')
}

function buildOpenAppBridgeUrl(url: string, fallbackUrl: string | undefined, appName: string) {
  const bridgeUrl = new URL('/open-app', window.location.origin)
  bridgeUrl.searchParams.set('url', url)
  bridgeUrl.searchParams.set('app', appName)
  if (fallbackUrl) bridgeUrl.searchParams.set('fallback', fallbackUrl)
  return bridgeUrl.toString()
}

function recommendedAppForDevice(device: Device) {
  if (device === 'android' || device === 'windows') return appOptions[1] ?? defaultApp
  if (device === 'macos') return appOptions[2] ?? defaultApp
  return defaultApp
}

function orderAppsForDevice(device: Device) {
  return [...appOptions].sort((a, b) => {
    const aScore = appScore(a, device)
    const bScore = appScore(b, device)
    if (aScore !== bScore) return bScore - aScore
    return appOptions.indexOf(a) - appOptions.indexOf(b)
  })
}

function appScore(app: AppOption, device: Device) {
  if (app.primaryDevices.includes(device)) return 2
  if (app.devices.includes(device)) return 1
  return 0
}

function deviceLabel(device: Device) {
  if (device === 'ios') return 'iPhone/iPad'
  if (device === 'android') return 'Android'
  if (device === 'macos') return 'macOS'
  if (device === 'windows') return 'Windows'
  return 'Устройство'
}
