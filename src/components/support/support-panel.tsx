'use client'

import {
  FormEvent,
  KeyboardEvent,
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
  Timer,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { supportCategoryLabel, supportStatusLabelForRole } from '@/lib/support'

type TicketStatus = 'OPEN' | 'WAITING_ADMIN' | 'WAITING_USER' | 'CLOSED'
type SenderRole = 'USER' | 'ADMIN'
type TicketFolder = 'active' | 'need-answer' | 'answered' | 'closed'

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
  const [newTicketOpen, setNewTicketOpen] = useState(mode === 'user' && initialTickets.length === 0)
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
    return tickets.filter((ticket) => {
      if (folder === 'closed') return ticket.status === 'CLOSED'
      if (folder === 'need-answer') return needsCurrentActor(ticket, mode)
      if (folder === 'answered') return ticket.status === 'WAITING_USER'
      return ticket.status !== 'CLOSED'
    })
  }, [folder, mode, tickets])

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
        body: JSON.stringify({ message: newMessage }),
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

  return (
    <div className="grid h-[calc(100dvh-6.5rem)] min-h-[34rem] gap-3 overflow-hidden xl:h-[calc(100dvh-9rem)] xl:min-h-[38rem] xl:grid-cols-[20rem_minmax(0,1fr)]">
      <section className={cn('min-h-0 space-y-4 overflow-y-auto pr-0.5 xl:flex xl:flex-col xl:overflow-hidden', mobileChatOpen && 'hidden xl:flex')}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/70 bg-white/80 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-white/10 dark:bg-surface-900/80 dark:shadow-black/20">
          <div className="border-b border-slate-100 bg-white/70 px-3 py-3 dark:border-slate-800 dark:bg-surface-900/60">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{mode === 'admin' ? 'Обращения' : 'Диалоги'}</div>
                <div className="text-xs text-slate-500">{unreadTotal > 0 ? `${unreadTotal} новых сообщений` : 'Новых сообщений нет'}</div>
              </div>
              <div className="flex items-center gap-2">
                {unreadTotal > 0 && <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">{unreadTotal}</span>}
                {mode === 'user' && (
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-lg bg-slate-950 text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                    onClick={() => setNewTicketOpen((current) => !current)}
                    title="Новый диалог"
                    aria-label="Новый диалог"
                  >
                    <MessageSquarePlus className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            <FolderTabs folder={folder} counts={folderCounts} mode={mode} onChange={setFolder} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {mode === 'user' && newTicketOpen && (
              <NewTicketForm
                message={newMessage}
                isPending={isPending}
                onMessageChange={setNewMessage}
                onCancel={tickets.length > 0 ? () => setNewTicketOpen(false) : undefined}
                onSubmit={createTicket}
              />
            )}
            {filteredTickets.length === 0 && !newTicketOpen ? (
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
        'min-h-0 overflow-hidden rounded-lg border border-white/70 bg-white/90 shadow-xl shadow-slate-200/60 backdrop-blur dark:border-white/10 dark:bg-surface-900/90 dark:shadow-black/20',
        !mobileChatOpen && 'hidden xl:block'
      )}>
        {selected ? (
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
                        : 'Чат с поддержкой'}
                    </div>
                  </div>
                </div>
                <TicketActions selected={selected} mode={mode} isPending={isPending} onUpdateStatus={updateStatus} />
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
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/70 px-3 py-4 dark:bg-surface-950/30 sm:px-5"
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
                <div className="flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-surface-950">
                  <textarea
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
    </div>
  )
}

function NewTicketForm({
  message,
  isPending,
  onMessageChange,
  onCancel,
  onSubmit,
}: {
  message: string
  isPending: boolean
  onMessageChange: (value: string) => void
  onCancel?: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form onSubmit={onSubmit} className="mb-2 rounded-lg border border-cyan-200 bg-cyan-50/60 p-3 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/[0.06]">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-sm dark:bg-white dark:text-slate-950">
          <MessageSquarePlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Новый диалог</h2>
          <p className="text-xs text-slate-500">Опишите вопрос одним сообщением.</p>
        </div>
      </div>
      <textarea
        className="input mt-3 min-h-28 resize-none"
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }}
        placeholder="Напишите, что случилось"
        maxLength={3000}
        required
        autoFocus
      />
      <div className="mt-3 flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={isPending}>
            Отмена
          </button>
        )}
        <button className="btn-primary" disabled={isPending || message.trim().length < 5}>
          <Send className="h-4 w-4" />
          {isPending ? 'Отправляем...' : 'Отправить'}
        </button>
      </div>
    </form>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
