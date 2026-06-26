// Карточка подключения: единая ссылка подписки, QR-код и инструкции по устройствам.

'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import {
  Apple,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Laptop,
  Link2,
  Monitor,
  QrCode,
  RefreshCw,
  Smartphone,
} from 'lucide-react'
import { ConfirmDialog } from './confirm-dialog'

type Platform = 'ios' | 'android' | 'macos' | 'windows'

interface KeysCardProps {
  subscriptionUrl: string
}

const platformCards: Array<{
  id: Platform
  title: string
  label: string
  app: string
  icon: typeof Smartphone
  steps: string[]
}> = [
  {
    id: 'ios',
    title: 'iPhone / iPad',
    label: 'iOS',
    app: 'Happ',
    icon: Apple,
    steps: ['Установите Happ', 'Нажмите “Подключить” или отсканируйте QR', 'Разрешите добавление подписки'],
  },
  {
    id: 'android',
    title: 'Android',
    label: 'Android',
    app: 'Hiddify или v2rayNG',
    icon: Smartphone,
    steps: ['Установите приложение', 'Нажмите “Подключить” или вставьте ссылку', 'Обновите список серверов'],
  },
  {
    id: 'windows',
    title: 'Windows',
    label: 'Windows',
    app: 'Hiddify Desktop',
    icon: Monitor,
    steps: ['Откройте Hiddify Desktop', 'Скопируйте ссылку подписки', 'Добавьте профиль через Import from URL'],
  },
  {
    id: 'macos',
    title: 'macOS',
    label: 'macOS',
    app: 'Hiddify Desktop',
    icon: Laptop,
    steps: ['Откройте Hiddify Desktop', 'Нажмите “Подключить” или вставьте ссылку', 'Выберите сервер и включите VPN'],
  },
]

export function KeysCard({ subscriptionUrl }: KeysCardProps) {
  const [revoking, setRevoking] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>('ios')
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('ios')

  useEffect(() => {
    const platform = detectPlatform(navigator.userAgent)
    setDetectedPlatform(platform)
    setSelectedPlatform(platform)
  }, [])

  const selected = platformCards.find((item) => item.id === selectedPlatform) ?? platformCards[0]
  const appLinks = useMemo(() => buildAppLinks(subscriptionUrl), [subscriptionUrl])
  const canOpenDirectly = Boolean(subscriptionUrl)

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${label} скопировано`, 'success')
    } catch {
      toast('Не удалось скопировать')
    }
  }

  function openInApp() {
    if (!subscriptionUrl) return
    toast('Открываем приложение. Если оно не открылось, скопируйте ссылку.', 'success')
    window.location.href = selectedPlatform === 'ios' ? appLinks.happ : appLinks.hiddify
  }

  async function revoke() {
    setRevoking(true)
    try {
      await apiFetch('/api/subscription/revoke', { method: 'POST' })
      toast('Ссылка обновлена', 'success')
      setTimeout(() => window.location.reload(), 800)
    } catch {
      // toaster покажет ошибку
    } finally {
      setRevoking(false)
    }
  }

  return (
    <section className="card overflow-hidden p-0">
      <div className="border-b border-slate-100 bg-white dark:border-white/10 dark:bg-surface-900">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">
                <Link2 className="h-5 w-5" />
              </span>
              Подключение устройства
            </h2>
            <p className="mt-1 text-sm text-slate-500">Выберите устройство, откройте приложение или отсканируйте QR.</p>
          </div>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={revoking}
            className="btn-secondary min-h-10 text-sm text-red-600 sm:shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
            {revoking ? 'Обновляем...' : 'Обновить ссылку'}
          </button>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {platformCards.map((platform) => {
              const Icon = platform.icon
              const active = platform.id === selectedPlatform
              const detected = platform.id === detectedPlatform
              return (
                <button
                  key={platform.id}
                  type="button"
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    active
                      ? 'border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/15 dark:border-cyan-300 dark:bg-cyan-300 dark:text-slate-950'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Icon className="h-5 w-5" />
                    {detected && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          active
                            ? 'bg-white/15 text-current dark:bg-slate-950/10'
                            : 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200'
                        }`}
                      >
                        ваше
                      </span>
                    )}
                  </div>
                  <div className="mt-3 font-semibold">{platform.label}</div>
                  <div className={`mt-1 text-xs ${active ? 'text-current/70' : 'text-slate-500'}`}>{platform.app}</div>
                </button>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="text-xs font-semibold uppercase text-slate-400">Рекомендуемый способ</div>
              <h3 className="mt-2 text-2xl font-semibold">{selected.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Для этого устройства лучше использовать {selected.app}. Если кнопка не откроет приложение, используйте QR или ссылку.
              </p>

              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={openInApp}
                  disabled={!canOpenDirectly}
                  className="btn-primary min-h-11 w-full justify-center"
                >
                  <ExternalLink className="h-4 w-4" />
                  Подключить
                </button>
                <button
                  type="button"
                  onClick={() => copy(subscriptionUrl, 'Ссылка подписки')}
                  disabled={!subscriptionUrl}
                  className="btn-secondary min-h-11 w-full justify-center"
                >
                  <Copy className="h-4 w-4" />
                  Скопировать ссылку подписки
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-surface-950">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-white/10">
                  <Link2 className="h-4 w-4" />
                  Ссылка подписки
                </div>
                <div className="truncate px-3 py-2 font-mono text-xs text-slate-500">{subscriptionUrl || 'Ссылка пока недоступна'}</div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-400">Инструкция</div>
                  <h3 className="mt-1 text-lg font-semibold">{selected.title}</h3>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                  3 шага
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {selected.steps.map((step, index) => (
                  <div key={step} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-white/[0.03]">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-sm font-bold text-cyan-700 shadow-sm dark:bg-white/10 dark:text-cyan-200">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{step}</div>
                      {index === 1 && (
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          На телефоне удобнее QR, на компьютере быстрее скопировать ссылку.
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50/70 p-3 text-sm text-cyan-950 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-100">
                <div className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>После добавления подписки выберите любой доступный сервер и включите VPN.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.025] sm:p-5 xl:border-l xl:border-t-0">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-surface-900">
            {subscriptionUrl ? (
              <Image
                src={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`}
                alt="QR-код подписки"
                width={300}
                height={300}
                className="mx-auto h-auto w-full max-w-[260px]"
                unoptimized
              />
            ) : (
              <div className="grid aspect-square place-items-center rounded-lg border border-dashed text-center text-sm text-slate-400">
                QR появится после выдачи подписки
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => copy(subscriptionUrl, 'Ссылка подписки')}
              disabled={!subscriptionUrl}
              className="btn-secondary min-h-10 justify-center px-3 text-xs"
            >
              <Copy className="h-4 w-4" />
              Ссылка
            </button>
            {subscriptionUrl && (
              <a
                href={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`}
                download="vpn-subscription.png"
                className="btn-secondary min-h-10 justify-center px-3 text-xs"
              >
                <Download className="h-4 w-4" />
                QR
              </a>
            )}
          </div>

          <div className="mt-4 space-y-2">
            <QuickLink title="Happ" href={appLinks.happ} />
            <QuickLink title="Hiddify" href={appLinks.hiddify} />
            <QuickLink title="v2rayNG" href={appLinks.v2rayng} />
          </div>

          <div className="mt-4 rounded-lg bg-white p-3 text-xs leading-5 text-slate-500 shadow-sm dark:bg-white/[0.03]">
            QR и ссылка ведут к одной подписке. Если вы обновите ссылку, её нужно добавить заново на всех устройствах.
          </div>
        </aside>
      </div>

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

function QuickLink({ title, href }: { title: string; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
    >
      <span>{title}</span>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </a>
  )
}

function detectPlatform(userAgent: string): Platform {
  const ua = userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos'
  return 'ios'
}

function buildAppLinks(subscriptionUrl: string) {
  const encoded = encodeURIComponent(subscriptionUrl)
  return {
    happ: `happ://install-sub?url=${encoded}`,
    hiddify: `hiddify://install-sub?url=${encoded}`,
    v2rayng: `v2rayng://install-config?url=${encoded}`,
  }
}
