'use client'

import {
  FormEvent,
  KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Inbox,
  LifeBuoy,
  Lock,
  MessageCircle,
  MessageSquarePlus,
  Send,
  Search,
  Smile,
  Tag,
  Timer,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  supportCategories,
  supportCategoryDescription,
  supportCategoryLabel,
  supportStatusLabelForRole,
  type SupportCategoryValue,
} from '@/lib/support'

type TicketStatus = 'OPEN' | 'WAITING_ADMIN' | 'WAITING_USER' | 'CLOSED'
type SenderRole = 'USER' | 'ADMIN'
type TicketFolder = 'active' | 'need-answer' | 'answered' | 'closed'
type EmojiCategory = 'recent' | 'people' | 'signals' | 'objects'

const emojiCategories: Array<{ value: EmojiCategory; label: string; items: string[] }> = [
  { value: 'recent', label: 'Недавние', items: ['👍', '🙏', '🔥', '🎁', '✅', '⚡', '🚀', '💬', '👀', '👇'] },
  { value: 'people', label: 'Смайлы', items: ['😀', '😁', '😄', '🙂', '😊', '😉', '😎', '🤔', '😕', '😔', '😅', '😂', '😍', '🤝', '🙌', '👌', '👋', '💪'] },
  { value: 'signals', label: 'Статусы', items: ['✅', '❌', '⚠️', '🔔', '⏳', '🕒', '📌', '📍', '🔒', '🔓', '🔄', '🧾', '💳', '🛠️', '📡', '🧩'] },
  { value: 'objects', label: 'Разное', items: ['🎁', '🎉', '⭐', '🔥', '⚡', '🚀', '🌐', '🔗', '📦', '💎', '🏆', '🎯', '🧠', '📱', '💻', '🖥️'] },
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
  '😁': 'улыбка радость',
  '😄': 'радость',
  '🙂': 'улыбка нормально',
  '😊': 'приятно спасибо',
  '😉': 'ок подмигивание',
  '😎': 'круто',
  '🤔': 'думаю вопрос',
  '😕': 'непонятно проблема',
  '😔': 'грусть',
  '😅': 'неловко',
  '😂': 'смех',
  '😍': 'супер',
  '🤝': 'договорились помощь',
  '🙌': 'ура готово',
  '👌': 'ок',
  '👋': 'привет',
  '💪': 'сила',
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
}

interface SupportMessage {
  id: string
  body: string
  senderRole: SenderRole
  createdAt: string
  sender?: {
    email: string
    name: string | null
  } | null
}

interface SupportTicket {
  id: string
  subject: string
  category: string
  status: TicketStatus
  userUnreadCount: number
  adminUnreadCount: number
  lastMessageAt: string
  createdAt: string
  closedAt: string | null
  user?: {
    id: string
    email: string
    name: string | null
    remnawaveUsername?: string | null
  }
  messages: SupportMessage[]
}

interface SupportPanelProps {
  mode: 'user' | 'admin'
  initialTickets: SupportTicket[]
  initialTotal?: number
  pageSize?: number
}

export function SupportPanel({
  mode,
  initialTickets,
  initialTotal = initialTickets.length,
  pageSize = 25,
}: SupportPanelProps) {
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null)
  const stickToBottomRef = useRef(true)
  const [tickets, setTickets] = useState(initialTickets)
  const [listLimit, setListLimit] = useState(Math.max(pageSize, initialTickets.length))
  const [listTotal, setListTotal] = useState(initialTotal)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectedId, setSelectedId] = useState(initialTickets.find((ticket) => ticket.status !== 'CLOSED')?.id ?? initialTickets[0]?.id ?? '')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    initialTickets.find((ticket) => ticket.status !== 'CLOSED') ?? initialTickets[0] ?? null
  )
  const [folder, setFolder] = useState<TicketFolder>('active')
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [newCategory, setNewCategory] = useState<SupportCategoryValue>('connection')
  const [newTicketOpen, setNewTicketOpen] = useState(mode === 'user' && initialTickets.length === 0)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const selected = selectedTicket && selectedTicket.id === selectedId
    ? selectedTicket
    : tickets.find((ticket) => ticket.id === selectedId) ?? null

  const folderCounts = useMemo(() => {
    return {
      active: tickets.filter((ticket) => ticket.status !== 'CLOSED').length,
      'need-answer': tickets.filter((ticket) => needsCurrentActor(ticket, mode)).length,
      answered: tickets.filter((ticket) => ticket.status === 'WAITING_USER').length,
      closed: tickets.filter((ticket) => ticket.status === 'CLOSED').length,
    }
  }, [mode, tickets])

  const filteredTickets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return tickets.filter((ticket) => {
      const matchesFolder =
        folder === 'closed'
          ? ticket.status === 'CLOSED'
          : folder === 'need-answer'
            ? needsCurrentActor(ticket, mode)
            : folder === 'answered'
              ? ticket.status === 'WAITING_USER'
              : ticket.status !== 'CLOSED'

      if (!matchesFolder) return false
      if (!normalizedQuery) return true

      const haystack = [
        ticket.subject,
        supportCategoryLabel(ticket.category),
        ticket.user?.email,
        ticket.user?.name,
        ticket.user?.remnawaveUsername,
        ticket.messages.at(-1)?.body,
      ].filter(Boolean).join(' ').toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [folder, mode, query, tickets])

  const unreadTotal = useMemo(() => {
    return tickets.reduce((sum, ticket) => sum + getUnreadCount(ticket, mode), 0)
  }, [mode, tickets])

  const fetchTicket = useCallback(async (id: string) => {
    const endpoint = mode === 'admin' ? `/api/admin/support/tickets/${id}` : `/api/support/tickets/${id}`
    const res = await fetch(endpoint, { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(data?.error || 'Не удалось открыть обращение')
    }
    return data.ticket as SupportTicket
  }, [mode])

  const mergeTicketList = useCallback((incoming: SupportTicket[]) => {
    setTickets((current) =>
      incoming.map((ticket) => {
        const previous = current.find((item) => item.id === ticket.id)
        return previous && previous.messages.length > ticket.messages.length
          ? { ...ticket, messages: previous.messages }
          : ticket
      })
    )
  }, [])

  const fetchTicketList = useCallback(async (limit: number) => {
    const params = new URLSearchParams(window.location.search)
    params.set('page', '1')
    params.set('pageSize', String(limit))
    const listEndpoint = mode === 'admin'
      ? `/api/admin/support/tickets?${params.toString()}`
      : '/api/support/tickets'
    const listRes = await fetch(listEndpoint, { cache: 'no-store' })
    const listData = await listRes.json().catch(() => null)
    if (!listRes.ok || !Array.isArray(listData?.tickets)) return null
    return listData as {
      tickets: SupportTicket[]
      pagination?: { total?: number }
    }
  }, [mode])

  const loadMoreTickets = useCallback(async () => {
    if (mode !== 'admin' || loadingMore || tickets.length >= listTotal) return
    const nextLimit = Math.min(listTotal, listLimit + pageSize)
    setLoadingMore(true)
    try {
      const data = await fetchTicketList(nextLimit)
      if (!data) return
      mergeTicketList(data.tickets)
      setListLimit(nextLimit)
      if (typeof data.pagination?.total === 'number') setListTotal(data.pagination.total)
    } finally {
      setLoadingMore(false)
    }
  }, [fetchTicketList, listLimit, listTotal, loadingMore, mergeTicketList, mode, pageSize, tickets.length])

  useEffect(() => {
    let active = true

    async function refreshSupport() {
      if (document.visibilityState === 'hidden') return
      try {
        const listData = await fetchTicketList(listLimit)
        if (active && listData) {
          mergeTicketList(listData.tickets)
          if (typeof listData.pagination?.total === 'number') setListTotal(listData.pagination.total)
        }

        if (selectedId) {
          const ticket = await fetchTicket(selectedId)
          if (active && ticket) {
            setSelectedTicket(ticket)
            setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, ...ticket } : item))
          }
        }
      } catch {
        // Quiet polling: manual actions still show errors.
      }
    }

    void refreshSupport()
    const interval = window.setInterval(() => {
      void refreshSupport()
    }, 2500)

    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') void refreshSupport()
    }
    document.addEventListener('visibilitychange', refreshOnVisible)

    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshOnVisible)
    }
  }, [fetchTicket, fetchTicketList, listLimit, mergeTicketList, selectedId])

  useEffect(() => {
    const marker = loadMoreRef.current
    if (!marker || mode !== 'admin' || tickets.length >= listTotal) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMoreTickets()
      },
      { rootMargin: '160px 0px' }
    )
    observer.observe(marker)
    return () => observer.disconnect()
  }, [listTotal, loadMoreTickets, mode, tickets.length])

  useEffect(() => {
    const container = messagesScrollRef.current
    if (!container) return

    if (stickToBottomRef.current) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
      })
    }
  }, [selected?.id, selected?.messages.length])

  async function loadTicket(id: string) {
    setSelectedId(id)
    setNewTicketOpen(false)
    setMobileChatOpen(true)
    stickToBottomRef.current = true
    setError('')

    let ticket: SupportTicket
    try {
      ticket = await fetchTicket(id)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось открыть обращение')
      return
    }

    setSelectedTicket(ticket)
    setTickets((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...ticket,
              messages: ticket.messages.length ? ticket.messages : item.messages,
            }
          : item
      )
    )
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    startTransition(async () => {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ category: newCategory, message: newMessage }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Не удалось создать обращение')
        return
      }
      setTickets((current) => [data.ticket, ...current])
      setSelectedId(data.ticket.id)
      setSelectedTicket(data.ticket)
      setFolder('active')
      setMobileChatOpen(true)
      setNewMessage('')
      setNewCategory('connection')
      setNewTicketOpen(false)
      stickToBottomRef.current = true
    })
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!selected || !message.trim()) return
    setError('')

    const messageToSend = message.trim()
    const temporaryId = `pending-${Date.now()}`
    const optimisticMessage: SupportMessage = {
      id: temporaryId,
      body: messageToSend,
      senderRole: mode === 'admin' ? 'ADMIN' : 'USER',
      createdAt: new Date().toISOString(),
    }
    const optimisticTicket: SupportTicket = {
      ...selected,
      status: mode === 'admin' ? 'WAITING_USER' : 'WAITING_ADMIN',
      closedAt: null,
      lastMessageAt: optimisticMessage.createdAt,
      messages: [...selected.messages, optimisticMessage],
    }
    setMessage('')
    stickToBottomRef.current = true
    setSelectedTicket(optimisticTicket)
    setTickets((current) => current.map((ticket) => ticket.id === selected.id ? { ...ticket, ...optimisticTicket } : ticket))

    startTransition(async () => {
      const endpoint = mode === 'admin' ? `/api/admin/support/tickets/${selected.id}` : `/api/support/tickets/${selected.id}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: messageToSend }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setMessage(messageToSend)
        setSelectedTicket(selected)
        setTickets((current) => current.map((ticket) => ticket.id === selected.id ? { ...ticket, ...selected } : ticket))
        setError(data?.error || 'Не удалось отправить сообщение')
        return
      }
      const nextStatus: TicketStatus = mode === 'admin' ? 'WAITING_USER' : 'WAITING_ADMIN'
      const updated = {
        ...selected,
        status: nextStatus,
        closedAt: null,
        lastMessageAt: data.message.createdAt,
        messages: optimisticTicket.messages.map((item) => item.id === temporaryId ? data.message : item),
      }
      setSelectedTicket(updated)
      setTickets((current) => current.map((ticket) => ticket.id === updated.id ? { ...ticket, ...updated } : ticket))
    })
  }

  async function updateStatus(status: TicketStatus) {
    if (!selected) return
    setError('')

    startTransition(async () => {
      const endpoint = mode === 'admin' ? `/api/admin/support/tickets/${selected.id}` : `/api/support/tickets/${selected.id}`
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error || 'Не удалось обновить статус')
        return
      }
      const updated = {
        ...selected,
        ...(data?.ticket ?? {}),
        status,
        closedAt: status === 'CLOSED' ? new Date().toISOString() : null,
      }
      setSelectedTicket(updated)
      setTickets((current) => current.map((ticket) => ticket.id === updated.id ? { ...ticket, ...updated } : ticket))
      if (status === 'CLOSED') {
        setFolder('closed')
      }
    })
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void sendMessage()
  }

  function insertMessageEmoji(emoji: string) {
    const input = messageInputRef.current
    if (!input) {
      setMessage((current) => `${current}${emoji}`.slice(0, 3000))
      return
    }

    const next = insertAtSelection(message, emoji, input.selectionStart, input.selectionEnd, 3000)
    setMessage(next.value)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(next.cursor, next.cursor)
    })
  }

  return (
    <div
      className={cn(
        'grid h-[calc(100dvh-5.5rem)] min-h-[32rem] gap-3 overflow-hidden xl:h-[calc(100dvh-7rem)] xl:min-h-[36rem]',
        mode === 'admin'
          ? 'xl:grid-cols-[19rem_minmax(0,1fr)_15rem]'
          : 'xl:grid-cols-[19rem_minmax(0,1fr)]'
      )}
    >
      <section className={cn('min-h-0 overflow-y-auto pr-0.5 xl:flex xl:flex-col xl:overflow-hidden', mobileChatOpen && 'hidden xl:flex')}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/70 bg-white/90 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-white/10 dark:bg-surface-900/80 dark:shadow-black/20">
          <div className="border-b border-slate-100 bg-white/80 px-3 py-3 dark:border-slate-800 dark:bg-surface-900/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{mode === 'admin' ? 'Очередь' : 'Поддержка'}</div>
                <div className="text-xs text-slate-500">
                  {unreadTotal > 0 ? `${unreadTotal} новых сообщений` : mode === 'admin' ? 'Все обращения под рукой' : 'Выберите диалог или создайте новый'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unreadTotal > 0 && <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">{unreadTotal}</span>}
                {mode === 'user' && (
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                    onClick={() => {
                      setNewTicketOpen(true)
                      setMobileChatOpen(true)
                      setError('')
                    }}
                    title="Новое обращение"
                    aria-label="Новое обращение"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <FolderTabs folder={folder} counts={folderCounts} mode={mode} onChange={setFolder} />
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-surface-950">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder={mode === 'admin' ? 'Поиск по email, теме или тексту' : 'Найти диалог'}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {mode === 'user' && (
              <button
                type="button"
                onClick={() => {
                  setNewTicketOpen(true)
                  setMobileChatOpen(true)
                  setError('')
                }}
                className={cn(
                  'mb-1.5 flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all',
                  newTicketOpen
                    ? 'border-cyan-200 bg-cyan-50 text-slate-950 shadow-sm dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:bg-cyan-50/60 dark:border-slate-800 dark:bg-surface-950 dark:text-slate-200'
                )}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 dark:bg-white dark:text-slate-950">
                  <MessageSquarePlus className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">Написать в поддержку</span>
                  <span className="block truncate text-xs text-slate-500">Выберите тему и опишите проблему</span>
                </span>
              </button>
            )}
            {filteredTickets.length === 0 ? (
              <EmptyFolder folder={folder} />
            ) : (
              filteredTickets.map((ticket) => (
                <TicketListItem
                  key={ticket.id}
                  ticket={ticket}
                  mode={mode}
                  active={selectedId === ticket.id}
                  onClick={() => void loadTicket(ticket.id)}
                />
              ))
            )}
            {mode === 'admin' && (
              <div ref={loadMoreRef} className="flex flex-col items-center gap-2 px-2 py-3">
                <div className="text-xs text-slate-500">
                  Показано {tickets.length} из {listTotal}
                </div>
                {tickets.length < listTotal && (
                  <button
                    type="button"
                    className="btn-secondary min-h-9 px-3 text-xs"
                    onClick={() => void loadMoreTickets()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Загружаем...' : 'Показать ещё'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={cn(
        'min-h-0 overflow-hidden rounded-lg border border-white/70 bg-white/95 shadow-xl shadow-slate-200/60 backdrop-blur dark:border-white/10 dark:bg-surface-900/90 dark:shadow-black/20',
        !mobileChatOpen && 'hidden xl:block'
      )}>
        {mode === 'user' && newTicketOpen ? (
          <NewTicketForm
            category={newCategory}
            message={newMessage}
            isPending={isPending}
            onCategoryChange={setNewCategory}
            onMessageChange={setNewMessage}
            onCancel={tickets.length > 0 ? () => {
              setNewTicketOpen(false)
              setMobileChatOpen(false)
            } : undefined}
            onSubmit={createTicket}
          />
        ) : selected ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-slate-100 bg-white/95 px-3 py-3 dark:border-slate-800 dark:bg-surface-900/95 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileChatOpen(false)}
                    className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 xl:hidden"
                    aria-label="Назад к обращениям"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate text-base font-semibold tracking-tight sm:text-lg">{selected.subject}</h2>
                      <TicketStatusBadge status={selected.status} mode={mode} />
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">
                      {mode === 'admin'
                        ? `${supportCategoryLabel(selected.category)}${selected.user ? ` · ${selected.user.email}` : ''}`
                        : supportCategoryDescription(selected.category)}
                    </div>
                  </div>
                </div>
                <div className="xl:hidden">
                  <TicketActions selected={selected} mode={mode} isPending={isPending} onUpdateStatus={updateStatus} />
                </div>
              </div>
            </div>

            {error && (
              <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5">
                {error}
              </div>
            )}

            <div
              ref={messagesScrollRef}
              onScroll={(event) => {
                const element = event.currentTarget
                stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/60 px-3 py-4 dark:bg-surface-950/30 sm:px-5"
            >
              <div className="mx-auto max-w-3xl space-y-3">
                {selected.messages.map((item) => {
                  const own = mode === 'admin' ? item.senderRole === 'ADMIN' : item.senderRole === 'USER'
                  return <MessageBubble key={item.id} message={item} own={own} />
                })}
              </div>
            </div>

            <form onSubmit={sendMessage} className="border-t border-slate-100 bg-white/95 p-2.5 dark:border-slate-800 dark:bg-surface-900/95 sm:p-3">
              {selected.status === 'CLOSED' ? (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-surface-800">
                  <Lock className="h-4 w-4" />
                  Обращение закрыто и хранится в архиве
                </div>
              ) : (
                <div className="space-y-2">
                  <QuickReplies mode={mode} onPick={(value) => setMessage(value)} />
                  <div className="relative flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-surface-950">
                    <EmojiPicker onPick={insertMessageEmoji} />
                    <textarea
                      ref={messageInputRef}
                      className="max-h-32 min-h-10 flex-1 resize-none rounded-md border-0 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-slate-400 focus:ring-0"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={handleMessageKeyDown}
                      placeholder={mode === 'admin' ? 'Ответ пользователю' : 'Ваше сообщение'}
                      maxLength={3000}
                      required
                    />
                    <button className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-slate-950" disabled={isPending || !message.trim()} aria-label="Отправить сообщение">
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        ) : (
          <div className="grid min-h-[36rem] place-items-center p-8 text-center">
            <div>
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <LifeBuoy className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold">Выберите обращение</h2>
              <p className="mt-2 max-w-sm text-sm text-slate-500">Здесь появится переписка.</p>
            </div>
          </div>
        )}
      </section>

      <aside className={cn(
        'hidden min-h-0 overflow-hidden rounded-lg border border-white/70 bg-white/90 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-white/10 dark:bg-surface-900/80 dark:shadow-black/20',
        mode === 'admin' && 'xl:block'
      )}>
        <TicketSideMenu selected={selected} mode={mode} isPending={isPending} onUpdateStatus={updateStatus} />
      </aside>
    </div>
  )
}

function NewTicketForm({
  category,
  message,
  isPending,
  onCategoryChange,
  onMessageChange,
  onCancel,
  onSubmit,
}: {
  category: SupportCategoryValue
  message: string
  isPending: boolean
  onCategoryChange: (value: SupportCategoryValue) => void
  onMessageChange: (value: string) => void
  onCancel?: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null)

  function insertEmoji(emoji: string) {
    const input = messageInputRef.current
    if (!input) {
      onMessageChange(`${message}${emoji}`.slice(0, 3000))
      return
    }

    const next = insertAtSelection(message, emoji, input.selectionStart, input.selectionEnd, 3000)
    onMessageChange(next.value)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(next.cursor, next.cursor)
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-slate-100 bg-white/95 px-4 py-4 dark:border-slate-800 dark:bg-surface-900/95 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-200 dark:ring-cyan-400/20">
              <MessageSquarePlus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight">Новое обращение</h2>
              <p className="text-sm text-slate-500">Выберите тему и напишите, что случилось.</p>
            </div>
          </div>
          {onCancel && (
            <button type="button" className="btn-secondary hidden sm:inline-flex" onClick={onCancel} disabled={isPending}>
              Отмена
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Tag className="h-3.5 w-3.5" />
            В чем проблема
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {supportCategories.map((item) => {
              const active = category === item.value
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onCategoryChange(item.value)}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-all',
                    active
                      ? 'border-slate-950 bg-slate-950 text-white shadow-md shadow-slate-950/10 dark:border-white dark:bg-white dark:text-slate-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:bg-cyan-50/40 dark:border-slate-800 dark:bg-surface-950 dark:text-slate-200 dark:hover:border-cyan-400/30'
                  )}
                >
                  <span className="block text-base font-semibold">{item.label}</span>
                  <span className={cn('mt-1 line-clamp-2 block text-xs leading-relaxed', active ? 'text-white/70 dark:text-slate-600' : 'text-slate-500')}>
                    {item.description}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Сообщение</div>
          <div className="relative flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-surface-950">
            <EmojiPicker onPick={insertEmoji} />
            <textarea
              ref={messageInputRef}
              className="min-h-44 flex-1 resize-none rounded-md border-0 bg-transparent px-2 py-2 text-base outline-none placeholder:text-slate-400 focus:ring-0 sm:text-sm"
              value={message}
              onChange={(event) => onMessageChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }}
              placeholder="Например: не подключается на iPhone, приложение пишет ошибку..."
              maxLength={3000}
              required
              autoFocus
            />
          </div>
          <div className="mt-2 text-xs text-slate-500">Enter отправит обращение, Shift + Enter добавит новую строку.</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white/95 p-3 dark:border-slate-800 dark:bg-surface-900/95 sm:p-4">
        <div className="text-xs text-slate-400">{message.trim().length}/3000</div>
        <div className="flex justify-end gap-2">
          {onCancel && (
            <button type="button" className="btn-secondary sm:hidden" onClick={onCancel} disabled={isPending}>
              Отмена
            </button>
          )}
          <button className="btn-primary" disabled={isPending || message.trim().length < 5}>
            <Send className="h-4 w-4" />
            {isPending ? 'Отправляем...' : 'Отправить'}
          </button>
        </div>
      </div>
    </form>
  )
}

function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<EmojiCategory>('recent')
  const [query, setQuery] = useState('')

  const items = useMemo(() => {
    const allItems = emojiCategories.flatMap((item) => item.items)
    const normalizedQuery = query.trim().toLowerCase()
    const source = normalizedQuery
      ? allItems.filter((emoji) => `${emoji} ${emojiKeywords[emoji] ?? ''}`.toLowerCase().includes(normalizedQuery))
      : emojiCategories.find((item) => item.value === category)?.items ?? []
    return Array.from(new Set(source))
  }, [category, query])

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'grid h-10 w-10 place-items-center rounded-lg border text-slate-500 transition-colors',
          open
            ? 'border-slate-300 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-surface-800 dark:text-white'
            : 'border-transparent hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-surface-800 dark:hover:text-white'
        )}
        aria-label="Открыть emoji"
      >
        <Smile className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 z-30 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl shadow-slate-950/15 dark:border-slate-800 dark:bg-surface-900">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 dark:bg-surface-950">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Поиск"
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
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-2">
            <div className="grid grid-cols-8 gap-1">
              {items.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  onClick={() => {
                    onPick(emoji)
                    setOpen(false)
                  }}
                  className="grid h-9 w-9 place-items-center rounded-lg text-xl transition-colors hover:bg-slate-100 dark:hover:bg-surface-800"
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

function FolderTabs({
  folder,
  counts,
  mode,
  onChange,
}: {
  folder: TicketFolder
  counts: Record<TicketFolder, number>
  mode: 'user' | 'admin'
  onChange: (folder: TicketFolder) => void
}) {
  const items = mode === 'user' ? [
    { value: 'active' as const, label: 'Диалоги', icon: Inbox },
    { value: 'closed' as const, label: 'Архив', icon: Archive },
  ] : [
    { value: 'active' as const, label: 'Активные', icon: Inbox },
    { value: 'need-answer' as const, label: mode === 'admin' ? 'Новые' : 'Ответы', icon: Timer },
    { value: 'answered' as const, label: 'Отвеченные', icon: CheckCircle2 },
    { value: 'closed' as const, label: 'Архив', icon: Archive },
  ]

  return (
    <div className={cn('mt-3 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 dark:bg-white/5')}>
      {items.map((item) => {
        const Icon = item.icon
        const active = folder === item.value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              'flex min-w-fit flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              active
                ? 'bg-white text-slate-950 shadow-sm dark:bg-surface-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </span>
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/15 dark:bg-slate-950/10' : 'bg-slate-100 dark:bg-slate-800')}>
              {counts[item.value]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TicketListItem({
  ticket,
  mode,
  active,
  onClick,
}: {
  ticket: SupportTicket
  mode: 'user' | 'admin'
  active: boolean
  onClick: () => void
}) {
  const unread = getUnreadCount(ticket, mode)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full rounded-md border px-3 py-2.5 text-left transition-all',
        active
          ? 'border-slate-300 bg-slate-50 shadow-sm shadow-slate-200/60 ring-1 ring-slate-200 dark:border-slate-700 dark:bg-surface-800 dark:ring-slate-700'
          : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-surface-800'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
            <div className="truncate font-medium">{ticket.subject}</div>
          </div>
          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {mode === 'admin'
              ? `${ticket.user ? `${ticket.user.email} · ` : ''}${supportCategoryLabel(ticket.category)}`
              : formatDate(ticket.lastMessageAt)}
          </div>
        </div>
        <TicketStatusBadge status={ticket.status} mode={mode} active={active} />
      </div>
      <div className="mt-1 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">
        {ticket.messages.at(-1)?.body || ticket.messages[0]?.body || 'Без сообщений'}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-400">
          {formatDate(ticket.lastMessageAt)}
        </div>
        {unread > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-200">
            {unread}
          </span>
        )}
      </div>
    </button>
  )
}

function TicketActions({
  selected,
  mode,
  isPending,
  onUpdateStatus,
}: {
  selected: SupportTicket
  mode: 'user' | 'admin'
  isPending: boolean
  onUpdateStatus: (status: TicketStatus) => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2">
      {mode === 'admin' && selected.status === 'CLOSED' && (
        <button className="btn-secondary" onClick={() => onUpdateStatus('OPEN')} disabled={isPending}>
          <CheckCircle2 className="h-4 w-4" />
          Открыть
        </button>
      )}
      {selected.status !== 'CLOSED' && (
        <button className="btn-secondary" onClick={() => onUpdateStatus('CLOSED')} disabled={isPending}>
          <XCircle className="h-4 w-4" />
          В архив
        </button>
      )}
    </div>
  )
}

function TicketSideMenu({
  selected,
  mode,
  isPending,
  onUpdateStatus,
}: {
  selected: SupportTicket | null
  mode: 'user' | 'admin'
  isPending: boolean
  onUpdateStatus: (status: TicketStatus) => void
}) {
  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-5 text-center text-sm text-slate-500">
        <MessageCircle className="mb-3 h-6 w-6 text-slate-300" />
        Выберите обращение
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Карточка</div>
        <div className="mt-2 line-clamp-2 text-sm font-semibold text-slate-950 dark:text-white">{selected.subject}</div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-surface-950">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-400">Статус</span>
            <TicketStatusBadge status={selected.status} mode={mode} />
          </div>
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">{supportCategoryLabel(selected.category)}</div>
        </div>
        {mode === 'admin' && selected.user && (
          <>
            <InfoBlock label="Пользователь">
              <span className="break-all">{selected.user.email}</span>
            </InfoBlock>
            {selected.user.remnawaveUsername && (
              <InfoBlock label="Remnawave">
                <span className="break-all">{selected.user.remnawaveUsername}</span>
              </InfoBlock>
            )}
          </>
        )}
        <InfoBlock label="Создано">
          <span>{formatDate(selected.createdAt)}</span>
        </InfoBlock>
        <InfoBlock label="Сообщений">
          <span>{selected.messages.length}</span>
        </InfoBlock>
      </div>
      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        <TicketActions selected={selected} mode={mode} isPending={isPending} onUpdateStatus={onUpdateStatus} />
      </div>
    </div>
  )
}

function QuickReplies({ mode, onPick }: { mode: 'user' | 'admin'; onPick: (value: string) => void }) {
  const replies = mode === 'admin'
    ? [
        'Проверяю и скоро вернусь с ответом.',
        'Готово, попробуйте подключиться еще раз.',
        'Пришлите, пожалуйста, скрин ошибки и модель устройства.',
      ]
    : [
        'Не подключается VPN',
        'Оплата прошла, доступа нет',
        'Нужна помощь с приложением',
      ]

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5">
      {replies.map((reply) => (
        <button
          key={reply}
          type="button"
          onClick={() => onPick(reply)}
          className="min-w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800 dark:border-slate-800 dark:bg-white/5 dark:text-slate-300 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-100"
        >
          {reply}
        </button>
      ))}
    </div>
  )
}

function InfoBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-400">{label}</div>
      <div className="text-sm text-slate-700 dark:text-slate-200">{children}</div>
    </div>
  )
}

function MessageBubble({ message, own }: { message: SupportMessage; own: boolean }) {
  return (
    <div className={cn('flex', own ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[min(42rem,88%)] rounded-lg px-4 py-3 shadow-sm ring-1',
          own
            ? 'bg-slate-950 text-white shadow-slate-950/10 ring-slate-950/10 dark:bg-white dark:text-slate-950 dark:ring-white/20'
            : 'bg-white text-slate-900 ring-slate-200 dark:bg-surface-800 dark:text-white dark:ring-slate-700'
        )}
      >
        <div className={cn('mb-1 text-xs', own ? 'text-white/55 dark:text-slate-950/55' : 'text-slate-500')}>
          {message.senderRole === 'ADMIN' ? 'Поддержка' : 'Пользователь'} · {formatDate(message.createdAt)}
        </div>
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</div>
      </div>
    </div>
  )
}

function EmptyFolder({ folder }: { folder: TicketFolder }) {
  const labels: Record<TicketFolder, string> = {
    active: 'Активных обращений нет',
    'need-answer': 'Новых сообщений нет',
    answered: 'Отвеченных обращений нет',
    closed: 'Архив пуст',
  }

  return (
    <div className="grid min-h-48 place-items-center px-4 py-10 text-center">
      <div>
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-lg bg-slate-50 text-slate-400 dark:bg-surface-800">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div className="font-medium">{labels[folder]}</div>
        <div className="mt-1 text-sm text-slate-500">Здесь появятся подходящие обращения.</div>
      </div>
    </div>
  )
}

function TicketStatusBadge({
  status,
  mode,
  active = false,
}: {
  status: TicketStatus
  mode: 'user' | 'admin'
  active?: boolean
}) {
  const className =
    status === 'CLOSED'
      ? 'badge-disabled'
      : status === 'WAITING_ADMIN'
        ? 'badge-limited'
        : status === 'WAITING_USER'
          ? 'badge-active'
          : 'badge-limited'

  return (
    <span className={cn(className, 'whitespace-nowrap', active && 'bg-white/15 text-white ring-1 ring-white/20 dark:bg-slate-950/10 dark:text-slate-950 dark:ring-slate-950/20')}>
      {supportStatusLabelForRole(status, mode)}
    </span>
  )
}

function getUnreadCount(ticket: SupportTicket, mode: 'user' | 'admin') {
  return mode === 'admin' ? ticket.adminUnreadCount : ticket.userUnreadCount
}

function needsCurrentActor(ticket: SupportTicket, mode: 'user' | 'admin') {
  if (mode === 'admin') return ticket.status === 'WAITING_ADMIN'
  return ticket.userUnreadCount > 0 || ticket.status === 'WAITING_USER'
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
