// Компактное подключение подписки: автоопределение устройства, deeplink, QR и инструкции в модалке.

'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Apple,
  CheckCircle2,
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/cn'
import { VpnConnectionCheck } from './vpn-connection-check'

type Device = 'ios' | 'android' | 'macos' | 'windows' | 'desktop'
type AppId = 'incy' | 'happ' | 'rabbit-hole'

interface KeysCardProps {
  subscriptionUrl: string
  happLink?: string | null
  onboarding?: boolean
  supportEnabled?: boolean
}

interface AppOption {
  id: AppId
  name: string
  subtitle: string
  devices: Device[]
  primaryDevices: Device[]
  icon: typeof Smartphone
  deepLinks: (subscriptionUrl: string) => string[]
  installUrl: string | ((device: Device) => string)
  steps: string[]
  getOpenLinks?: (input: { subscriptionUrl: string; happLink?: string | null; device: Device }) => string[]
}

const appOptions: AppOption[] = [
  {
    id: 'incy',
    name: 'INCY',
    subtitle: 'Основное приложение для подключения',
    devices: ['ios', 'android', 'macos'],
    primaryDevices: ['ios', 'android', 'macos'],
    icon: ShieldCheck,
    deepLinks: (subscriptionUrl) => [`incy://import/${subscriptionUrl}`],
    installUrl: (device) => device === 'android'
      ? 'https://play.google.com/store/apps/details?id=llc.itdev.incy'
      : 'https://apps.apple.com/app/incy/id6756943388',
    steps: [
      'Установите INCY из App Store или Google Play.',
      'Вернитесь в кабинет и нажмите “Открыть в INCY”.',
      'Подтвердите импорт подписки, выберите сервер и включите VPN.',
    ],
  },
  {
    id: 'happ',
    name: 'HAPP',
    subtitle: 'Запасной вариант',
    devices: ['ios', 'android', 'macos', 'windows', 'desktop'],
    primaryDevices: ['windows', 'desktop'],
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

export function KeysCard({
  subscriptionUrl,
  happLink,
  onboarding = false,
  supportEnabled = false,
}: KeysCardProps) {
  const router = useRouter()
  const [device, setDevice] = useState<Device>('desktop')
  const [selectedAppId, setSelectedAppId] = useState<AppId>('incy')
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
  const compatibleApps = useMemo(
    () => availableApps.filter((option) => option.devices.includes(device)),
    [availableApps, device]
  )

  const selectedApp = appOptions.find((option) => option.id === selectedAppId) ?? defaultApp
  const SelectedAppIcon = selectedApp.icon
  const selectedDeepLinks = selectedApp.getOpenLinks
    ? selectedApp.getOpenLinks({ subscriptionUrl, happLink, device })
    : selectedApp.deepLinks(subscriptionUrl)
  const primaryLink = selectedDeepLinks[0]
  const selectedIsRecommended = selectedApp.id === recommendedAppForDevice(device).id
  const selectedInstallUrl = typeof selectedApp.installUrl === 'function'
    ? selectedApp.installUrl(device)
    : selectedApp.installUrl

  function selectDevice(nextDevice: Device) {
    setDevice(nextDevice)
    setSelectedAppId(recommendedAppForDevice(nextDevice).id)
  }

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

  function finishFirstConnection() {
    router.refresh()
  }

  return (
    <section
      id="connection"
      aria-labelledby="connection-title"
      className="connection-panel overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"
    >
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-white/10 sm:p-5">
        <div className="min-w-0">
          <h2 id="connection-title" className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
            {onboarding ? 'Подключите первое устройство' : 'Подключить ещё устройство'}
          </h2>
          <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
            {onboarding
              ? 'Три коротких шага. После проверки откроется управление устройствами.'
              : 'Откройте подписку на новом устройстве. Текущие подключения сохранятся.'}
          </p>
        </div>
        <label className="connection-device-picker">
          <span className="connection-device-picker__label">Устройство</span>
          <span className="connection-device-picker__control">
            <DeviceIcon device={device} />
            <select
              aria-label="Устройство для подключения"
              value={device}
              onChange={(event) => selectDevice(event.target.value as Device)}
            >
              <option value="macos">macOS</option>
              <option value="ios">iPhone / iPad</option>
              <option value="android">Android</option>
              <option value="windows">Windows</option>
              <option value="desktop">Другой компьютер</option>
            </select>
          </span>
        </label>
      </header>

      <div className="p-4 sm:p-5">
        {onboarding ? (
          <div className="connection-first-run">
            <div className="connection-first-run__step">
              <span className="connection-first-run__number">1</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Установите {selectedApp.name}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {selectedIsRecommended
                    ? `Приложение подходит для ${deviceLabel(device)}.`
                    : `Рекомендуемое приложение для ${deviceLabel(device)}.`}
                </p>
              </div>
              <a
                href={selectedInstallUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary connection-first-run__action"
              >
                <Download className="h-4 w-4" />
                Установить
              </a>
            </div>

            <div className="connection-first-run__step">
              <span className="connection-first-run__number">2</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Откройте подписку</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Добавьте доступ в приложение одним нажатием.
                </p>
              </div>
              <button
                type="button"
                onClick={openInApp}
                disabled={!subscriptionUrl}
                className="btn-primary connection-first-run__action"
              >
                <ExternalLink className="h-4 w-4" />
                Открыть
              </button>
            </div>

            <div className="connection-first-run__step connection-first-run__step--check">
              <span className="connection-first-run__number">3</span>
              <VpnConnectionCheck supportEnabled={supportEnabled} onVerified={finishFirstConnection} />
            </div>
          </div>
        ) : (
          <div className="connection-connect">
            <div className="connection-connect__hero">
              <div className="connection-connect__app">
                <span className="connection-connect__icon">
                  <SelectedAppIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-950 dark:text-white">{selectedApp.name}</h3>
                    {selectedIsRecommended && <span className="connection-connect__badge">Рекомендуем</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Для {deviceLabel(device)}. Текущие устройства останутся подключёнными.
                  </p>
                </div>
              </div>

              <div className="connection-connect__actions">
                <button type="button" onClick={openInApp} disabled={!subscriptionUrl} className="btn-primary justify-center">
                  <ExternalLink className="h-4 w-4" />
                  Подключить в {selectedApp.name}
                </button>
                <a href={selectedInstallUrl} target="_blank" rel="noreferrer" className="btn-secondary justify-center">
                  <Download className="h-4 w-4" />
                  {installButtonLabel(selectedApp, device)}
                </a>
              </div>
            </div>

            <ol className="connection-connect__steps" aria-label="Шаги подключения">
              <li><span>1</span><div><strong>Установите</strong><small>{selectedApp.name}</small></div></li>
              <li><span>2</span><div><strong>Добавьте доступ</strong><small>Одним нажатием</small></div></li>
              <li><span>3</span><div><strong>Включите VPN</strong><small>Готово к работе</small></div></li>
            </ol>

            <div className="connection-connect__tools" aria-label="Другие способы подключения">
              <button type="button" onClick={() => copy(subscriptionUrl, 'Ссылка подписки')} disabled={!subscriptionUrl}>
                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
              </button>
              <button type="button" onClick={() => setQrOpen(true)}>
                <QrCode className="h-4 w-4" />
                Показать QR-код
              </button>
              <button type="button" onClick={() => setInstructionsOpen(true)}>
                <HelpCircle className="h-4 w-4" />
                Открыть инструкцию
              </button>
            </div>

            {compatibleApps.length > 1 && (
              <details className="connection-alternatives connection-connect__alternatives">
                <summary>Выбрать другое приложение</summary>
                <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Приложение для подключения">
                  {compatibleApps.map((option) => (
                    <AppChoice
                      key={option.id}
                      option={option}
                      selected={option.id === selectedApp.id}
                      onSelect={() => setSelectedAppId(option.id)}
                    />
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {!onboarding && <footer className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span>Ссылка приватная. Не пересылайте её другим людям.</span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={revoking}
          className="inline-flex min-h-8 w-fit items-center gap-1.5 font-semibold text-slate-500 hover:text-slate-950 disabled:opacity-60 dark:text-slate-400 dark:hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {revoking ? 'Обновляем' : 'Сменить ссылку'}
        </button>
      </footer>}

      {!onboarding && <InstructionModal
        open={instructionsOpen}
        app={selectedApp}
        subscriptionUrl={subscriptionUrl}
        onClose={() => setInstructionsOpen(false)}
        onCopy={() => copy(subscriptionUrl, 'Ссылка подписки')}
        onOpen={openInApp}
      />}
      {!onboarding && <QrModal open={qrOpen} subscriptionUrl={subscriptionUrl} onClose={() => setQrOpen(false)} />}

      {!onboarding && <ConfirmDialog
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
      />}
    </section>
  )
}

function AppChoice({ option, selected, onSelect }: { option: AppOption; selected: boolean; onSelect: () => void }) {
  const Icon = option.icon
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'connection-app-choice flex min-h-14 min-w-0 items-center gap-2.5 rounded-xl border px-3 text-left transition',
        selected
          ? 'connection-app-choice--selected text-slate-950 dark:text-white'
          : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-white/10 dark:text-slate-400 dark:hover:text-white'
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', selected && 'text-brand-600 dark:text-brand-300')} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{option.name}</span>
        <span className="block truncate text-[11px] opacity-70">{option.subtitle}</span>
      </span>
    </button>
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
  if (device === 'windows' || device === 'desktop') return appOptions[1] ?? defaultApp
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

function installButtonLabel(app: AppOption, device: Device) {
  if (app.id !== 'incy') return 'Установить приложение'
  if (device === 'android') return 'Скачать в Google Play'
  if (device === 'ios') return 'Скачать в App Store'
  if (device === 'macos') return 'Скачать для macOS'
  return 'Установить INCY'
}
