'use client'

import { useState } from 'react'
import { Mail, MessageCircle, Send, Smartphone, UsersRound } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'

type BroadcastSegment =
  | 'ALL'
  | 'ACTIVE'
  | 'NO_ACTIVE'
  | 'EXPIRED'
  | 'EMAIL_VERIFIED'
  | 'TELEGRAM_LINKED'
  | 'INACTIVE_45D'

type BroadcastChannel = 'IN_APP' | 'EMAIL' | 'TELEGRAM'

type BroadcastStats = {
  recipients: number
  inApp: number
  telegram: Record<'sent' | 'skipped' | 'duplicate' | 'failed', number>
  email: Record<'sent' | 'skipped' | 'duplicate' | 'failed', number>
}

const segments: Array<{ value: BroadcastSegment; label: string; description: string }> = [
  { value: 'ALL', label: 'Все пользователи', description: 'Вся база кабинета' },
  { value: 'ACTIVE', label: 'Активная подписка', description: 'Есть текущий доступ' },
  { value: 'NO_ACTIVE', label: 'Без подписки', description: 'Нет активного доступа' },
  { value: 'EXPIRED', label: 'Истекла подписка', description: 'Был доступ, сейчас нет' },
  { value: 'EMAIL_VERIFIED', label: 'Email подтвержден', description: 'Можно отправить email' },
  { value: 'TELEGRAM_LINKED', label: 'Telegram привязан', description: 'Можно отправить в бот' },
  { value: 'INACTIVE_45D', label: 'Не покупали 45 дней', description: 'Для возврата' },
]

const channels: Array<{ value: BroadcastChannel; label: string; icon: typeof Mail }> = [
  { value: 'IN_APP', label: 'Кабинет', icon: Smartphone },
  { value: 'TELEGRAM', label: 'Telegram', icon: MessageCircle },
  { value: 'EMAIL', label: 'Email', icon: Mail },
]

export function BroadcastAdmin() {
  const [segment, setSegment] = useState<BroadcastSegment>('ALL')
  const [selectedChannels, setSelectedChannels] = useState<BroadcastChannel[]>(['IN_APP'])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [actionHref, setActionHref] = useState('/dashboard')
  const [actionLabel, setActionLabel] = useState('Открыть')
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<BroadcastStats | null>(null)

  async function submit() {
    setLoading(true)
    setStats(null)
    try {
      const result = await apiFetch<{ stats: BroadcastStats; limited?: boolean }>('/api/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          title,
          body,
          segment,
          channels: selectedChannels,
          actionHref,
          actionLabel,
        }),
      })
      setStats(result.stats)
      toast(result.limited ? 'Рассылка отправлена первым 5000 получателей' : 'Рассылка отправлена', 'success')
    } catch {
      // apiFetch покажет ошибку.
    } finally {
      setLoading(false)
    }
  }

  function toggleChannel(channel: BroadcastChannel) {
    setSelectedChannels((current) => {
      if (current.includes(channel)) {
        return current.length === 1 ? current : current.filter((item) => item !== channel)
      }
      return [...current, channel]
    })
  }

  const canSend = title.trim().length >= 3 && body.trim().length >= 5 && selectedChannels.length > 0 && !loading

  return (
    <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="card p-4">
        <div className="flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-cyan-600" />
          <h2 className="font-semibold">Кому отправить</h2>
        </div>
        <div className="mt-4 grid gap-2">
          {segments.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setSegment(item.value)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                segment === item.value
                  ? 'border-slate-950 bg-slate-950 text-white shadow-sm dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-surface-900 dark:hover:bg-white/5'
              )}
            >
              <div className="text-sm font-semibold">{item.label}</div>
              <div className={cn('mt-0.5 text-xs', segment === item.value ? 'text-white/70 dark:text-slate-600' : 'text-slate-500')}>
                {item.description}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5">
          <div className="text-sm font-semibold">Каналы</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {channels.map((item) => {
              const Icon = item.icon
              const active = selectedChannels.includes(item.value)
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => toggleChannel(item.value)}
                  className={cn(
                    'flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-100'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:bg-surface-900 dark:hover:bg-white/5'
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-4">
          <label className="block">
            <span className="text-sm font-medium">Заголовок</span>
            <input
              className="input mt-1"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              placeholder="Например: скидка до конца недели"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Текст</span>
            <textarea
              className="input mt-1 min-h-40 resize-y py-3"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={1200}
              placeholder="Короткое сообщение для пользователя"
            />
            <span className="mt-1 block text-xs text-slate-400">{body.length}/1200</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-[1fr_13rem]">
            <label className="block">
              <span className="text-sm font-medium">Ссылка действия</span>
              <input
                className="input mt-1"
                value={actionHref}
                onChange={(event) => setActionHref(event.target.value)}
                placeholder="/dashboard/plans"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Кнопка</span>
              <input
                className="input mt-1"
                value={actionLabel}
                onChange={(event) => setActionLabel(event.target.value)}
                maxLength={32}
                placeholder="Открыть"
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Предпросмотр</div>
            <div className="mt-2 text-lg font-semibold">{title || 'Заголовок рассылки'}</div>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {body || 'Текст сообщения будет показан здесь.'}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {stats ? <BroadcastStats stats={stats} /> : <div className="text-sm text-slate-500">Результат появится после отправки.</div>}
            <button type="button" className="btn-primary min-h-11 px-5" onClick={submit} disabled={!canSend}>
              <Send className="h-4 w-4" />
              {loading ? 'Отправляем...' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function BroadcastStats({ stats }: { stats: BroadcastStats }) {
  return (
    <div className="grid gap-1 text-sm text-slate-600 dark:text-slate-300">
      <div className="font-medium text-slate-950 dark:text-white">Получателей: {stats.recipients}</div>
      <div>Кабинет: {stats.inApp}</div>
      <div>Telegram: {stats.telegram.sent} отправлено, {stats.telegram.failed} ошибок</div>
      <div>Email: {stats.email.sent} отправлено, {stats.email.failed} ошибок</div>
    </div>
  )
}
