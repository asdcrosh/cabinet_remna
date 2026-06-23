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
import { useRouter } from 'next/navigation'
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
import { supportCategoryLabel, supportCategories, supportStatusLabelForRole } from '@/lib/support'

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
}

export function SupportPanel({ mode, initialTickets }: SupportPanelProps) {
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [tickets, setTickets] = useState(initialTickets)
  const [selectedId, setSelectedId] = useState(initialTickets.find((ticket) => ticket.status !== 'CLOSED')?.id ?? initialTickets[0]?.id ?? '')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(
    initialTickets.find((ticket) => ticket.status !== 'CLOSED') ?? initialTickets[0] ?? null
  )
  const [folder, setFolder] = useState<TicketFolder>('active')
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('general')
  const [newMessage, setNewMessage] = useState('')
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

  useEffect(() => {
    let active = true

    async function refreshSupport() {
      const listEndpoint = mode === 'admin'
        ? `/api/admin/support/tickets${window.location.search}`
        : '/api/support/tickets'

      try {
        const listRes = await fetch(listEndpoint, { cache: 'no-store' })
        const listData = await listRes.json().catch(() => null)
        if (active && listRes.ok && Array.isArray(listData?.tickets)) {
          setTickets((current) =>
            listData.tickets.map((ticket: SupportTicket) => {
              const previous = current.find((item) => item.id === ticket.id)
              return previous && previous.messages.length > ticket.messages.length
                ? { ...ticket, messages: previous.messages }
                : ticket
            })
          )
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
    }, 6000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [fetchTicket, mode, selectedId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' })
  }, [selected?.id, selected?.messages.length])

  async function loadTicket(id: string) {
    setSelectedId(id)
    setMobileChatOpen(true)
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
        body: JSON.stringify({ subject, category, message: newMessage }),
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
      setSubject('')
      setCategory('general')
      setNewMessage('')
      router.refresh()
    })
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!selected || !message.trim()) return
    setError('')

    const messageToSend = message.trim()
    setMessage('')

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
        setError(data?.error || 'Не удалось отправить сообщение')
        return
      }
      const nextStatus: TicketStatus = mode === 'admin' ? 'WAITING_USER' : 'WAITING_ADMIN'
      const updated = {
        ...selected,
        status: nextStatus,
        closedAt: null,
        lastMessageAt: data.message.createdAt,
        messages: [...selected.messages, data.message],
      }
      setSelectedTicket(updated)
      setTickets((current) => current.map((ticket) => ticket.id === updated.id ? { ...ticket, ...updated } : ticket))
      router.refresh()
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
      router.refresh()
    })
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void sendMessage()
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <section className={cn('space-y-4', mobileChatOpen && 'hidden xl:block')}>
        {mode === 'user' && (
          <NewTicketForm
            subject={subject}
            category={category}
            message={newMessage}
            isPending={isPending}
            onSubjectChange={setSubject}
            onCategoryChange={setCategory}
            onMessageChange={setNewMessage}
            onSubmit={createTicket}
          />
        )}

        <div className="overflow-hidden rounded-lg border border-white/70 bg-white/80 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-white/10 dark:bg-surface-900/80 dark:shadow-black/20">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{mode === 'admin' ? 'Обращения' : 'Мои обращения'}</div>
                <div className="text-xs text-slate-500">{unreadTotal > 0 ? `${unreadTotal} новых сообщений` : 'Новых сообщений нет'}</div>
              </div>
              {unreadTotal > 0 && <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">{unreadTotal}</span>}
            </div>
            <FolderTabs folder={folder} counts={folderCounts} mode={mode} onChange={setFolder} />
          </div>

          <div className="max-h-[calc(100dvh-20rem)] overflow-y-auto p-2 xl:max-h-[38rem]">
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
          </div>
        </div>
      </section>

      <section className={cn(
        'min-h-[calc(100dvh-8rem)] overflow-hidden rounded-lg border border-white/70 bg-white/80 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-white/10 dark:bg-surface-900/80 dark:shadow-black/20 xl:min-h-[42rem]',
        !mobileChatOpen && 'hidden xl:block'
      )}>
        {selected ? (
          <div className="flex h-[calc(100dvh-8rem)] min-h-[36rem] flex-col xl:h-[42rem]">
            <div className="border-b border-slate-100 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-surface-900/80 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileChatOpen(false)}
                    className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm xl:hidden"
                    aria-label="Назад к обращениям"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{selected.subject}</h2>
                      <TicketStatusBadge status={selected.status} mode={mode} />
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">
                      {supportCategoryLabel(selected.category)}
                      {mode === 'admin' && selected.user ? ` · ${selected.user.email}` : ''}
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

            <div className="flex-1 overflow-y-auto bg-slate-50/70 px-3 py-4 dark:bg-surface-950/30 sm:px-5">
              <div className="space-y-4">
                {selected.messages.map((item) => {
                  const own = mode === 'admin' ? item.senderRole === 'ADMIN' : item.senderRole === 'USER'
                  return <MessageBubble key={item.id} message={item} own={own} />
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <form onSubmit={sendMessage} className="border-t border-slate-100 bg-white/90 p-3 dark:border-slate-800 dark:bg-surface-900/90 sm:p-4">
              {selected.status === 'CLOSED' ? (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-surface-800">
                  <Lock className="h-4 w-4" />
                  Обращение закрыто и хранится в архиве
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <textarea
                    className="input min-h-14 resize-none"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={handleMessageKeyDown}
                    placeholder={mode === 'admin' ? 'Ответ пользователю' : 'Ваше сообщение'}
                    maxLength={3000}
                    required
                  />
                  <button className="btn-primary self-end" disabled={isPending || !message.trim()}>
                    <Send className="h-4 w-4" />
                    Отправить
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
  subject,
  category,
  message,
  isPending,
  onSubjectChange,
  onCategoryChange,
  onMessageChange,
  onSubmit,
}: {
  subject: string
  category: string
  message: string
  isPending: boolean
  onSubjectChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onMessageChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm shadow-slate-200/60 backdrop-blur dark:border-white/10 dark:bg-surface-900/80 dark:shadow-black/20">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-sm dark:bg-white dark:text-slate-950">
          <MessageSquarePlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-semibold">Новое обращение</h2>
          <p className="text-sm text-slate-500">Ответ появится в этом разделе.</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <input className="input" value={subject} onChange={(event) => onSubjectChange(event.target.value)} placeholder="Тема" maxLength={120} required />
        <select className="input" value={category} onChange={(event) => onCategoryChange(event.target.value)}>
          {supportCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <textarea className="input min-h-24 resize-y" value={message} onChange={(event) => onMessageChange(event.target.value)} placeholder="Сообщение" maxLength={3000} required />
        <button className="btn-primary w-full" disabled={isPending}>
          <Send className="h-4 w-4" />
          Отправить
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
  const items = [
    { value: 'active' as const, label: 'Активные', icon: Inbox },
    { value: 'need-answer' as const, label: mode === 'admin' ? 'Новые' : 'Ответы', icon: Timer },
    { value: 'answered' as const, label: 'Отвеченные', icon: CheckCircle2 },
    { value: 'closed' as const, label: 'Архив', icon: Archive },
  ]

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
      {items.map((item) => {
        const Icon = item.icon
        const active = folder === item.value
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={cn(
              'flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors',
              active
                ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950 dark:border-slate-800 dark:bg-surface-900 dark:text-slate-300 dark:hover:text-white'
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
        'group w-full rounded-lg border px-3 py-3 text-left transition-all',
        active
          ? 'border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/10 dark:border-white dark:bg-white dark:text-slate-950'
          : 'border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-surface-800'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {unread > 0 && <span className={cn('h-2 w-2 shrink-0 rounded-full', active ? 'bg-cyan-200 dark:bg-cyan-700' : 'bg-red-500')} />}
            <div className="truncate font-medium">{ticket.subject}</div>
          </div>
          <div className={cn('mt-1 truncate text-xs', active ? 'text-white/65 dark:text-slate-950/60' : 'text-slate-500')}>
            {mode === 'admin' && ticket.user ? `${ticket.user.email} · ` : ''}
            {supportCategoryLabel(ticket.category)}
          </div>
        </div>
        <TicketStatusBadge status={ticket.status} mode={mode} active={active} />
      </div>
      <div className={cn('mt-2 line-clamp-2 text-sm', active ? 'text-white/70 dark:text-slate-950/70' : 'text-slate-500')}>
        {ticket.messages.at(-1)?.body || ticket.messages[0]?.body || 'Без сообщений'}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className={cn('text-xs', active ? 'text-white/50 dark:text-slate-950/50' : 'text-slate-400')}>
          {formatDate(ticket.lastMessageAt)}
        </div>
        {unread > 0 && (
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', active ? 'bg-white/15 text-white dark:bg-slate-950/10 dark:text-slate-950' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200')}>
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
