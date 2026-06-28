'use client'

import { useRef, useState } from 'react'
import { ImageIcon, Mail, MessageCircle, Send, Smartphone, UsersRound, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'
import { EmojiPicker } from '@/components/ui/emoji-picker'

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

const actionPresets = [
  { href: '', label: '', title: 'Без кнопки', description: 'Только сообщение' },
  { href: '/dashboard', label: 'Открыть кабинет', title: 'Главная', description: 'Общий экран кабинета' },
  { href: '/dashboard/subscription', label: 'Открыть подписку', title: 'Подписка', description: 'Доступ, QR и подключение' },
  { href: '/dashboard/plans', label: 'Выбрать тариф', title: 'Тарифы', description: 'Покупка и продление' },
  { href: '/dashboard/referrals', label: 'Пригласить друга', title: 'Рефералы', description: 'Бонусы за приглашения' },
  { href: '/dashboard/support', label: 'Написать в поддержку', title: 'Поддержка', description: 'Чат с оператором' },
]

export function BroadcastAdmin() {
  const bodyInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [segment, setSegment] = useState<BroadcastSegment>('ALL')
  const [selectedChannels, setSelectedChannels] = useState<BroadcastChannel[]>(['IN_APP'])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [actionHref, setActionHref] = useState('/dashboard')
  const [actionLabel, setActionLabel] = useState('Открыть кабинет')
  const [imageUrl, setImageUrl] = useState('')
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
          imageUrl: imageUrl.trim() || null,
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

  function insertBodyEmoji(emoji: string) {
    const input = bodyInputRef.current
    if (!input) {
      setBody((current) => `${current}${emoji}`.slice(0, 1200))
      return
    }

    const next = insertAtSelection(body, emoji, input.selectionStart, input.selectionEnd, 1200)
    setBody(next.value)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(next.cursor, next.cursor)
    })
  }

  const canSend = title.trim().length >= 3 && body.trim().length >= 5 && selectedChannels.length > 0 && !loading
  const selectedPreset = actionPresets.find((preset) => preset.href === actionHref) ?? actionPresets[0]

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
            <div className="relative mt-1">
              <textarea
                ref={bodyInputRef}
                className="input min-h-40 resize-y py-3 pr-14"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={1200}
                placeholder="Короткое сообщение для пользователя"
              />
              <EmojiPicker
                onPick={insertBodyEmoji}
                className="absolute bottom-3 right-3"
                buttonClassName="bg-white shadow-sm dark:bg-surface-900"
              />
            </div>
            <span className="mt-1 block text-xs text-slate-400">{body.length}/1200</span>
          </label>

          <div className="grid gap-3 lg:grid-cols-[1fr_13rem]">
            <label className="block">
              <span className="text-sm font-medium">Куда ведет кнопка</span>
              <select
                className="input mt-1"
                value={actionHref}
                onChange={(event) => {
                  const preset = actionPresets.find((item) => item.href === event.target.value) ?? actionPresets[0]
                  setActionHref(preset.href)
                  setActionLabel(preset.label)
                }}
              >
                {actionPresets.map((preset) => (
                  <option key={preset.title} value={preset.href}>
                    {preset.title}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-400">{selectedPreset.description}</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Текст кнопки</span>
              <input
                className="input mt-1"
                value={actionLabel}
                onChange={(event) => setActionLabel(event.target.value)}
                maxLength={32}
                placeholder={actionHref ? 'Открыть' : 'Без кнопки'}
                disabled={!actionHref}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Картинка</span>
            <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                className="input"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                maxLength={600}
                placeholder="https://site.ru/image.jpg"
              />
              {imageUrl ? (
                <button type="button" className="btn-secondary min-h-11 px-4" onClick={() => setImageUrl('')}>
                  <X className="h-4 w-4" />
                  Убрать
                </button>
              ) : null}
            </div>
            <span className="mt-1 block text-xs text-slate-400">Для Telegram и email нужна публичная HTTPS-ссылка.</span>
          </label>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Предпросмотр Telegram</div>
                <div className="mt-1 text-sm text-slate-500">Фото, текст и inline-кнопка</div>
              </div>
              <MessageCircle className="h-5 w-5 text-cyan-600" />
            </div>
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-surface-950 dark:ring-white/10">
                <div className="text-lg font-semibold">{title || 'Заголовок рассылки'}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {body || 'Текст сообщения будет показан здесь.'}
                </p>
                {actionHref ? (
                  <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-center text-sm font-semibold text-cyan-800 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-100">
                    {actionLabel || 'Открыть'}
                  </div>
                ) : null}
              </div>
              <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white dark:border-white/10 dark:bg-surface-950">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="" className="h-full max-h-52 w-full object-cover" />
                ) : (
                  <div className="grid justify-items-center gap-2 px-4 text-center text-sm text-slate-400">
                    <ImageIcon className="h-6 w-6" />
                    Картинка не выбрана
                  </div>
                )}
              </div>
            </div>
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

function insertAtSelection(value: string, insert: string, start: number, end: number, maxLength: number) {
  const safeStart = Math.max(0, Math.min(start, value.length))
  const safeEnd = Math.max(safeStart, Math.min(end, value.length))
  const nextValue = `${value.slice(0, safeStart)}${insert}${value.slice(safeEnd)}`.slice(0, maxLength)
  return {
    value: nextValue,
    cursor: Math.min(safeStart + insert.length, nextValue.length),
  }
}
