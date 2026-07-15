'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search, Smile } from 'lucide-react'
import { cn } from '@/lib/cn'

type EmojiCategory = 'recent' | 'people' | 'hands' | 'symbols' | 'objects'

const emojiCategories: Array<{ value: EmojiCategory; label: string; items: string[] }> = [
  { value: 'recent', label: 'Недавние', items: ['👍', '🙏', '🔥', '🎁', '✅', '⚡', '🚀', '💬', '👀', '👇', '🎉', '🔔'] },
  {
    value: 'people',
    label: 'Смайлы',
    items: ['😀', '😁', '😄', '😆', '🙂', '😊', '😉', '😎', '🤔', '😕', '😔', '😅', '😂', '🤣', '😍', '🥰', '😘', '😇', '😐', '🙃', '😢', '🥺', '😡', '🤯', '😴', '🤝'],
  },
  {
    value: 'hands',
    label: 'Жесты',
    items: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '🙏', '👋', '👇', '👆', '👉', '👈', '💪', '🫶', '🤲'],
  },
  {
    value: 'symbols',
    label: 'Статусы',
    items: ['✅', '❌', '⚠️', '🔔', '⏳', '🕒', '📌', '📍', '🔒', '🔓', '🔄', '🧾', '💳', '🛠️', '📡', '🧩', '💬', '📩'],
  },
  {
    value: 'objects',
    label: 'Разное',
    items: ['🎁', '🎉', '⭐', '🔥', '⚡', '🚀', '🌐', '🔗', '📦', '💎', '🏆', '🎯', '🧠', '📱', '💻', '🖥️', '🎲', '👑', '☕', '🍀'],
  },
]

const emojiKeywords: Record<string, string> = {
  '👍': 'ок лайк хорошо согласен',
  '🙏': 'спасибо пожалуйста',
  '🔥': 'огонь срочно акция горячо',
  '🎁': 'подарок бонус промо',
  '✅': 'готово успешно да',
  '⚡': 'быстро молния срочно',
  '🚀': 'старт запуск быстро',
  '💬': 'чат сообщение поддержка',
  '👀': 'смотрю проверка',
  '👇': 'ниже сюда',
  '😀': 'улыбка смайл',
  '😁': 'радость улыбка',
  '😄': 'радость',
  '😆': 'смех',
  '🙂': 'улыбка нормально',
  '😊': 'приятно спасибо',
  '😉': 'ок подмигивание',
  '😎': 'круто',
  '🤔': 'думаю вопрос',
  '😕': 'непонятно проблема',
  '😔': 'грусть',
  '😅': 'неловко',
  '😂': 'смех',
  '🤣': 'смех',
  '😍': 'супер любовь',
  '🥰': 'любовь',
  '😘': 'поцелуй',
  '😇': 'хорошо',
  '😐': 'нейтрально',
  '🙃': 'ирония',
  '😢': 'грусть',
  '🥺': 'пожалуйста',
  '😡': 'злость',
  '🤯': 'шок',
  '😴': 'сон',
  '🤝': 'договорились помощь',
  '👎': 'нет плохо',
  '👌': 'ок',
  '✌️': 'мир',
  '🤞': 'удача',
  '🤟': 'жест',
  '🤘': 'рок',
  '👏': 'аплодисменты',
  '🙌': 'ура готово',
  '👋': 'привет',
  '👆': 'выше',
  '👉': 'сюда право',
  '👈': 'сюда лево',
  '💪': 'сила',
  '🫶': 'сердце',
  '🤲': 'прошу',
  '❌': 'нет ошибка отмена',
  '⚠️': 'внимание ошибка проблема',
  '🔔': 'уведомление колокол',
  '⏳': 'ожидание время',
  '🕒': 'время',
  '📌': 'важно закрепить',
  '📍': 'место точка',
  '🔒': 'закрыто пароль безопасность',
  '🔓': 'открыто доступ',
  '🔄': 'обновить синхронизация',
  '🧾': 'чек платеж квитанция',
  '💳': 'карта оплата платеж',
  '🛠️': 'ремонт настройка',
  '📡': 'сеть vpn подключение',
  '🧩': 'модуль часть',
  '📩': 'письмо сообщение',
  '🎉': 'праздник готово',
  '⭐': 'звезда важно',
  '🌐': 'интернет сайт',
  '🔗': 'ссылка',
  '📦': 'пакет архив',
  '💎': 'премиум',
  '🏆': 'победа',
  '🎯': 'цель',
  '🧠': 'идея',
  '📱': 'телефон мобильный',
  '💻': 'ноутбук компьютер',
  '🖥️': 'компьютер экран',
  '🎲': 'рандом',
  '👑': 'корона',
  '☕': 'кофе',
  '🍀': 'удача',
}

export function EmojiPicker({
  onPick,
  className,
  panelClassName,
  buttonClassName,
}: {
  onPick: (emoji: string) => void
  className?: string
  panelClassName?: string
  buttonClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<EmojiCategory>('recent')
  const [query, setQuery] = useState('')
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const closePicker = useCallback(() => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return
    window.requestAnimationFrame(() => searchRef.current?.focus())

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) closePicker()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closePicker()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closePicker, open])

  const items = useMemo(() => {
    const allItems = emojiCategories.flatMap((item) => item.items)
    const normalizedQuery = query.trim().toLowerCase()
    const source = normalizedQuery
      ? allItems.filter((emoji) => `${emoji} ${emojiKeywords[emoji] ?? ''}`.toLowerCase().includes(normalizedQuery))
      : emojiCategories.find((item) => item.value === category)?.items ?? []
    return Array.from(new Set(source))
  }, [category, query])

  return (
    <div ref={rootRef} className={cn('relative shrink-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'grid h-10 w-10 place-items-center rounded-full border text-slate-500 transition-colors',
          open
            ? 'border-slate-300 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-surface-800 dark:text-white'
            : 'border-slate-200 bg-white/80 hover:bg-slate-100 hover:text-slate-950 dark:border-white/10 dark:bg-surface-900 dark:hover:bg-surface-800 dark:hover:text-white',
          buttonClassName
        )}
        aria-label="Открыть emoji"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
      >
        <Smile className="h-5 w-5" />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Выбор emoji"
          className={cn('absolute bottom-12 right-0 z-40 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15 dark:border-slate-800 dark:bg-surface-900', panelClassName)}
        >
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 dark:bg-surface-950">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Поиск"
                aria-label="Поиск emoji"
              />
            </div>
            <div className="mt-2 flex gap-1 overflow-x-auto">
              {emojiCategories.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setCategory(item.value)
                    setQuery('')
                  }}
                  className={cn(
                    'min-w-fit rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    category === item.value && !query.trim()
                      ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-surface-800 dark:hover:text-white'
                  )}
                  aria-pressed={category === item.value && !query.trim()}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            <div className="grid grid-cols-8 gap-1">
              {items.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  onClick={() => {
                    onPick(emoji)
                    closePicker()
                  }}
                  className="grid h-10 w-10 place-items-center rounded-lg text-2xl transition-colors hover:bg-slate-100 dark:hover:bg-surface-800"
                  aria-label={`Вставить ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
