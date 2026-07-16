'use client'

import { useEffect, useRef, useState } from 'react'
import { Clock3, Eye, ImageIcon, MessageCircle, RotateCcw, Send, UsersRound, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { AdminModal } from '@/components/admin/admin-modal'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import {
  broadcastActionPresets as actionPresets,
  broadcastChannels as channels,
  broadcastPreviewVariables as previewVariables,
  broadcastSegments as segments,
  builtInBroadcastTemplates as templates,
  type BroadcastChannel,
  type BroadcastHistoryItem,
  type BroadcastSegment,
  type BroadcastStatsValue as BroadcastStats,
  type BroadcastStep,
  type BroadcastTemplateItem,
} from './broadcast-config'


const MAX_UPLOAD_IMAGE_SIZE = 15 * 1024 * 1024
const ALLOWED_UPLOAD_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const BROADCAST_DRAFT_KEY = 'remnawave-cabinet:broadcast-draft'

export function BroadcastAdmin({
  initialHistory = [],
  initialHistoryTotal = initialHistory.length,
  initialTemplates = [],
}: {
  initialHistory?: BroadcastHistoryItem[]
  initialHistoryTotal?: number
  initialTemplates?: BroadcastTemplateItem[]
}) {
  const bodyInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [segment, setSegment] = useState<BroadcastSegment>('ALL')
  const [inactiveDays, setInactiveDays] = useState(45)
  const [selectedChannels, setSelectedChannels] = useState<BroadcastChannel[]>(['IN_APP'])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [actionHref, setActionHref] = useState('/dashboard')
  const [actionLabel, setActionLabel] = useState('Открыть кабинет')
  const [actionOpenInTelegram, setActionOpenInTelegram] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<BroadcastStats | null>(null)
  const [history, setHistory] = useState<BroadcastHistoryItem[]>(initialHistory)
  const [historyTotal, setHistoryTotal] = useState(initialHistoryTotal)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [customTemplates, setCustomTemplates] = useState<BroadcastTemplateItem[]>(initialTemplates)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<BroadcastHistoryItem | null>(null)
  const [step, setStep] = useState<BroadcastStep>('message')

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BROADCAST_DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw) as Partial<{
        title: string
        body: string
        segment: BroadcastSegment
        inactiveDays: number
        selectedChannels: BroadcastChannel[]
        actionHref: string
        actionLabel: string
        actionOpenInTelegram: boolean
        imageUrl: string
      }>
      if (draft.title) setTitle(draft.title)
      if (draft.body) setBody(draft.body)
      if (draft.segment) setSegment(normalizeSegment(draft.segment))
      if (typeof draft.inactiveDays === 'number') setInactiveDays(normalizeInactiveDays(draft.inactiveDays))
      if (draft.selectedChannels?.length) setSelectedChannels(draft.selectedChannels)
      if (typeof draft.actionHref === 'string') setActionHref(draft.actionHref)
      if (typeof draft.actionLabel === 'string') setActionLabel(draft.actionLabel)
      if (typeof draft.actionOpenInTelegram === 'boolean') setActionOpenInTelegram(draft.actionOpenInTelegram)
      if (typeof draft.imageUrl === 'string') setImageUrl(draft.imageUrl)
    } catch {
      window.localStorage.removeItem(BROADCAST_DRAFT_KEY)
    }
  }, [])

  useEffect(() => {
    const draft = { title, body, segment, inactiveDays, selectedChannels, actionHref, actionLabel, actionOpenInTelegram, imageUrl }
    window.localStorage.setItem(BROADCAST_DRAFT_KEY, JSON.stringify(draft))
  }, [actionHref, actionLabel, actionOpenInTelegram, body, imageUrl, inactiveDays, segment, selectedChannels, title])

  async function submit(testMode = false) {
    const campaignTitle = getBroadcastTitle()
    setLoading(true)
    setStats(null)
    try {
      const result = await apiFetch<{ stats: BroadcastStats; limited?: boolean; campaign?: BroadcastHistoryItem; testMode?: boolean; queued?: boolean }>('/api/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          title: campaignTitle,
          body,
          segment,
          inactiveDays: segment === 'INACTIVE_N_DAYS' ? inactiveDays : null,
          channels: selectedChannels,
          actionHref,
          actionLabel,
          actionOpenInTelegram,
          imageUrl: imageUrl.trim() || null,
          testMode,
        }),
      })
      setStats(result.stats)
      if (result.campaign) {
        setHistory((current) => [result.campaign!, ...current].slice(0, 12))
        setHistoryTotal((current) => current + 1)
      }
      if (!testMode) window.localStorage.removeItem(BROADCAST_DRAFT_KEY)
      toast(testMode ? 'Тестовая рассылка отправлена вам' : result.queued ? 'Рассылка поставлена в очередь' : result.limited ? 'Рассылка отправлена первым 5000 получателей' : 'Рассылка отправлена', 'success')
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

  function applyTemplate(template: BroadcastTemplateItem) {
    setTitle(template.title)
    setBody(template.body)
    const nextSegment = normalizeSegment(template.segment)
    setSegment(nextSegment)
    setInactiveDays(normalizeInactiveDays(template.inactiveDays ?? (template.segment === 'INACTIVE_45D' ? 45 : inactiveDays)))
    setSelectedChannels(template.channels.filter((channel): channel is BroadcastChannel => ['IN_APP', 'EMAIL', 'TELEGRAM'].includes(channel)))
    setActionHref(template.actionHref || '')
    setActionLabel(template.actionLabel || '')
    setActionOpenInTelegram(Boolean(template.actionOpenInTelegram))
    setImageUrl(template.imageUrl || '')
    setStats(null)
    setStep('message')
  }

  async function saveTemplate() {
    const campaignTitle = getBroadcastTitle()
    try {
      const result = await apiFetch<{ template: BroadcastTemplateItem }>('/api/admin/broadcast-templates', {
        method: 'POST',
        body: JSON.stringify({
          title: campaignTitle,
          description: `Сохранено ${new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date())}`,
          body,
          segment,
          inactiveDays: segment === 'INACTIVE_N_DAYS' ? inactiveDays : null,
          channels: selectedChannels,
          actionHref,
          actionLabel,
          actionOpenInTelegram,
          imageUrl: imageUrl.trim() || null,
        }),
      })
      setCustomTemplates((current) => [result.template, ...current].slice(0, 50))
      toast('Шаблон сохранён', 'success')
    } catch {
      // apiFetch покажет ошибку.
    }
  }

  async function deleteTemplate(templateId: string) {
    try {
      await apiFetch(`/api/admin/broadcast-templates/${encodeURIComponent(templateId)}`, { method: 'DELETE' })
      setCustomTemplates((current) => current.filter((template) => template.id !== templateId))
      toast('Шаблон удалён', 'success')
    } catch {
      // apiFetch покажет ошибку.
    }
  }

  function applyHistoryItem(item: BroadcastHistoryItem) {
    setTitle(item.title)
    setBody(item.body)
    const nextSegment = normalizeSegment(item.segment)
    setSegment(nextSegment)
    setInactiveDays(normalizeInactiveDays(item.inactiveDays ?? (item.segment === 'INACTIVE_45D' ? 45 : inactiveDays)))
    setSelectedChannels(item.channels.filter((channel): channel is BroadcastChannel => ['IN_APP', 'EMAIL', 'TELEGRAM'].includes(channel)))
    setActionHref(item.actionHref || '')
    setActionLabel(item.actionLabel || '')
    setActionOpenInTelegram(item.actionOpenInTelegram)
    setImageUrl(item.imageUrl || '')
    setImageLoadFailed(false)
    setStats(null)
    toast('Рассылка загружена в редактор', 'success')
  }

  async function loadMoreHistory() {
    if (historyLoading || history.length >= historyTotal) return
    setHistoryLoading(true)
    try {
      const result = await apiFetch<{ history: BroadcastHistoryItem[]; total: number }>(
        `/api/admin/broadcasts?skip=${history.length}&take=12`
      )
      setHistory((current) => {
        const seen = new Set(current.map((item) => item.id))
        const next = result.history.filter((item) => !seen.has(item.id))
        return [...current, ...next]
      })
      setHistoryTotal(result.total)
    } catch {
      // apiFetch покажет ошибку.
    } finally {
      setHistoryLoading(false)
    }
  }

  async function uploadImage(file: File | null) {
    if (!file) return
    if (!ALLOWED_UPLOAD_IMAGE_TYPES.has(file.type)) {
      toast('Неподдерживаемый формат. Загрузите JPG, PNG, WEBP или GIF.')
      return
    }
    if (file.size <= 0) {
      toast('Файл пустой. Выберите другое изображение.')
      return
    }
    if (file.size > MAX_UPLOAD_IMAGE_SIZE) {
      toast(`Картинка слишком большая: ${formatFileSize(file.size)}. Максимум 15 МБ.`)
      return
    }

    setUploadingImage(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const response = await fetch('/api/admin/broadcasts/upload', {
        method: 'POST',
        body: form,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(getUploadErrorMessage(response.status, data))
      setImageUrl(data.url)
      setImageLoadFailed(false)
      toast('Картинка загружена', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось загрузить картинку')
    } finally {
      setUploadingImage(false)
    }
  }

  function getBroadcastTitle() {
    return (title.trim() || 'Рассылка').trim()
  }

  const canSend = body.trim().length >= 5 && selectedChannels.length > 0 && !loading
  const selectedPreset = actionPresets.find((preset) => preset.href === actionHref)
  const previewBody = renderPreview(body || 'Текст сообщения будет показан здесь.')
  const previewActionLabel = renderPreview(actionLabel || 'Открыть')
  const previewImageUrl = getPreviewImageUrl(imageUrl)
  const visibleTemplates: BroadcastTemplateItem[] = [...customTemplates, ...templates]

  return (
    <section className="grid w-full min-w-0 max-w-full gap-4 overflow-hidden">
      <div className="card w-full min-w-0 overflow-hidden p-1.5">
        <div className="grid w-full min-w-0 grid-cols-3 gap-1">
          <BroadcastStepButton
            active={step === 'message'}
            number="1"
            title="Сообщение"
            onClick={() => setStep('message')}
          />
          <BroadcastStepButton
            active={step === 'audience'}
            number="2"
            title="Аудитория"
            onClick={() => setStep('audience')}
          />
          <BroadcastStepButton
            active={step === 'delivery'}
            number="3"
            title="Отправка"
            onClick={() => setStep('delivery')}
          />
        </div>
      </div>

      <div className="grid w-full min-w-0 gap-4">
        <div className={cn('card min-w-0 overflow-hidden p-4', step !== 'audience' && 'hidden')}>
          <div className="flex items-center gap-2">
            <UsersRound className="h-5 w-5 text-cyan-600" />
            <h2 className="font-semibold">Кому отправить</h2>
          </div>
          <label className="mt-4 block">
            <span className="text-sm font-medium">Аудитория</span>
            <select className="input mt-1" value={segment} onChange={(event) => setSegment(event.target.value as BroadcastSegment)}>
              {segments.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">{segments.find((item) => item.value === segment)?.description}</span>
          </label>

          {segment === 'INACTIVE_N_DAYS' && (
            <label className="mt-4 block rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
              <span className="text-sm font-medium">Не покупали, дней</span>
              <input
                className="input mt-2"
                type="number"
                min={1}
                max={3650}
                value={inactiveDays}
                onChange={(event) => setInactiveDays(normalizeInactiveDays(event.target.value))}
              />
            </label>
          )}

          <div className="mt-5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Каналы</div>
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                onClick={() => setSelectedChannels(['IN_APP', 'TELEGRAM', 'EMAIL'])}
              >
                Все каналы
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {channels.map((item) => {
                const Icon = item.icon
                const active = selectedChannels.includes(item.value)
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => toggleChannel(item.value)}
                    className={cn(
                      'flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors',
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

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-between">
            <button type="button" className="btn-secondary min-h-11 px-5" onClick={() => setStep('message')}>
              Назад
            </button>
            <button type="button" className="btn-primary min-h-11 px-5" onClick={() => setStep('delivery')} disabled={!canSend}>
              К проверке
            </button>
          </div>
        </div>

        <div className={cn('card min-w-0 overflow-hidden p-4', step !== 'message' && 'hidden')}>
          <div className="grid min-w-0 gap-4">
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="block min-w-0">
                <span className="text-sm font-medium">Шаблон</span>
                <select
                  className="input mt-1"
                  defaultValue=""
                  onChange={(event) => {
                    const template = visibleTemplates[Number(event.target.value)]
                    if (template) applyTemplate(template)
                    event.currentTarget.value = ''
                  }}
                >
                  <option value="" disabled>Выбрать готовое сообщение</option>
                  {visibleTemplates.map((template, index) => (
                    <option key={template.id || template.title} value={index}>
                      {template.id ? 'Мой шаблон' : 'Готовый'} · {template.title}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn-secondary min-h-11 px-4 text-sm" onClick={saveTemplate} disabled={!canSend}>
                Сохранить шаблон
              </button>
            </div>

            {customTemplates.length > 0 ? (
              <details className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10">
                <summary className="cursor-pointer font-medium">Мои шаблоны ({customTemplates.length})</summary>
                <div className="mt-2 divide-y divide-slate-100 dark:divide-white/10">
                  {customTemplates.map((template) => (
                    <div key={template.id || template.title} className="flex items-center justify-between gap-3 py-2">
                      <button type="button" className="min-w-0 truncate text-left font-medium hover:text-cyan-700" onClick={() => applyTemplate(template)}>
                        {template.title}
                      </button>
                      {template.id ? (
                        <button type="button" className="text-xs font-medium text-red-600 dark:text-red-300" onClick={() => deleteTemplate(template.id!)}>
                          Удалить
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-slate-500">Подстановки:</span>
              <div className="flex flex-wrap gap-1.5">
                {['{name}', '{email}', '{days_left}', '{plan}', '{ref_link}'].map((token) => (
                  <button
                    key={token}
                    type="button"
                    className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/10"
                    onClick={() => insertBodyEmoji(token)}
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-medium">Текст</span>
              <div className="relative mt-1">
                <textarea
                  ref={bodyInputRef}
                  className="input min-h-44 resize-y py-3 pr-14 leading-6 sm:min-h-48"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={1200}
                  placeholder="Короткое сообщение для пользователя"
                />
                <EmojiPicker
                  onPick={insertBodyEmoji}
                  className="absolute bottom-3 right-3"
                  buttonClassName="bg-white dark:bg-surface-900"
                />
              </div>
              <span className="mt-1 block text-xs text-slate-400">{body.length}/1200</span>
            </label>

            <details className="rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10">
              <summary className="cursor-pointer text-sm font-medium">Кнопка и изображение</summary>
              <div className="mt-3 grid min-w-0 gap-3">
                <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_13rem]">
                  <label className="block">
                    <span className="text-sm font-medium">Куда ведет кнопка</span>
                    <select
                      className="input mt-1"
                      value={selectedPreset ? selectedPreset.href : 'CUSTOM'}
                      onChange={(event) => {
                        const preset = actionPresets.find((item) => item.href === event.target.value) ?? actionPresets[0]
                        if (event.target.value === 'CUSTOM') {
                          setActionHref(actionHref || '/dashboard')
                          setActionLabel((current) => current || 'Открыть')
                          return
                        }
                        if (!preset) return
                        setActionHref(preset.href)
                        setActionLabel(preset.label)
                        if (!preset.href) setActionOpenInTelegram(false)
                      }}
                    >
                      {actionPresets.map((preset) => (
                        <option key={preset.title} value={preset.href}>
                          {preset.title}
                        </option>
                      ))}
                      <option value="CUSTOM">Своя ссылка</option>
                    </select>
                    <span className="mt-1 block text-xs text-slate-400">{selectedPreset?.description ?? 'Путь внутри кабинета, можно с параметрами'}</span>
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
                  <span className="text-sm font-medium">Адрес кнопки</span>
                  <input
                    className="input mt-1 font-mono text-sm"
                    value={actionHref}
                    onChange={(event) => {
                      const href = event.target.value
                      setActionHref(href)
                      if (!href) setActionOpenInTelegram(false)
                    }}
                    maxLength={600}
                    placeholder="/dashboard/plans?promo=COMEBACK"
                  />
                </label>

                {actionHref ? (
                  <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-950 dark:text-white">Открывать в Telegram</span>
                      <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Web App для Telegram-кнопки</span>
                    </span>
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={actionOpenInTelegram}
                      onChange={(event) => setActionOpenInTelegram(event.target.checked)}
                    />
                  </label>
                ) : null}

                <label className="block">
                  <span className="text-sm font-medium">Картинка</span>
                  <div className="mt-1 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <input
                      className="input"
                      value={imageUrl}
                      onChange={(event) => {
                        setImageUrl(event.target.value)
                        setImageLoadFailed(false)
                      }}
                      maxLength={600}
                      placeholder="Ссылка появится после загрузки"
                    />
                    <label className={cn('btn-secondary min-h-11 cursor-pointer px-4', uploadingImage && 'pointer-events-none opacity-60')}>
                      <ImageIcon className="h-4 w-4" />
                      {uploadingImage ? 'Загрузка...' : 'Загрузить'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null
                          void uploadImage(file)
                          event.currentTarget.value = ''
                        }}
                      />
                    </label>
                    {imageUrl ? (
                      <button
                        type="button"
                        className="btn-secondary min-h-11 px-4"
                        onClick={() => {
                          setImageUrl('')
                          setImageLoadFailed(false)
                        }}
                      >
                        <X className="h-4 w-4" />
                        Убрать
                      </button>
                    ) : null}
                  </div>
                  <span className="mt-1 block text-xs text-slate-400">До 15 МБ: JPG, PNG, WEBP или GIF. Можно оставить пустым.</span>
                </label>
              </div>
            </details>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-500">Шаблон и текст готовы, дальше выберите аудиторию и канал.</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-primary min-h-11 px-5" onClick={() => setStep('audience')} disabled={!body.trim()}>
                  Далее
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={cn('card min-w-0 overflow-hidden p-4', step !== 'delivery' && 'hidden')}>
          <div className="grid min-w-0 gap-4">
            <div className="grid gap-2 md:grid-cols-3">
              <InfoPill label="Сегмент" value={segmentLabel(segment, inactiveDays)} />
              <InfoPill label="Каналы" value={selectedChannels.map(channelLabel).join(', ')} />
              <InfoPill label="Кнопка" value={actionHref ? `${previewActionLabel}${actionOpenInTelegram ? ' · Telegram Web App' : ''}` : 'Без кнопки'} />
            </div>

            <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-white/10">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Предпросмотр</div>
                  <div className="mt-1 text-sm text-slate-500">Как увидит пользователь</div>
                </div>
                <MessageCircle className="h-5 w-5 text-cyan-600" />
              </div>
              <div className="bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_34%),linear-gradient(135deg,#f8fafc,#eef8ff)] p-4 dark:bg-none dark:bg-surface-950">
                <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="mb-3 flex items-center gap-2 px-1">
                    <div className="grid h-8 w-8 place-items-center rounded-full bg-cyan-500 text-sm font-bold text-white">T</div>
                    <div>
                      <div className="text-sm font-semibold text-slate-950 dark:text-white">Telegram</div>
                      <div className="text-xs text-slate-400">рассылка кабинета</div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface-900">
                    {previewImageUrl && !imageLoadFailed ? (
                      <div className="overflow-hidden bg-slate-100 dark:bg-white/5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewImageUrl}
                          alt=""
                          className="max-h-72 w-full object-cover"
                          onLoad={() => setImageLoadFailed(false)}
                          onError={() => setImageLoadFailed(true)}
                        />
                      </div>
                    ) : imageLoadFailed ? (
                      <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-100">Картинку не удалось открыть</div>
                    ) : null}

                    <div className="p-4">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{previewBody}</p>
                    </div>

                    {actionHref ? (
                      <div className="border-t border-slate-100 p-2 dark:border-white/10">
                        <div className="rounded-xl bg-cyan-50 px-3 py-2.5 text-center text-sm font-semibold text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-100">
                          {previewActionLabel}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {stats ? <BroadcastStats stats={stats} /> : <div className="text-sm text-slate-500">Результат появится после отправки.</div>}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" className="btn-secondary min-h-11 px-5" onClick={() => setStep('audience')}>
                  Назад
                </button>
                <button type="button" className="btn-secondary min-h-11 px-5" onClick={() => submit(true)} disabled={!canSend}>
                  <Send className="h-4 w-4" />
                  Тест себе
                </button>
                <button type="button" className="btn-primary min-h-11 px-5" onClick={() => submit(false)} disabled={!canSend}>
                  <Send className="h-4 w-4" />
                  {loading ? 'Отправляем...' : 'Отправить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden">
        <BroadcastHistory
          history={history}
          total={historyTotal}
          loading={historyLoading}
          onLoadMore={loadMoreHistory}
          onRepeat={applyHistoryItem}
          onView={setSelectedHistoryItem}
        />
      </div>
      {selectedHistoryItem ? <BroadcastHistoryModal item={selectedHistoryItem} onClose={() => setSelectedHistoryItem(null)} /> : null}
    </section>
  )
}

function BroadcastStepButton({
  active,
  number,
  title,
  onClick,
}: {
  active: boolean
  number: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-2 text-left text-sm transition-colors sm:px-3',
        active
          ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
          : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]'
      )}
      onClick={onClick}
    >
      <span className={cn(
        'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
        active ? 'bg-white/15 text-white dark:bg-slate-950/10 dark:text-slate-950' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400'
      )}>
        {number}
      </span>
      <span className="min-w-0 truncate font-semibold">{title}</span>
    </button>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-950 dark:text-white">{value || 'Не выбрано'}</div>
    </div>
  )
}

function BroadcastHistory({
  history,
  total,
  loading,
  onLoadMore,
  onRepeat,
  onView,
}: {
  history: BroadcastHistoryItem[]
  total: number
  loading: boolean
  onLoadMore: () => void
  onRepeat: (item: BroadcastHistoryItem) => void
  onView: (item: BroadcastHistoryItem) => void
}) {
  const hasMore = history.length < total

  return (
    <div className="card min-w-0 overflow-hidden p-4">
      <div className="flex items-center gap-2">
        <Clock3 className="h-5 w-5 text-cyan-600" />
        <h2 className="font-semibold">Последние рассылки</h2>
      </div>
      {history.length === 0 ? (
        <AdminEmptyState
          title="Рассылок пока нет"
          description="История появится после первой отправки."
          surface="plain"
          className="mt-4"
        />
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100 dark:border-white/10 dark:divide-white/10">
          {history.map((item) => (
            <div key={item.id} className="min-w-0 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDateTime(item.createdAt)} · {segmentLabel(item.segment, item.inactiveDays ?? undefined)} · {item.createdBy || 'Система'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => onView(item)}>
                    <Eye className="h-4 w-4" />
                    Детали
                  </button>
                  <button type="button" className="btn-secondary min-h-9 px-3 text-sm" onClick={() => onRepeat(item)}>
                    <RotateCcw className="h-4 w-4" />
                    Повторить
                  </button>
                  <div className="col-span-2 grid min-h-9 place-items-center px-2 text-sm font-semibold text-slate-950 dark:text-white sm:col-span-1">
                    {item.recipients} получ.
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Кабинет {item.inAppCount} · Telegram {item.telegramSent}{item.telegramFailed ? ` (${item.telegramFailed} ошибок)` : ''} · Email {item.emailSent}{item.emailFailed ? ` (${item.emailFailed} ошибок)` : ''}
              </div>
              {item.limited ? <div className="mt-2 text-xs text-amber-600">Отправлено первым 5000 получателей</div> : null}
            </div>
          ))}
          {hasMore ? (
            <button type="button" className="btn-secondary mt-2 justify-center" onClick={onLoadMore} disabled={loading}>
              {loading ? 'Загрузка...' : `Показать ещё (${history.length} из ${total})`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  )
}

function BroadcastHistoryModal({ item, onClose }: { item: BroadcastHistoryItem; onClose: () => void }) {
  return (
    <AdminModal
      open
      title={item.title}
      description={`${formatDateTime(item.createdAt)} · ${segmentLabel(item.segment, item.inactiveDays ?? undefined)} · ${item.createdBy || 'Система'}`}
      onClose={onClose}
      size="lg"
    >
      <div className="grid gap-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Рассылка
        </div>

        {item.imageUrl ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={getPreviewImageUrl(item.imageUrl)} alt="" className="max-h-80 w-full object-cover" />
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{item.body}</p>
          {item.actionHref ? (
            <div className="mt-3 rounded-xl bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-100">
              {item.actionLabel || 'Открыть'} · {item.actionHref}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <HistoryMetric label="Кабинет" value={item.inAppCount} />
          <HistoryMetric label="Telegram" value={item.telegramSent} failed={item.telegramFailed + item.telegramSkipped + item.telegramDuplicate} />
          <HistoryMetric label="Email" value={item.emailSent} failed={item.emailFailed + item.emailSkipped + item.emailDuplicate} />
        </div>
      </div>
    </AdminModal>
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

function HistoryMetric({ label, value, failed = 0 }: { label: string; value: number; failed?: number }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1.5 dark:bg-white/5">
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <span>{value}{failed ? ` · ${failed} ош.` : ''}</span>
    </div>
  )
}

function segmentLabel(value: string, days?: number) {
  const normalized = normalizeSegment(value)
  if (normalized === 'INACTIVE_N_DAYS') return `Не покупали ${normalizeInactiveDays(days ?? 45)} дней`
  return segments.find((item) => item.value === normalized)?.label ?? value
}

function channelLabel(value: string) {
  return channels.find((item) => item.value === value)?.label ?? value
}

function normalizeSegment(value: string): BroadcastSegment {
  if (value === 'INACTIVE_45D') return 'INACTIVE_N_DAYS'
  if (value === 'EMAIL_VERIFIED' || value === 'TELEGRAM_LINKED') return 'ALL'
  if (segments.some((item) => item.value === value)) return value as BroadcastSegment
  return 'ALL'
}

function normalizeInactiveDays(value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 45
  return Math.min(3650, Math.max(1, Math.round(parsed)))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
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

function renderPreview(value: string) {
  return value.replace(/\{(name|email|days_left|plan|ref_link)\}/g, (_, key: string) => previewVariables[key] ?? `{${key}}`)
}

function getPreviewImageUrl(value: string) {
  const href = value.trim()
  if (!href) return ''
  if (typeof window === 'undefined') return href

  try {
    const url = new URL(href, window.location.origin)
    if (url.origin === window.location.origin) return `${url.pathname}${url.search}`
    return url.toString()
  } catch {
    return href
  }
}

function getUploadErrorMessage(status: number, data: any) {
  if (data && typeof data.error === 'string' && data.error.trim()) return data.error
  if (status === 413) return 'Картинка слишком большая для загрузки. Сожмите изображение или выберите файл до 15 МБ.'
  if (status === 401) return 'Сессия истекла. Войдите заново и повторите загрузку.'
  if (status === 403) return 'Загружать картинки может только администратор.'
  if (status === 415) return 'Неподдерживаемый формат. Загрузите JPG, PNG, WEBP или GIF.'
  return `Не удалось загрузить картинку. Код ошибки: ${status}.`
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} КБ`
  return `${bytes} Б`
}
