// Карточка с ключами: кнопки копирования, QR-код для URL подписки.

'use client'

import { useState } from 'react'
import Image from 'next/image'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { Copy, Download, KeyRound, RefreshCw } from 'lucide-react'
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
      toast('Ключи перевыпущены — обновите страницу', 'success')
      // Простой способ: рефреш
      setTimeout(() => window.location.reload(), 800)
    } catch {
      // toaster покажет ошибку
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="card">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="h-5 w-5 text-brand-500" />
          Ссылка доступа
        </h2>
        <button onClick={() => setConfirmOpen(true)} disabled={revoking} className="btn-danger text-sm sm:shrink-0">
          <RefreshCw className="h-4 w-4" />
          {revoking ? 'Перевыпуск...' : 'Перевыпустить'}
        </button>
      </div>

      <div className="space-y-5 text-center">
        <p className="text-sm text-slate-500">
          Скопируйте ссылку или отсканируйте QR-код в приложении для VPN.
        </p>
        {subscriptionUrl ? (
          <div className="inline-block max-w-full rounded-lg border bg-white p-3 shadow-sm sm:p-4">
            <Image
              src={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`}
              alt="QR-код ссылки подписки"
              width={220}
              height={220}
              unoptimized
            />
          </div>
        ) : (
          <p className="rounded-lg border px-4 py-6 text-sm text-slate-400">Ссылка подписки пока недоступна.</p>
        )}
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <button
            onClick={() => copy(subscriptionUrl, 'Ссылка доступа')}
            disabled={!subscriptionUrl}
            className="btn-secondary text-sm"
          >
            <Copy className="h-4 w-4" />
            Скопировать
          </button>
          {subscriptionUrl && (
            <a
              href={`/api/qr?text=${encodeURIComponent(subscriptionUrl)}`}
              download="remnawave-subscription.png"
              className="btn-secondary text-sm"
            >
              <Download className="h-4 w-4" />
              Скачать QR
            </a>
          )}
        </div>
      </div>

      <details className="mt-6 text-sm">
        <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
          Как подключиться?
        </summary>
        <ol className="list-decimal pl-5 mt-3 space-y-1 text-slate-600 dark:text-slate-300">
          <li>Скачайте клиент: <b>Happ</b>, <b>v2ray</b>,<b>Shadowrocket</b>.</li>
          <li>Скопируйте ссылку подписки или отсканируйте QR-код.</li>
          <li>Вставьте в клиент через «Add subscription from clipboard».</li>
          <li>Подключайтесь и проверьте статус на главной странице.</li>
        </ol>
        <ol className="list-decimal pl-5 mt-3 space-y-1 text-slate-600 dark:text-slate-300">
          <li>Отсканируйте QR-код камерой телефона и перейдите по ссылке.</li>
          <li>Следуйте инструкциям по шагам:</li>
          <li>1. Выберите устройство (Android/iOS/Windows/Linux).</li>
          <li>2. Нажмите скачать приложение - вас перекинет на страницу скачивания приложения</li>
          <li>3. Вернитесь на страницу на которую перекинуло при сканировании QR-кода</li>
          <li>4. Нажмите "Добавить подписку"</li>
        </ol>
      </details>
      <ConfirmDialog
        open={confirmOpen}
        title="Перевыпустить ссылку доступа?"
        description="Старая ссылка перестанет работать. Пользователю нужно будет добавить новую ссылку в приложение."
        confirmLabel="Перевыпустить"
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
