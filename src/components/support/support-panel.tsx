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
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  Gauge,
  Headphones,
  Inbox,
  Lock,
  MonitorSmartphone,
  MessageCircle,
  MessageSquarePlus,
  PanelRight,
  RadioTower,
  RotateCcw,
  Send,
  Search,
  Smile,
  Sparkles,
  Timer,
  UserRound,
  Wifi,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import {
  supportCategories,
  supportCategoryLabel,
  supportStatusLabelForRole,
  type SupportCategoryValue,
} from '@/lib/support'
import { emojiCategories, emojiKeywords, type EmojiCategory } from './support-emojis'
import {
  formatSupportDate,
  formatSupportPrice,
  getSupportTicketCursor,
  getUnreadCount,
  insertAtSelection,
  mergeSupportTicket,
  needsCurrentActor,
  type SupportMessage,
  type SupportPanelProps,
  type SupportTicket,
  type TicketFolder,
  type TicketStatus,
} from './support-panel-model'

const SUPPORT_LIST_REFRESH_MS = 20_000
const SUPPORT_ACTIVE_TICKET_REFRESH_MS = 5_000

function ticketMatchesFolder(ticket: SupportTicket, folder: TicketFolder, mode: 'user' | 'admin') {
  if (folder === 'closed') return ticket.status === 'CLOSED'
  if (folder === 'need-answer') return needsCurrentActor(ticket, mode)
  if (folder === 'answered') return ticket.status === 'WAITING_USER'
  return ticket.status !== 'CLOSED'
}

export function SupportPanel({
  mode,
  initialTickets,
  initialTotal = initialTickets.length,
  pageSize = 25,
  initialQuery = '',
}: SupportPanelProps) {
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null)
  const stickToBottomRef = useRef(true)
  const [tickets, setTickets] = useState(initialTickets)
  const [listLimit, setListLimit] = useState(Math.max(pageSize, initialTickets.length))
  const [listTotal, setListTotal] = useState(initialTotal)
  const [listCursor, setListCursor] = useState(
    initialTickets.length < initialTotal ? getSupportTicketCursor(initialTickets.at(-1)) : null
  )
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
  const initialActiveTicket = initialTickets.find((ticket) => ticket.status !== 'CLOSED') ?? null
  const [selectedId, setSelectedId] = useState(initialActiveTicket?.id ?? '')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    initialActiveTicket
  )
  const [folder, setFolder] = useState<TicketFolder>('active')
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [newCategory, setNewCategory] = useState<SupportCategoryValue>('connection')
  const [newTicketOpen, setNewTicketOpen] = useState(false)
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery)
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
      if (!ticketMatchesFolder(ticket, folder, mode)) return false
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

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timeout)
  }, [query])

  const fetchTicket = useCallback(async (id: string, before?: string | null) => {
    const base = mode === 'admin' ? `/api/admin/support/tickets/${id}` : `/api/support/tickets/${id}`
    const endpoint = before ? `${base}?before=${encodeURIComponent(before)}` : base
    const res = await fetch(endpoint, { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(data?.error || 'Не удалось открыть обращение')
    }
    return data.ticket as SupportTicket
  }, [mode])

  const mergeTicketList = useCallback((incoming: SupportTicket[]) => {
    setTickets((current) => {
      const currentById = new Map(current.map((ticket) => [ticket.id, ticket]))
      return incoming.map((ticket) => {
        const previous = currentById.get(ticket.id)
        return previous && previous.messages.length > ticket.messages.length
          ? { ...ticket, messages: previous.messages }
          : ticket
      })
    })
  }, [])

  const appendTicketList = useCallback((incoming: SupportTicket[]) => {
    setTickets((current) => {
      const currentById = new Map(current.map((ticket) => [ticket.id, ticket]))
      const next = [...current]
      for (const ticket of incoming) {
        const previous = currentById.get(ticket.id)
        if (previous) {
          const merged = previous.messages.length > ticket.messages.length
            ? { ...ticket, messages: previous.messages }
            : ticket
          next[next.findIndex((item) => item.id === ticket.id)] = merged
          continue
        }
        next.push(ticket)
      }
      return next
    })
  }, [])

  const fetchTicketList = useCallback(async (limit: number, cursor?: string | null) => {
    const params = new URLSearchParams(window.location.search)
    params.set('pageSize', String(limit))
    if (mode === 'admin') {
      if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim())
      else params.delete('q')
    }
    if (cursor) params.set('cursor', cursor)
    else params.set('page', '1')
    const listEndpoint = mode === 'admin'
      ? `/api/admin/support/tickets?${params.toString()}`
      : '/api/support/tickets'
    const listRes = await fetch(listEndpoint, { cache: 'no-store' })
    const listData = await listRes.json().catch(() => null)
    if (!listRes.ok || !Array.isArray(listData?.tickets)) return null
    return listData as {
      tickets: SupportTicket[]
      pagination?: { total?: number; nextCursor?: string | null }
    }
  }, [debouncedQuery, mode])

  const loadMoreTickets = useCallback(async () => {
    if (mode !== 'admin' || loadingMore || tickets.length >= listTotal || !listCursor) return
    setLoadingMore(true)
    try {
      const data = await fetchTicketList(pageSize, listCursor)
      if (!data) return
      appendTicketList(data.tickets)
      setListLimit((current) => current + data.tickets.length)
      setListCursor(data.pagination?.nextCursor ?? null)
      if (typeof data.pagination?.total === 'number') setListTotal(data.pagination.total)
    } finally {
      setLoadingMore(false)
    }
  }, [appendTicketList, fetchTicketList, listCursor, listTotal, loadingMore, mode, pageSize, tickets.length])

  useEffect(() => {
    let active = true

    async function refreshSupport() {
      if (document.visibilityState === 'hidden') return
      try {
        const listData = await fetchTicketList(listLimit)
        if (active && listData) {
          mergeTicketList(listData.tickets)
          setListCursor(listData.pagination?.nextCursor ?? null)
          if (typeof listData.pagination?.total === 'number') setListTotal(listData.pagination.total)
        }

        if (selectedId) {
          const ticket = await fetchTicket(selectedId)
          if (active && ticket) {
            setSelectedTicket((current) => current?.id === ticket.id ? mergeSupportTicket(current, ticket, true) : ticket)
            setTickets((current) => current.map((item) => item.id === ticket.id ? mergeSupportTicket(item, ticket, true) : item))
          }
        }
      } catch {
        // Quiet polling: manual actions still show errors.
      }
    }

    void refreshSupport()
    const interval = window.setInterval(() => {
      void refreshSupport()
    }, selectedId ? SUPPORT_ACTIVE_TICKET_REFRESH_MS : SUPPORT_LIST_REFRESH_MS)

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
    setDetailsOpen(false)
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

  async function loadOlderMessages() {
    const before = selected?.messagePagination?.before
    if (!selected || !before || loadingOlderMessages) return
    const container = messagesScrollRef.current
    const previousHeight = container?.scrollHeight ?? 0
    setLoadingOlderMessages(true)
    stickToBottomRef.current = false
    try {
      const ticket = await fetchTicket(selected.id, before)
      const merged = mergeSupportTicket(selected, ticket)
      setSelectedTicket(merged)
      setTickets((current) => current.map((item) => item.id === merged.id ? { ...item, ...merged } : item))
      requestAnimationFrame(() => {
        if (container) container.scrollTop += container.scrollHeight - previousHeight
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось загрузить старые сообщения')
    } finally {
      setLoadingOlderMessages(false)
    }
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
      } else if (folder === 'closed') {
        setFolder('active')
      }
    })
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.nativeEvent.isComposing) return
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

  function openNewTicket() {
    setNewTicketOpen(true)
    setMobileChatOpen(true)
    setError('')
  }

  function closeNewTicket() {
    setNewTicketOpen(false)
    setMobileChatOpen(false)
    setError('')
  }

  function changeFolder(nextFolder: TicketFolder) {
    setFolder(nextFolder)
    setMobileChatOpen(false)
    setNewTicketOpen(false)
    setError('')

    if (selected && ticketMatchesFolder(selected, nextFolder, mode)) return
    const firstTicket = tickets.find((ticket) => ticketMatchesFolder(ticket, nextFolder, mode)) ?? null
    setSelectedId(firstTicket?.id ?? '')
    setSelectedTicket(firstTicket)
  }

  return (
    <div
      className={cn(
        'grid h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] min-h-[34rem] gap-3 overflow-hidden xl:h-[calc(100dvh-6.25rem)] 2xl:gap-4',
        mode === 'admin'
          ? 'xl:h-[calc(100dvh-5.5rem)] xl:grid-cols-[20rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)_20rem]'
          : 'xl:grid-cols-[20rem_minmax(0,1fr)]'
      )}
    >
      <section className={cn('min-h-0 overflow-y-auto xl:flex xl:flex-col xl:overflow-hidden', mobileChatOpen && 'hidden xl:flex')}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_24px_70px_-44px_rgba(15,23,42,0.48)] dark:border-white/[0.09] dark:bg-white/[0.035] dark:shadow-black/20">
          <div className={cn(
            'relative overflow-hidden border-b border-slate-100/80 px-3 py-2.5 dark:border-white/[0.07] sm:px-3.5',
            mode === 'admin'
              ? 'bg-gradient-to-br from-violet-50/90 via-white to-cyan-50/70 dark:from-violet-500/[0.08] dark:via-transparent dark:to-cyan-400/[0.06]'
              : 'bg-gradient-to-br from-fuchsia-50/90 via-white to-cyan-50/80 dark:from-fuchsia-500/[0.09] dark:via-transparent dark:to-cyan-400/[0.07]'
          )}>
            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full bg-fuchsia-300/15 blur-3xl dark:bg-fuchsia-400/[0.07]" />
            {mode === 'user' ? (
              <div className="relative">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-cyan-500 text-white shadow-md shadow-fuchsia-500/15 dark:from-fuchsia-500 dark:to-cyan-400">
                    <Headphones className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-base font-semibold tracking-[-0.025em] text-slate-950 dark:text-white">Поддержка</h1>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ответим в этом чате
                    </p>
                  </div>
                  <button type="button" onClick={openNewTicket} className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white shadow-md shadow-slate-950/10 transition hover:bg-fuchsia-700 dark:bg-white dark:text-slate-950 dark:hover:bg-fuchsia-100" aria-label="Новое обращение">
                    <MessageSquarePlus className="h-4 w-4" />
                    <span className="hidden sm:inline">Новое обращение</span>
                  </button>
                  {unreadTotal > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unreadTotal}</span>}
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-500/15 dark:bg-violet-500">
                      <Inbox className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold tracking-tight text-slate-950 dark:text-white">Поддержка</div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Рабочая очередь</div>
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-1.5">
                  <QueueMetric label="Всего" value={listTotal} />
                  <QueueMetric label="Нужно ответить" value={folderCounts['need-answer']} accent={folderCounts['need-answer'] > 0} />
                </div>
              </div>
            )}
            <FolderTabs folder={folder} counts={folderCounts} mode={mode} onChange={changeFolder} />
            {(mode === 'admin' || tickets.length > 4) && (
              <label className="relative mt-2 flex items-center gap-2 rounded-xl border border-white/90 bg-white/85 px-3 py-2 shadow-sm shadow-slate-950/5 backdrop-blur dark:border-white/[0.08] dark:bg-black/15">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="sr-only">Поиск обращений</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400 sm:text-sm"
                  placeholder={mode === 'admin' ? 'Клиент, email или тема' : 'Найти обращение'}
                />
                {query && <button type="button" onClick={() => setQuery('')} className="grid h-6 w-6 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white" aria-label="Очистить поиск"><X className="h-3.5 w-3.5" /></button>}
              </label>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 pt-2.5">
            <div className="mb-2 flex items-center justify-between gap-3 px-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.11em] text-slate-400">{mode === 'admin' ? 'Обращения' : 'Ваши обращения'}</span>
              <span className="text-xs text-slate-400">{filteredTickets.length}</span>
            </div>
            <div className="space-y-1.5">
            {filteredTickets.length === 0 ? (
              <EmptyFolder folder={folder} mode={mode} onCreate={mode === 'user' ? openNewTicket : undefined} />
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
            </div>
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
        'relative min-h-0 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_24px_70px_-44px_rgba(15,23,42,0.48)] dark:border-white/[0.09] dark:bg-white/[0.035] dark:shadow-black/20',
        !mobileChatOpen && 'hidden xl:block'
      )}>
        {mode === 'user' && newTicketOpen ? (
          <NewTicketForm
            category={newCategory}
            message={newMessage}
            isPending={isPending}
            onCategoryChange={setNewCategory}
            onMessageChange={setNewMessage}
            onCancel={closeNewTicket}
            onSubmit={createTicket}
          />
        ) : selected ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-slate-100/80 bg-white/95 px-2.5 py-2 backdrop-blur dark:border-white/[0.07] dark:bg-surface-900/90 sm:px-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileChatOpen(false)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 xl:hidden"
                    aria-label="Назад к обращениям"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <CategoryIcon category={selected.category} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="min-w-0 truncate text-sm font-semibold tracking-[-0.01em] sm:text-base">{selected.subject}</h2>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500 sm:text-sm">
                      {mode === 'admin'
                        ? `${selected.user?.name || selected.user?.email || 'Пользователь'} · ${supportCategoryLabel(selected.category)}`
                        : ticketStatusDescription(selected, mode)}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {mode === 'admin' && (
                    <button
                      type="button"
                      className={cn('btn-secondary h-9 px-2.5 text-xs 2xl:hidden', detailsOpen && 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-100')}
                      onClick={() => setDetailsOpen((current) => !current)}
                      aria-expanded={detailsOpen}
                      aria-label="Клиент"
                    >
                      <UserRound className="h-4 w-4" />
                      <span className="hidden sm:inline">Клиент</span>
                    </button>
                  )}
                  {mode === 'user' && (
                    <TicketActions selected={selected} mode={mode} isPending={isPending} onUpdateStatus={updateStatus} />
                  )}
                </div>
              </div>
            </div>

            <ConversationNotice ticket={selected} mode={mode} />

            {error && (
              <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5">
                {error}
              </div>
            )}

            <div
              ref={messagesScrollRef}
              onScroll={(event) => {
                const element = event.currentTarget
                stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120
              }}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top,rgba(217,70,239,0.055),transparent_24rem),linear-gradient(to_bottom,rgba(248,250,252,0.96),white)] px-3 py-4 dark:bg-[radial-gradient(circle_at_top,rgba(217,70,239,0.07),transparent_24rem)] sm:px-5 sm:py-5"
            >
              <div className="mx-auto max-w-3xl space-y-3.5">
                {selected.messagePagination?.hasMore && (
                  <div className="flex justify-center pb-1">
                    <button
                      type="button"
                      className="btn-secondary min-h-9 px-3 py-1.5 text-xs"
                      disabled={loadingOlderMessages}
                      onClick={() => void loadOlderMessages()}
                    >
                      {loadingOlderMessages ? 'Загрузка...' : 'Показать старые сообщения'}
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-3 py-1 text-xs text-slate-400">
                  <span className="h-px flex-1 bg-slate-200/80 dark:bg-white/10" />
                  Обращение создано {formatDate(selected.createdAt)}
                  <span className="h-px flex-1 bg-slate-200/80 dark:bg-white/10" />
                </div>
                {selected.messages.map((item) => {
                  const own = mode === 'admin' ? item.senderRole === 'ADMIN' : item.senderRole === 'USER'
                  return <MessageBubble key={item.id} message={item} own={own} />
                })}
              </div>
            </div>

            <form onSubmit={sendMessage} className="border-t border-slate-100/80 bg-white/95 p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-white/[0.07] dark:bg-surface-900/90 sm:p-3">
              {selected.status === 'CLOSED' && mode === 'admin' ? (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-surface-800">
                  <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Новые сообщения недоступны
                  </span>
                  <button type="button" className="text-xs font-semibold text-violet-700 dark:text-violet-200" onClick={() => updateStatus('OPEN')}>Открыть снова</button>
                </div>
              ) : selected.status !== 'CLOSED' ? (
                <div className="space-y-2">
                  <QuickReplies mode={mode} onPick={(value) => setMessage((current) => current.trim() ? `${current.trim()}\n\n${value}` : value)} />
                  <div className="relative flex items-end gap-1.5 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-[0_12px_34px_-22px_rgba(15,23,42,0.5)] focus-within:border-fuchsia-300 focus-within:ring-4 focus-within:ring-fuchsia-500/[0.06] dark:border-white/10 dark:bg-black/20 dark:focus-within:border-fuchsia-400/30 sm:gap-2">
                    <EmojiPicker onPick={insertMessageEmoji} />
                    <textarea
                      ref={messageInputRef}
                      className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border-0 bg-transparent px-1.5 py-2.5 text-base leading-5 outline-none placeholder:text-slate-400 focus:ring-0 sm:px-2 sm:text-sm"
                      value={message}
                      onChange={(event) => {
                        setMessage(event.target.value)
                        event.currentTarget.style.height = 'auto'
                        event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 128)}px`
                      }}
                      onKeyDown={handleMessageKeyDown}
                      placeholder={mode === 'admin' ? 'Напишите понятный ответ пользователю' : 'Напишите сообщение'}
                      maxLength={3000}
                      required
                    />
                    <button type="submit" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white shadow-lg shadow-slate-950/15 transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-white dark:text-slate-950 dark:hover:bg-fuchsia-100" disabled={isPending || !message.trim()} aria-label="Отправить сообщение">
                      <Send className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                  <div className="hidden items-center justify-between px-1 text-xs text-slate-400 sm:flex">
                    <span>Ctrl + Enter, чтобы отправить</span>
                    <span className={message.length > 2700 ? 'text-amber-600' : ''}>{message.length}/3000</span>
                  </div>
                </div>
              ) : null}
            </form>

            {mode === 'admin' && detailsOpen && (
              <>
                <button
                  type="button"
                  className="absolute inset-0 z-20 bg-slate-950/15 backdrop-blur-[1px] dark:bg-black/35 2xl:hidden"
                  onClick={() => setDetailsOpen(false)}
                  aria-label="Закрыть панель"
                />
                <aside className="absolute inset-y-0 right-0 z-30 w-[min(24rem,calc(100%-1rem))] border-l border-slate-200 bg-white shadow-2xl shadow-slate-950/15 dark:border-white/10 dark:bg-surface-900 2xl:hidden">
                  <TicketSideMenu
                    selected={selected}
                    mode={mode}
                    isPending={isPending}
                    onUpdateStatus={updateStatus}
                    onClose={() => setDetailsOpen(false)}
                  />
                </aside>
              </>
            )}
          </div>
        ) : (
          <div className="grid h-full min-h-0 place-items-center bg-gradient-to-br from-fuchsia-50/45 via-white to-cyan-50/60 p-6 text-center dark:from-fuchsia-500/[0.04] dark:via-transparent dark:to-cyan-400/[0.04]">
            <div className="max-w-sm px-4 py-8">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[1.35rem] bg-white text-fuchsia-600 shadow-xl shadow-slate-950/[0.06] ring-1 ring-fuchsia-100 dark:bg-white/[0.06] dark:text-fuchsia-300 dark:ring-white/10">
                <MessageCircle className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold tracking-tight">{mode === 'admin' ? 'Выберите обращение' : 'Здесь появится диалог'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{mode === 'admin' ? 'Откройте обращение из очереди слева, чтобы ответить и проверить данные клиента.' : 'Создайте обращение, и вся переписка с поддержкой будет храниться в одном месте.'}</p>
              {mode === 'user' && <button type="button" onClick={openNewTicket} className="btn-primary mt-5"><MessageSquarePlus className="h-4 w-4" />Новое обращение</button>}
            </div>
          </div>
        )}
      </section>

      {mode === 'admin' && (
        <aside className="hidden min-h-0 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_24px_70px_-44px_rgba(15,23,42,0.48)] dark:border-white/[0.09] dark:bg-white/[0.035] 2xl:block">
          <TicketSideMenu selected={selected} mode={mode} isPending={isPending} onUpdateStatus={updateStatus} />
        </aside>
      )}
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
      <div className="border-b border-slate-100/80 bg-white/95 px-2.5 py-2 backdrop-blur dark:border-white/[0.07] dark:bg-surface-900/90 sm:px-3">
        <div className="flex items-center gap-2.5">
          <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300" onClick={onCancel} disabled={isPending} aria-label="Назад к обращениям">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-cyan-500 text-white shadow-md shadow-fuchsia-500/15 dark:from-fuchsia-500 dark:to-cyan-400">
            <MessageSquarePlus className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-[-0.01em] sm:text-base">Новое обращение</h2>
            <p className="text-xs text-slate-500">Тема и подробности проблемы</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white to-slate-50/70 p-3 dark:from-transparent dark:to-black/10 sm:p-5">
        <div className="mx-auto max-w-3xl space-y-5">
          <section aria-labelledby="new-ticket-category-label">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div id="new-ticket-category-label" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-400/10 dark:text-fuchsia-300">1</span>
                Выберите тему
              </div>
              <span className="text-xs text-slate-400">Шаг 1 из 2</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {supportCategories.map((item) => {
                const active = category === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onCategoryChange(item.value)}
                    className={cn(
                      'group flex min-h-[5.25rem] flex-col items-start justify-between rounded-2xl border p-3 text-left transition-all',
                      active
                        ? 'border-fuchsia-300 bg-gradient-to-br from-fuchsia-50 to-cyan-50 text-slate-950 shadow-md shadow-fuchsia-950/5 ring-2 ring-fuchsia-500/10 dark:border-fuchsia-400/35 dark:from-fuchsia-400/10 dark:to-cyan-400/10 dark:text-white'
                        : 'border-slate-200/80 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-fuchsia-200 hover:shadow-sm dark:border-white/[0.08] dark:bg-white/[0.025] dark:text-slate-200 dark:hover:border-fuchsia-400/25'
                    )}
                  >
                    <CategoryIcon category={item.value} compact active={active} />
                    <span className="mt-2 block text-sm font-semibold">{item.label}</span>
                  </button>
                )
              })}
            </div>
            <CategoryGuidance category={category} />
          </section>

          <section>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200">2</span>
                Опишите проблему
              </div>
              <span className={cn('text-xs', message.length > 2700 ? 'text-amber-600' : 'text-slate-400')}>{message.length}/3000</span>
            </div>
            <div className="relative flex items-start gap-1.5 rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-[0_14px_38px_-26px_rgba(15,23,42,0.5)] focus-within:border-fuchsia-300 focus-within:ring-4 focus-within:ring-fuchsia-500/[0.06] dark:border-white/10 dark:bg-black/20 sm:gap-2 sm:p-2">
              <EmojiPicker onPick={insertEmoji} />
              <textarea
                ref={messageInputRef}
                aria-label="Сообщение"
                className="min-h-40 flex-1 resize-none rounded-xl border-0 bg-transparent px-1.5 py-2.5 text-base leading-6 outline-none placeholder:text-slate-400 focus:ring-0 sm:min-h-48 sm:px-2 sm:text-sm"
                value={message}
                onChange={(event) => onMessageChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || event.nativeEvent.isComposing) return
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }}
                placeholder={ticketMessagePlaceholder(category)}
                maxLength={3000}
                required
              />
            </div>
            <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-500">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fuchsia-500" />
              Чем точнее описание, тем быстрее мы поможем. Не отправляйте пароли и данные банковской карты.
            </p>
          </section>
        </div>
      </div>

      <div className="border-t border-slate-100/80 bg-white/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-white/[0.07] dark:bg-surface-900/90 sm:p-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <span className="hidden text-xs text-slate-400 sm:block">Ctrl + Enter, чтобы отправить</span>
          <button type="submit" className="btn-primary min-h-11 w-full justify-center sm:ml-auto sm:w-auto" disabled={isPending || message.trim().length < 5}>
            <Send className="h-4 w-4" />
            {isPending ? 'Отправляем...' : 'Отправить обращение'}
          </button>
        </div>
      </div>
    </form>
  )
}

function QueueMetric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={cn(
      'flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 py-1.5',
      accent
        ? 'border-red-200 bg-red-50/90 dark:border-red-400/20 dark:bg-red-400/10'
        : 'border-white/90 bg-white/75 dark:border-white/[0.07] dark:bg-white/[0.035]'
    )}>
      <div className={cn('text-sm font-semibold tabular-nums', accent ? 'text-red-700 dark:text-red-200' : 'text-slate-950 dark:text-white')}>{value}</div>
      <div className={cn('truncate text-xs font-semibold uppercase tracking-[0.06em]', accent ? 'text-red-500 dark:text-red-300' : 'text-slate-400')}>{label}</div>
    </div>
  )
}

function CategoryIcon({ category, compact = false, active = false }: { category: string; compact?: boolean; active?: boolean }) {
  const Icon = category === 'connection'
    ? Wifi
    : category === 'payment'
      ? CreditCard
      : category === 'subscription'
        ? RadioTower
        : category === 'devices'
          ? MonitorSmartphone
          : category === 'speed'
            ? Gauge
            : CircleHelp

  return (
    <span className={cn(
      'grid shrink-0 place-items-center rounded-2xl transition-colors',
      compact ? 'h-8 w-8 rounded-xl' : 'h-9 w-9 rounded-xl',
      active
        ? 'bg-fuchsia-600 text-white shadow-sm dark:bg-fuchsia-400 dark:text-slate-950'
        : 'bg-gradient-to-br from-fuchsia-50 to-cyan-50 text-fuchsia-600 ring-1 ring-fuchsia-100/80 dark:from-fuchsia-400/10 dark:to-cyan-400/10 dark:text-fuchsia-300 dark:ring-white/[0.07]'
    )}>
      <Icon className="h-4 w-4" />
    </span>
  )
}

const categoryGuidance: Record<SupportCategoryValue, { title: string; details: string }> = {
  connection: { title: 'Что поможет разобраться', details: 'Устройство, приложение и точный текст ошибки' },
  payment: { title: 'Что поможет найти платёж', details: 'Дата, сумма и способ оплаты. Не отправляйте данные карты' },
  subscription: { title: 'Что нужно уточнить', details: 'Какой тариф или срок хотите изменить и какой результат ожидаете' },
  devices: { title: 'Что поможет с устройством', details: 'Модель устройства, система и название приложения' },
  speed: { title: 'Что поможет проверить скорость', details: 'Устройство, тип сети и когда началась проблема' },
  general: { title: 'Расскажите подробнее', details: 'Что произошло, что ожидали увидеть и что уже пробовали' },
}

function CategoryGuidance({ category }: { category: SupportCategoryValue }) {
  const guidance = categoryGuidance[category]
  return (
    <div className="mt-2.5 flex items-start gap-2.5 rounded-2xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 dark:border-amber-400/15 dark:bg-amber-400/[0.06]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
      <div className="min-w-0 text-xs leading-5">
        <span className="font-semibold text-slate-800 dark:text-slate-100">{guidance.title}: </span>
        <span className="text-slate-500 dark:text-slate-400">{guidance.details}</span>
      </div>
    </div>
  )
}

function ticketMessagePlaceholder(category: SupportCategoryValue) {
  const placeholders: Record<SupportCategoryValue, string> = {
    connection: 'Например: не подключается на iPhone, приложение показывает ошибку...',
    payment: 'Например: оплатил сегодня в 14:30, но подписка не продлилась...',
    subscription: 'Например: хочу изменить тариф или срок подписки...',
    devices: 'Например: не получается добавить устройство или открыть QR-код...',
    speed: 'Например: на Wi-Fi скорость упала вечером, проверял на двух устройствах...',
    general: 'Опишите вопрос и ожидаемый результат...',
  }
  return placeholders[category]
}

function ticketStatusDescription(ticket: SupportTicket, mode: 'user' | 'admin') {
  if (ticket.status === 'CLOSED') return 'Обращение закрыто и хранится в архиве'
  if (ticket.status === 'WAITING_ADMIN') return mode === 'user' ? 'Сообщение доставлено, ждём ответ поддержки' : 'Пользователь ждёт ответа'
  if (ticket.status === 'WAITING_USER') return mode === 'user' ? 'Поддержка ответила, проверьте диалог' : 'Ответ отправлен, ждём пользователя'
  return 'Обращение открыто'
}

function ConversationNotice({ ticket, mode }: { ticket: SupportTicket; mode: 'user' | 'admin' }) {
  const waitingForAdmin = ticket.status === 'WAITING_ADMIN'
  const waitingForUser = ticket.status === 'WAITING_USER'
  const closed = ticket.status === 'CLOSED'
  const Icon = closed ? Lock : waitingForAdmin ? Clock3 : waitingForUser ? BadgeCheck : MessageCircle
  const title = ticketStatusDescription(ticket, mode)
  const detail = closed
    ? 'Новые сообщения недоступны'
    : waitingForAdmin
      ? mode === 'admin' ? `Последнее сообщение ${formatRelativeDate(ticket.lastMessageAt)}` : 'Ответ придёт сюда, обновлять страницу не нужно'
      : waitingForUser
        ? mode === 'admin' ? 'Можно закрыть после подтверждения клиента' : 'Если вопрос решён, обращение можно закрыть'
        : 'Можно продолжить переписку ниже'

  return (
    <div className={cn(
      'flex items-start gap-2.5 border-b px-3 py-2.5 text-xs sm:px-4',
      closed
        ? 'border-slate-100 bg-slate-50 text-slate-500 dark:border-white/[0.07] dark:bg-white/[0.025] dark:text-slate-400'
        : waitingForAdmin
          ? 'border-amber-100 bg-amber-50/75 text-amber-900 dark:border-amber-400/15 dark:bg-amber-400/[0.06] dark:text-amber-100'
          : 'border-emerald-100 bg-emerald-50/70 text-emerald-900 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06] dark:text-emerald-100'
    )}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5 opacity-70">{detail}</div>
      </div>
    </div>
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
          'grid h-10 w-10 place-items-center rounded-xl border text-slate-500 transition-colors',
          open
            ? 'border-slate-300 bg-slate-100 text-slate-950 dark:border-slate-700 dark:bg-surface-800 dark:text-white'
            : 'border-transparent hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-surface-800 dark:hover:text-white'
        )}
        aria-label="Открыть emoji"
      >
        <Smile className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10 dark:border-slate-800 dark:bg-surface-900 sm:absolute sm:bottom-12 sm:left-0 sm:right-auto sm:w-[min(22rem,calc(100vw-2rem))]">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-surface-950">
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

          <div className="max-h-[40dvh] overflow-y-auto p-2 sm:max-h-60">
            <div className="grid grid-cols-8 gap-1">
              {items.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  type="button"
                  onClick={() => {
                    onPick(emoji)
                    setOpen(false)
                  }}
                  className="grid h-9 w-full place-items-center rounded-lg text-xl transition-colors hover:bg-slate-100 dark:hover:bg-surface-800"
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
    { value: 'active' as const, label: 'Активные', icon: Inbox },
    { value: 'closed' as const, label: 'Архив', icon: Archive },
  ] : [
    { value: 'need-answer' as const, label: 'Нужен ответ', icon: Timer },
    { value: 'active' as const, label: 'В работе', icon: Inbox },
    { value: 'answered' as const, label: 'Ждём клиента', icon: CheckCircle2 },
    { value: 'closed' as const, label: 'Закрытые', icon: Archive },
  ]

  return (
    <div className="relative mt-2 grid grid-cols-2 gap-1 rounded-xl border border-white/70 bg-slate-100/80 p-1 shadow-inner shadow-slate-950/[0.03] dark:border-white/[0.05] dark:bg-black/15">
      {items.map((item) => {
        const Icon = item.icon
        const active = folder === item.value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              'flex min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all',
              active
                ? 'bg-white text-fuchsia-700 shadow-sm dark:bg-white/10 dark:text-fuchsia-200'
                : 'text-slate-500 hover:bg-white/50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </span>
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] tabular-nums', active ? 'bg-fuchsia-50 text-fuchsia-700 dark:bg-black/15 dark:text-fuchsia-100' : 'bg-white/80 text-slate-500 dark:bg-white/5 dark:text-slate-400')}>
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
        'group relative w-full overflow-hidden rounded-2xl border p-3 text-left transition-all',
        active
          ? 'border-fuchsia-200 bg-gradient-to-r from-fuchsia-50/95 to-cyan-50/75 text-slate-950 shadow-sm ring-1 ring-fuchsia-500/[0.05] dark:border-fuchsia-400/25 dark:from-fuchsia-400/10 dark:to-cyan-400/[0.07] dark:text-white'
          : 'border-transparent hover:border-slate-200/80 hover:bg-slate-50/90 hover:shadow-sm dark:hover:border-white/[0.07] dark:hover:bg-white/[0.035]'
      )}
    >
      {active && <span className="absolute inset-y-4 left-0 w-[3px] rounded-full bg-gradient-to-b from-fuchsia-500 to-cyan-400" />}
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <CategoryIcon category={ticket.category} compact />
          {unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-surface-900">{Math.min(unread, 9)}{unread > 9 ? '+' : ''}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950 dark:text-white">
              {mode === 'admin' && ticket.user ? ticket.user.name || ticket.user.email : ticket.subject}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatRelativeDate(ticket.lastMessageAt)}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {mode === 'admin'
              ? ticket.user?.name ? ticket.user.email : `${supportCategoryLabel(ticket.category)} · ${ticket.subject}`
              : supportCategoryLabel(ticket.category)}
          </div>
          <div className={cn('mt-1.5 line-clamp-2 text-sm leading-5', unread > 0 ? 'font-medium text-slate-800 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400')}>
            {ticket.messages.at(-1)?.body || ticket.messages[0]?.body || 'Без сообщений'}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <TicketStatusBadge status={ticket.status} mode={mode} />
            <ChevronRight className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-fuchsia-500 dark:text-slate-600" />
          </div>
        </div>
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
    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
      {mode === 'admin' && selected.status === 'CLOSED' && (
        <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => onUpdateStatus('OPEN')} disabled={isPending}>
          <RotateCcw className="h-3.5 w-3.5" />
          Открыть снова
        </button>
      )}
      {mode === 'admin' && selected.status !== 'CLOSED' && selected.status !== 'WAITING_ADMIN' && (
        <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => onUpdateStatus('WAITING_ADMIN')} disabled={isPending}>
          <Timer className="h-3.5 w-3.5" />
          В работу
        </button>
      )}
      {mode === 'admin' && selected.status !== 'CLOSED' && selected.status !== 'WAITING_USER' && (
        <button type="button" className="btn-secondary min-h-9 px-3 text-xs" onClick={() => onUpdateStatus('WAITING_USER')} disabled={isPending}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Ждём клиента
        </button>
      )}
      {selected.status !== 'CLOSED' && (
        <button type="button" className="btn-secondary min-h-9 px-2.5 text-xs sm:px-3" onClick={() => onUpdateStatus('CLOSED')} disabled={isPending} aria-label="Закрыть обращение">
          <XCircle className="h-3.5 w-3.5" />
          <span className={mode === 'user' ? 'hidden sm:inline' : ''}>{mode === 'user' ? 'Закрыть' : 'В архив'}</span>
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
  onClose,
}: {
  selected: SupportTicket | null
  mode: 'user' | 'admin'
  isPending: boolean
  onUpdateStatus: (status: TicketStatus) => void
  onClose?: () => void
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
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-br from-cyan-50/70 via-white to-violet-50/70 px-3 py-2.5 dark:border-white/[0.08] dark:from-cyan-400/[0.05] dark:via-transparent dark:to-violet-400/[0.06]">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/80 text-cyan-700 ring-1 ring-cyan-100 dark:bg-white/[0.06] dark:text-cyan-200 dark:ring-white/10">
            <PanelRight className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight text-slate-950 dark:text-white">Клиент и аккаунт</div>
            <div className="text-xs uppercase tracking-[0.08em] text-slate-400">Контекст обращения</div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/5 dark:hover:text-white"
            onClick={onClose}
            aria-label="Закрыть данные клиента"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.025]">
          <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Обращение</div>
              <div className="mt-1 line-clamp-2 text-sm font-semibold text-slate-950 dark:text-white">{selected.subject}</div>
              <div className="mt-1 text-xs text-slate-500">{supportCategoryLabel(selected.category)} · {formatRelativeDate(selected.lastMessageAt)}</div>
            </div>
            <TicketStatusBadge status={selected.status} mode={mode} />
          </div>
        </div>
        {mode === 'admin' && selected.user && (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/55 p-3.5 dark:border-cyan-400/15 dark:bg-cyan-400/[0.05]">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-100 dark:bg-white/[0.07] dark:text-cyan-200 dark:ring-white/10">
                <UserRound className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{selected.user.name || 'Пользователь'}</div>
                <div className="truncate text-xs text-slate-500" title={selected.user.email}>{selected.user.email}</div>
                <a href={`/dashboard/admin/users?q=${encodeURIComponent(selected.user.email)}`} className="mt-1 inline-flex text-xs font-semibold text-cyan-700 hover:text-slate-950 dark:text-cyan-200 dark:hover:text-white">Открыть профиль</a>
              </div>
            </div>
            <SupportUserDiagnostics user={selected.user} />
          </>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoBlock label="Создано"><span>{formatDate(selected.createdAt)}</span></InfoBlock>
          <InfoBlock label="Сообщений"><span>{selected.messages.length}</span></InfoBlock>
        </div>
      </div>
      <div className="border-t border-slate-100 bg-white/95 p-3.5 dark:border-white/[0.08] dark:bg-surface-900/90">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Статус обращения</div>
        <TicketActions selected={selected} mode={mode} isPending={isPending} onUpdateStatus={onUpdateStatus} />
      </div>
    </div>
  )
}

function SupportUserDiagnostics({ user }: { user: NonNullable<SupportTicket['user']> }) {
  const subscription = user.subscriptions?.[0] ?? null
  const payment = user.payments?.[0] ?? null
  const syncProblems = [
    subscription?.pendingSync ? 'Подписка ждет синхронизацию' : '',
    payment?.provisioningError ? `Выдача: ${payment.provisioningError}` : '',
    payment?.remnashopSyncError ? `Remnashop: ${payment.remnashopSyncError}` : '',
  ].filter(Boolean)

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Состояние аккаунта</div>

      <div className="grid gap-2.5 text-xs">
        <DiagnosticRow label="Telegram" value={user.telegramId ? `TG ${user.telegramId}` : 'не привязан'} ok={Boolean(user.telegramId)} />
        <DiagnosticRow label="Remnashop" value={user.remnashopUserId ? `ID ${user.remnashopUserId}` : 'не связан'} ok={Boolean(user.remnashopUserId)} />
        <DiagnosticRow
          label="Remnawave"
          value={user.remnawaveUsername || (user.remnawaveId ? `ID ${user.remnawaveId}` : user.remnawaveUuid) || 'нет'}
          ok={Boolean(user.remnawaveId || user.remnawaveUsername || user.remnawaveUuid)}
          mono
        />
      </div>

      {subscription ? (
        <div className="border-t border-slate-100 pt-3 text-xs dark:border-white/10">
          <div className="text-slate-400">Подписка</div>
          <div className="font-semibold text-slate-900 dark:text-white">{subscription.plan?.name ?? 'Подписка'}</div>
          <div className="mt-1 text-slate-500">
            {subscription.status} до {formatDate(subscription.expireAt)}
          </div>
        </div>
      ) : (
        <div className="border-t border-amber-200 pt-3 text-xs text-amber-700 dark:border-amber-500/30 dark:text-amber-200">
          Активная подписка не найдена
        </div>
      )}

      {payment && (
        <div className="border-t border-slate-100 pt-3 text-xs dark:border-white/10">
          <div className="mb-1 text-slate-400">Последний платёж</div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-900 dark:text-white">{payment.plan?.name ?? 'Платеж'}</span>
            <span className={cn(
              'rounded-full px-2 py-0.5 font-semibold',
              payment.status === 'SUCCEEDED'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                : payment.status === 'PENDING'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
                  : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200'
            )}>
              {payment.status}
            </span>
          </div>
          <div className="mt-1 text-slate-500">
            {formatSupportPrice(payment.amountKopecks)} · {formatDate(payment.paidAt ?? payment.createdAt)}
          </div>
          <div className="mt-2 grid gap-1 text-slate-500">
            <span>Выдача: {payment.subscriptionProvisionedAt ? 'готово' : 'нет'}</span>
            <span>Remnashop: {payment.remnashopSyncedAt ? 'записан' : 'нет записи'}</span>
          </div>
        </div>
      )}

      {syncProblems.length > 0 && (
        <div className="rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-100">
          <div className="mb-1 font-semibold">Проблемы</div>
          <ul className="space-y-1">
            {syncProblems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-white/10">
        <a href={`/dashboard/admin/payments?q=${encodeURIComponent(user.email)}`} className="btn-secondary h-9 justify-center px-2 text-xs">
          Платежи
        </a>
        <a href="/dashboard/admin/recovery" className="btn-secondary h-9 justify-center px-2 text-xs">
          Довыдача
        </a>
      </div>
    </div>
  )
}

function DiagnosticRow({ label, value, ok, mono = false }: { label: string; value: string; ok: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={cn('truncate font-medium', ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  )
}

function QuickReplies({ mode, onPick }: { mode: 'user' | 'admin'; onPick: (value: string) => void }) {
  const replies = mode === 'admin'
    ? [
        'Проверяю и скоро вернусь с ответом.',
        'Готово, попробуйте подключиться еще раз.',
        'Пришлите, пожалуйста, скрин ошибки и модель устройства.',
        'Проверил оплату. Если доступ не появился, нажмите синхронизацию в кабинете.',
        'Закрою обращение после вашего подтверждения, что все работает.',
      ]
    : [
        'Не подключается VPN',
        'Оплата прошла, доступа нет',
        'Нужна помощь с приложением',
        'Хочу сменить устройство',
      ]

  return (
    <div className="flex items-center gap-2 overflow-hidden">
      <div className="shrink-0 text-xs font-medium text-slate-400">
        {mode === 'admin' ? 'Шаблоны' : 'Быстрый ответ'}
      </div>
      <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-0.5">
      {replies.map((reply) => (
        <button
          key={reply}
          type="button"
          onClick={() => onPick(reply)}
          className="max-w-64 shrink-0 truncate rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-cyan-50 hover:text-cyan-800 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-cyan-400/10 dark:hover:text-cyan-100"
          title={reply}
        >
          {reply}
        </button>
      ))}
      </div>
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
    <div className={cn('flex items-end gap-2', own ? 'justify-end' : 'justify-start')}>
      {!own && (
        <span className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white text-fuchsia-600 shadow-sm ring-1 ring-slate-200/80 dark:bg-white/[0.07] dark:text-fuchsia-300 dark:ring-white/10">
          {message.senderRole === 'ADMIN' ? <Headphones className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
        </span>
      )}
      <div
        className={cn(
          'max-w-[min(42rem,86%)] px-3.5 py-2.5 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.55)] ring-1 sm:max-w-[76%] sm:px-4 sm:py-3',
          own
            ? 'rounded-[1.25rem_1.25rem_0.35rem_1.25rem] bg-slate-950 text-white ring-slate-950/20 dark:bg-white dark:text-slate-950 dark:ring-white/20'
            : 'rounded-[1.25rem_1.25rem_1.25rem_0.35rem] bg-white/95 text-slate-900 ring-slate-200/90 dark:bg-white/[0.07] dark:text-white dark:ring-white/10'
        )}
      >
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</div>
        <div className={cn('mt-1.5 text-xs', own ? 'text-white/50 dark:text-slate-500' : 'text-slate-400')}>
          {message.senderRole === 'ADMIN' ? 'Поддержка' : 'Пользователь'} · {formatDate(message.createdAt)}
        </div>
      </div>
    </div>
  )
}

function EmptyFolder({ folder, mode, onCreate }: { folder: TicketFolder; mode: 'user' | 'admin'; onCreate?: () => void }) {
  const labels: Record<TicketFolder, string> = {
    active: 'Активных обращений нет',
    'need-answer': 'Новых сообщений нет',
    answered: 'Отвеченных обращений нет',
    closed: 'Архив пуст',
  }

  return (
    <div className="grid min-h-52 place-items-center px-4 py-10 text-center">
      <div>
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-fuchsia-50 to-cyan-50 text-fuchsia-500 ring-1 ring-fuchsia-100/80 dark:from-fuchsia-400/10 dark:to-cyan-400/10 dark:text-fuchsia-300 dark:ring-white/[0.07]">
          {folder === 'need-answer' ? <BadgeCheck className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        </div>
        <div className="font-medium">{labels[folder]}</div>
        <div className="mt-1 text-sm text-slate-500">{mode === 'user' && folder === 'active' ? 'Если нужна помощь, создайте новое обращение.' : 'Здесь появятся подходящие обращения.'}</div>
        {onCreate && folder === 'active' && <button type="button" onClick={onCreate} className="btn-secondary mt-4 min-h-10 px-3 text-xs"><MessageSquarePlus className="h-4 w-4" />Новое обращение</button>}
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

function formatDate(value: string) {
  return formatSupportDate(value)
}

function formatRelativeDate(value: string) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return formatDate(value)

  const diffMs = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'сейчас'
  if (minutes < 60) return `${minutes} мин`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} дн`
  return formatDate(value)
}
