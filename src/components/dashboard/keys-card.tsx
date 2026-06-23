// Карточка подключения: единая ссылка подписки и QR-код.

'use client'

import { useState } from 'react'
import Image from 'next/image'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { Copy, Download, Link2, QrCode, RefreshCw, Smartphone } from 'lucide-react'
import { ConfirmDialog } from './confirm-dialog'

interface KeysCardProps {
  subscriptionUrl: string
}

export function KeysCard({ subscriptionUrl }: KeysCardProps) {
  const [revoking, setRevoking] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${label} скопировано`, 'success')
    } catch {
      toast('Не удалось скопировать')
    }
  }

  async function revoke() {
    setRevoking(true)
    try {
      await apiFetch('/api/subscription/revoke', { method: 'POST' })
      toast('Ссылка обновлена', 'success')
      // Простой способ: рефреш
      setTimeout(() => window.location.reload(), 800)
    } catch {
      // toaster покажет ошибку
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-5 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Link2 className="h-5 w-5 text-brand-500" />
          Подключение VPN
        </h2>
        <button onClick={() => setConfirmOpen(true)} disabled={revoking} className="btn-secondary text-sm text-red-600 sm:shrink-0">
          <RefreshCw className="h-4 w-4" />
          {revoking ? 'Обновляем...' : 'Обновить ссылку'}
        </button>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-center">
        {subscriptionUrl ? (
          <div className="mx-auto rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <Image
              src={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`}
              alt="QR-код подписки"
              width={220}
              height={220}
              unoptimized
            />
          </div>
        ) : (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-slate-400">Ссылка пока недоступна.</p>
        )}
        <div className="min-w-0">
          <h3 className="text-xl font-semibold">Одна подписка для всех устройств</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Отсканируйте QR-код в VPN-приложении или скопируйте ссылку. Все доступные серверы обновятся автоматически.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button onClick={() => copy(subscriptionUrl, 'Ссылка')} disabled={!subscriptionUrl} className="btn-primary text-sm">
              <Copy className="h-4 w-4" />
              Скопировать ссылку
            </button>
            {subscriptionUrl && (
              <a href={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`} download="vpn-subscription.png" className="btn-secondary text-sm">
                <Download className="h-4 w-4" />
                Скачать QR
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 p-5 dark:border-white/10 dark:bg-white/[0.025] md:grid-cols-3">
        <Instruction icon={<Smartphone className="h-5 w-5" />} number="1" title="Установите приложение" text="Hiddify, Happ, v2rayNG или Shadowrocket." />
        <Instruction icon={<QrCode className="h-5 w-5" />} number="2" title="Добавьте подписку" text="Отсканируйте QR-код или вставьте скопированную ссылку." />
        <Instruction icon={<Link2 className="h-5 w-5" />} number="3" title="Подключитесь" text="Выберите сервер и включите VPN." />
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
    </div>
  )
}

function Instruction({ icon, number, title, text }: { icon: React.ReactNode; number: string; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-brand-600 shadow-sm dark:bg-white/10 dark:text-cyan-200">{icon}</div>
      <div>
        <div className="text-xs font-semibold uppercase text-slate-400">Шаг {number}</div>
        <div className="mt-0.5 text-sm font-semibold">{title}</div>
        <div className="mt-1 text-xs leading-5 text-slate-500">{text}</div>
      </div>
    </div>
  )
}
