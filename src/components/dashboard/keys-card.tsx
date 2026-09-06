// Пошаговое подключение VPN с дополнительными способами по запросу.

'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  HelpCircle,
  QrCode,
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
type AppId = 'incy' | 'happ'

interface KeysCardProps {
  subscriptionUrl: string
  happLink?: string | null
  supportEnabled?: boolean
  deviceLimit?: number | null
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
      'Вернитесь в кабинет, нажмите «Уже установлено», затем «Добавить в INCY».',
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
      'На втором шаге нажмите «Добавить в HAPP». Если приложение не открылось, скопируйте ссылку.',
      'При ручном добавлении в HAPP нажмите “Буфер обмена” и подтвердите подписку.',
    ],
  },
]
const defaultApp = appOptions[0] as AppOption

export function KeysCard({
  subscriptionUrl,
  happLink,
  supportEnabled = false,
  deviceLimit,
}: KeysCardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [installOpened, setInstallOpened] = useState(false)
  const [ready, setReady] = useState(false)
  const [device, setDevice] = useState<Device>('desktop')
  const [selectedAppId, setSelectedAppId] = useState<AppId>('incy')
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const detected = detectDevice(navigator.userAgent)
    setReady(true)
    setDevice(detected)
    setSelectedAppId(recommendedAppForDevice(detected).id)
  }, [])

  const availableApps = useMemo(() => orderAppsForDevice(device), [device])
  const compatibleApps = useMemo(
    () => availableApps.filter((option) => option.devices.includes(device)),
    [availableApps, device]
  )

  const selectedApp = appOptions.find((option) => option.id === selectedAppId) ?? defaultApp
  const selectedDeepLinks = selectedApp.getOpenLinks
    ? selectedApp.getOpenLinks({ subscriptionUrl, happLink, device })
    : selectedApp.deepLinks(subscriptionUrl)
  const primaryLink = selectedDeepLinks[0]
  const selectedInstallUrl = typeof selectedApp.installUrl === 'function'
    ? selectedApp.installUrl(device)
    : selectedApp.installUrl

  function selectDevice(nextDevice: Device) {
    setStep(1)
    setInstallOpened(false)
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
      // The copy helper reports success only after clipboard access succeeds.
      setInstructionsOpen(true)
      return
    }

    setStep(3)
    openExternal(primaryLink, selectedDeepLinks.slice(1), selectedApp.name)
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
    <section
      id="connection"
      aria-labelledby="connection-title"
      className="connection-panel overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]"
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>Шаг {step} из 3</span>
          <span>{ready ? deviceLabel(device) : 'Определяем устройство…'}</span>
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((value) => (
            <span key={value} className={cn('h-1 flex-1 rounded-full', value <= step ? 'bg-brand-500' : 'bg-slate-200 dark:bg-white/10')} />
          ))}
        </div>

        <div className="mt-6" aria-live="polite">
          <h2 id="connection-title" className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
            {step === 1 ? `Установите ${selectedApp.name}` : step === 2 ? 'Добавьте настройку VPN' : 'Включите VPN в приложении'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {step === 1
              ? 'Это приложение для работы VPN. После установки вернитесь на эту страницу.'
              : step === 2
                ? `Кнопка откроет ${selectedApp.name}. Разрешите открытие приложения и подтвердите добавление подписки.`
                : `В ${selectedApp.name} подтвердите добавление, выберите сервер и нажмите кнопку включения. Разрешите VPN-подключение, если устройство спросит.`}
          </p>
        </div>

        {step === 1 && (
          <div className="mt-6 space-y-3">
            {installOpened ? (
              <>
                <button type="button" className="btn-primary min-h-12 w-full justify-center" onClick={() => setStep(2)}>
                  Установлено. Продолжить
                </button>
                <a href={selectedInstallUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center text-sm text-slate-500 hover:underline dark:text-slate-400">
                  Открыть страницу установки ещё раз
                </a>
              </>
            ) : (
              <>
                <a
                  href={ready ? selectedInstallUrl : undefined}
                  aria-disabled={!ready}
                  onClick={(event) => {
                    if (!ready) { event.preventDefault(); return }
                    setInstallOpened(true)
                  }}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary min-h-12 w-full justify-center"
                >
                  <Download className="h-4 w-4" />
                  {ready ? `Установить ${selectedApp.name}` : 'Подождите…'}
                </a>
                <button type="button" disabled={!ready} className="min-h-11 w-full text-sm font-medium text-slate-600 disabled:opacity-50 dark:text-slate-300" onClick={() => setStep(2)}>
                  Уже установлено
                </button>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <button type="button" onClick={openInApp} disabled={!subscriptionUrl || !ready} className="btn-primary mt-6 min-h-12 w-full justify-center">
            <ExternalLink className="h-4 w-4" />
            Добавить в {selectedApp.name}
          </button>
        )}

        {step === 3 && (
          <div className="mt-6">
            <VpnConnectionCheck supportEnabled={supportEnabled} deviceLimit={deviceLimit} onReconnect={() => setStep(2)} simple />
          </div>
        )}

        {step > 1 && (
          <button type="button" className="mt-3 min-h-11 w-full text-sm text-slate-500 dark:text-slate-400" onClick={() => setStep(step === 3 ? 2 : 1)}>
            {step === 3 ? 'Вернуться к добавлению' : 'Назад к установке'}
          </button>
        )}

        <details className="mt-5 border-t border-slate-200 pt-4 dark:border-white/10" key={step}>
          <summary className="cursor-pointer py-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            {step === 1 ? 'Не подходит приложение?' : 'Не получается?'}
          </summary>
          <div className="mt-3 space-y-4">
            <label className="block text-sm text-slate-600 dark:text-slate-300">
              Система устройства
              <select className="input mt-2 w-full" value={device} onChange={(event) => selectDevice(event.target.value as Device)}>
                <option value="ios">iPhone / iPad</option>
                <option value="android">Android</option>
                <option value="macos">macOS</option>
                <option value="windows">Windows</option>
                <option value="desktop">Linux / другой компьютер</option>
              </select>
            </label>
            {compatibleApps.length > 1 && (
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Приложение для подключения">
                {compatibleApps.map((option) => (
                  <AppChoice key={option.id} option={option} selected={option.id === selectedApp.id} onSelect={() => {
                    setSelectedAppId(option.id)
                    setStep(1)
                    setInstallOpened(false)
                  }} />
                ))}
              </div>
            )}
            <div className="grid gap-2">
              <button type="button" className="btn-secondary justify-center" onClick={() => setInstructionsOpen(true)}>
                <HelpCircle className="h-4 w-4" /> Инструкция для {selectedApp.name}
              </button>
              <button type="button" className="btn-secondary justify-center" onClick={() => copy(subscriptionUrl, 'Ссылка подписки')} disabled={!subscriptionUrl}>
                <Copy className="h-4 w-4" /> {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
              </button>
              <button type="button" className="btn-secondary justify-center" onClick={() => setQrOpen(true)} disabled={!subscriptionUrl}>
                <QrCode className="h-4 w-4" /> QR-код для приложения
              </button>
            </div>
            <p className="text-xs leading-5 text-slate-500">Ссылка даёт доступ к вашему VPN. Не отправляйте её другим людям.</p>
            <button type="button" onClick={() => setConfirmOpen(true)} disabled={revoking} className="min-h-11 text-xs text-slate-500 hover:underline">
              {revoking ? 'Обновляем…' : 'Сменить ссылку доступа'}
            </button>
            {supportEnabled && <Link href="/dashboard/support" className="block py-2 text-sm font-medium underline">Написать в поддержку</Link>}
          </div>
        </details>
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
        <span className="block truncate text-xs opacity-70">{option.subtitle}</span>
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
          <span>Если приложение не открылось, нажмите «Скопировать», затем добавьте ссылку в приложении как подписку.</span>
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
  return 'Linux / другой компьютер'
}
