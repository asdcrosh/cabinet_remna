'use client'

import { FormEvent, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, LifeBuoy, Lock, MessageSquarePlus, Send, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { supportCategoryLabel, supportCategories, supportStatusLabel } from '@/lib/support'

type TicketStatus = 'OPEN' | 'WAITING_ADMIN' | 'WAITING_USER' | 'CLOSED'
type SenderRole = 'USER' | 'ADMIN'

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
  const [tickets, setTickets] = useState(initialTickets)
  const [selectedId, setSelectedId] = useState(initialTickets[0]?.id ?? '')
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(initialTickets[0] ?? null)
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('general')
  const [newMessage, setNewMessage] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const selected = selectedTicket && selectedTicket.id === selectedId
    ? selectedTicket
    : tickets.find((ticket) => ticket.id === selectedId) ?? null

  const unreadTotal = useMemo(() => {
    return tickets.reduce((sum, ticket) => sum + (mode === 'admin' ? ticket.adminUnreadCount : ticket.userUnreadCount), 0)
  }, [mode, tickets])

  async function loadTicket(id: string) {
    setSelectedId(id)
    setError('')
    const endpoint = mode === 'admin' ? `/api/admin/support/tickets/${id}` : `/api/support/tickets/${id}`
    const res = await fetch(endpoint, { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      setError(data?.error || 'Не удалось открыть обращение')
      return
    }
    setSelectedTicket(data.ticket)
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === id
          ? {
              ...ticket,
              ...data.ticket,
              messages: data.ticket.messages.length ? data.ticket.messages : ticket.messages,
            }
          : ticket
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
      setSubject('')
      setCategory('general')
      setNewMessage('')
      router.refresh()
    })
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !message.trim()) return
    setError('')

    startTransition(async () => {
      const endpoint = mode === 'admin' ? `/api/admin/support/tickets/${selected.id}` : `/api/support/tickets/${selected.id}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
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
      setMessage('')
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
      router.refresh()
    })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="space-y-4">
        {mode === 'user' && (
          <form onSubmit={createTicket} className="card space-y-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-600">
                <MessageSquarePlus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold">Новое обращение</h2>
                <p className="text-sm text-slate-500">Напишите вопрос, ответ появится здесь.</p>
              </div>
            </div>
            <input
              className="input"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Тема"
              maxLength={120}
              required
            />
            <select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
              {supportCategories.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <textarea
              className="input min-h-28 resize-y"
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder="Сообщение"
              maxLength={3000}
              required
            />
            <button className="btn-primary w-full" disabled={isPending}>
              <Send className="h-4 w-4" />
              Отправить
            </button>
          </form>
        )}

        <div className="card p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="font-semibold">{mode === 'admin' ? 'Очередь' : 'Мои обращения'}</div>
            {unreadTotal > 0 && <span className="badge-limited">{unreadTotal} новых</span>}
          </div>
          <div className="max-h-[38rem] overflow-y-auto p-2">
            {tickets.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">
                Обращений пока нет
              </div>
            ) : (
              tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => void loadTicket(ticket.id)}
                  className={cn(
                    'w-full rounded-lg px-3 py-3 text-left transition-colors',
                    selectedId === ticket.id
                      ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/10'
                      : 'hover:bg-slate-50 dark:hover:bg-surface-800'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{ticket.subject}</div>
                      <div className={cn('mt-1 truncate text-xs', selectedId === ticket.id ? 'text-white/65' : 'text-slate-500')}>
                        {mode === 'admin' && ticket.user ? `${ticket.user.email} · ` : ''}
                        {supportCategoryLabel(ticket.category)}
                      </div>
                    </div>
                    <TicketStatusBadge status={ticket.status} active={selectedId === ticket.id} />
                  </div>
                  <div className={cn('mt-2 line-clamp-2 text-sm', selectedId === ticket.id ? 'text-white/70' : 'text-slate-500')}>
                    {ticket.messages[0]?.body || 'Без сообщений'}
                  </div>
                  <div className={cn('mt-2 text-xs', selectedId === ticket.id ? 'text-white/50' : 'text-slate-400')}>
                    {formatDate(ticket.lastMessageAt)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="card min-h-[36rem] p-0">
        {selected ? (
          <div className="flex min-h-[36rem] flex-col">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight">{selected.subject}</h2>
                    <TicketStatusBadge status={selected.status} />
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {supportCategoryLabel(selected.category)}
                    {mode === 'admin' && selected.user ? ` · ${selected.user.email}` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mode === 'admin' && selected.status === 'CLOSED' && (
                    <button className="btn-secondary" onClick={() => void updateStatus('OPEN')} disabled={isPending}>
                      <CheckCircle2 className="h-4 w-4" />
                      Открыть
                    </button>
                  )}
                  {selected.status !== 'CLOSED' && (
                    <button className="btn-secondary" onClick={() => void updateStatus('CLOSED')} disabled={isPending}>
                      <XCircle className="h-4 w-4" />
                      Закрыть
                    </button>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {selected.messages.map((item) => {
                const own = mode === 'admin' ? item.senderRole === 'ADMIN' : item.senderRole === 'USER'
                return (
                  <div key={item.id} className={cn('flex', own ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[min(42rem,86%)] rounded-lg px-4 py-3 shadow-sm',
                        own
                          ? 'bg-slate-950 text-white shadow-slate-950/10'
                          : 'border border-slate-100 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-surface-800 dark:text-white'
                      )}
                    >
                      <div className={cn('mb-1 text-xs', own ? 'text-white/55' : 'text-slate-500')}>
                        {item.senderRole === 'ADMIN' ? 'Поддержка' : 'Пользователь'} · {formatDate(item.createdAt)}
                      </div>
                      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.body}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <form onSubmit={sendMessage} className="border-t border-slate-100 p-4 dark:border-slate-800">
              {selected.status === 'CLOSED' ? (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-surface-800">
                  <Lock className="h-4 w-4" />
                  Обращение закрыто
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <textarea
                    className="input min-h-24 resize-y"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={mode === 'admin' ? 'Ответ пользователю' : 'Ваше сообщение'}
                    maxLength={3000}
                    required
                  />
                  <button className="btn-primary self-end" disabled={isPending}>
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
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <LifeBuoy className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold">Выберите обращение</h2>
              <p className="mt-2 max-w-sm text-sm text-slate-500">
                Здесь появится переписка с пользователем.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function TicketStatusBadge({ status, active = false }: { status: TicketStatus; active?: boolean }) {
  const className =
    status === 'CLOSED'
      ? 'badge-disabled'
      : status === 'WAITING_ADMIN'
        ? 'badge-limited'
        : status === 'WAITING_USER'
          ? 'badge-active'
          : 'badge-limited'

  return (
    <span className={cn(className, active && 'bg-white/15 text-white ring-1 ring-white/20')}>
      {supportStatusLabel(status)}
    </span>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
