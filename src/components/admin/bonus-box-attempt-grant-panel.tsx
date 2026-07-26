'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Gift, Loader2, Minus, Plus, Search, UserRound, UsersRound, X } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { toast } from '@/components/ui/toaster'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'

type Audience = 'ALL' | 'SELECTED'

type Recipient = {
  id: string
  email: string
  name: string | null
  telegramUsername: string | null
  lastLoginAt: string | null
}

type GrantResult = {
  recipientsCount: number
  recipientsGranted: number
  attemptsGranted: number
  attemptsPerUser: number
  alreadyProcessed: boolean
}

const amountPresets = [1, 3, 5, 10]

export function BonusBoxAttemptGrantPanel({
  eligibleUsersCount,
}: {
  eligibleUsersCount: number
}) {
  const router = useRouter()
  const [audience, setAudience] = useState<Audience>('ALL')
  const [attemptsCount, setAttemptsCount] = useState(1)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Recipient[]>([])
  const [selectedUsers, setSelectedUsers] = useState<Record<string, Recipient>>({})
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [operationId, setOperationId] = useState<string | null>(null)

  const selected = useMemo(() => Object.values(selectedUsers), [selectedUsers])
  const recipientsCount = audience === 'ALL' ? eligibleUsersCount : selected.length
  const totalAttempts = recipientsCount * attemptsCount
  const canSubmit = recipientsCount > 0 && attemptsCount >= 1 && attemptsCount <= 100

  useEffect(() => {
    if (audience !== 'SELECTED') return

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(false)
      try {
        const result = await apiFetch<{ users: Recipient[] }>(
          `/api/admin/bonus-box/attempt-grants?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal }
        )
        setSearchResults(result.users)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        setSearchError(true)
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [audience, query])

  function setAmount(value: number) {
    setAttemptsCount(Math.min(100, Math.max(1, Math.trunc(value) || 1)))
    setOperationId(null)
  }

  function toggleUser(user: Recipient) {
    setOperationId(null)
    setSelectedUsers((current) => {
      if (current[user.id]) {
        const next = { ...current }
        delete next[user.id]
        return next
      }
      if (Object.keys(current).length >= 200) {
        toast('Можно выбрать не более 200 пользователей')
        return current
      }
      return { ...current, [user.id]: user }
    })
  }

  async function submit() {
    if (!canSubmit || submitting || !operationId) return

    setSubmitting(true)
    try {
      const result = await apiFetch<GrantResult>('/api/admin/bonus-box/attempt-grants', {
        method: 'POST',
        body: JSON.stringify({
          audience,
          userIds: audience === 'SELECTED' ? selected.map((user) => user.id) : [],
          attemptsCount,
          operationId,
        }),
      })

      if (result.alreadyProcessed) {
        toast('Эта операция уже выполнена', 'success')
      } else {
        toast(
          `Начислено ${result.attemptsGranted} прокруток для ${result.recipientsGranted} пользователей`,
          'success'
        )
      }
      setConfirmOpen(false)
      setOperationId(null)
      if (audience === 'SELECTED') setSelectedUsers({})
      router.refresh()
    } catch {
      // apiFetch покажет ошибку.
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <section
        data-testid="bonus-attempt-grant-panel"
        className="mt-5 border-t border-slate-200 pt-5 dark:border-white/10"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-300">
                <Gift className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-semibold text-slate-950 dark:text-white">Начислить прокрутки</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Всем пользователям или выбранным вручную
                </p>
              </div>
            </div>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Доступно пользователей: <span className="font-semibold text-slate-800 dark:text-slate-200">{eligibleUsersCount}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/[0.055]">
              <AudienceButton
                active={audience === 'ALL'}
                icon={<UsersRound className="h-4 w-4" />}
                title="Всем"
                meta={`${eligibleUsersCount} пользователей`}
                onClick={() => {
                  setAudience('ALL')
                  setOperationId(null)
                }}
              />
              <AudienceButton
                active={audience === 'SELECTED'}
                icon={<UserRound className="h-4 w-4" />}
                title="Выбрать"
                meta={selected.length > 0 ? `Выбрано: ${selected.length}` : 'Поиск по аккаунтам'}
                onClick={() => {
                  setAudience('SELECTED')
                  setOperationId(null)
                }}
              />
            </div>

            {audience === 'SELECTED' && (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-black/10">
                {selected.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Получатели
                    </div>
                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                      {selected.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-cyan-500/25 bg-cyan-500/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-cyan-800 dark:text-cyan-200"
                          onClick={() => toggleUser(user)}
                          title="Убрать из списка"
                        >
                          <span className="max-w-44 truncate">{user.name || user.email}</span>
                          <X className="h-3.5 w-3.5 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input h-11 pl-9 pr-10"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Имя, email или Telegram"
                    aria-label="Найти пользователя"
                  />
                  {searchLoading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
                  )}
                </label>

                <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.025]">
                  {searchError ? (
                    <div className="px-3 py-5 text-center text-sm text-red-600 dark:text-red-300">
                      Не удалось загрузить пользователей
                    </div>
                  ) : !searchLoading && searchResults.length === 0 ? (
                    <div className="px-3 py-5 text-center text-sm text-slate-500">
                      Пользователи не найдены
                    </div>
                  ) : (
                    searchResults.map((user) => {
                      const checked = Boolean(selectedUsers[user.id])
                      return (
                        <button
                          key={user.id}
                          type="button"
                          className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50 dark:border-white/[0.07] dark:hover:bg-white/[0.04]"
                          onClick={() => toggleUser(user)}
                          aria-pressed={checked}
                        >
                          <span
                            className={cn(
                              'grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-colors',
                              checked
                                ? 'border-cyan-500 bg-cyan-500 text-white'
                                : 'border-slate-300 text-transparent dark:border-white/20'
                            )}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                              {user.name || 'Без имени'}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {user.email}
                              {user.telegramUsername ? ` · @${user.telegramUsername.replace(/^@/, '')}` : ''}
                            </span>
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-black/10">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Прокруток каждому
            </label>
            <div className="mt-2 grid grid-cols-[44px_minmax(0,1fr)_44px] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.035]">
              <button
                type="button"
                className="grid h-12 place-items-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-white/5"
                onClick={() => setAmount(attemptsCount - 1)}
                disabled={attemptsCount <= 1}
                aria-label="Уменьшить количество"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min={1}
                max={100}
                className="min-w-0 border-x border-slate-200 bg-transparent text-center text-lg font-semibold outline-none dark:border-white/10"
                value={attemptsCount}
                onChange={(event) => setAmount(Number(event.target.value))}
                aria-label="Количество прокруток каждому"
              />
              <button
                type="button"
                className="grid h-12 place-items-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-white/5"
                onClick={() => setAmount(attemptsCount + 1)}
                disabled={attemptsCount >= 100}
                aria-label="Увеличить количество"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {amountPresets.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  className={cn(
                    'h-8 rounded-lg text-xs font-semibold transition-colors',
                    attemptsCount === amount
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                      : 'bg-slate-200/70 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.07] dark:text-slate-300 dark:hover:bg-white/10'
                  )}
                  onClick={() => setAmount(amount)}
                >
                  {amount}
                </button>
              ))}
            </div>

            <div className="my-3 border-t border-slate-200 dark:border-white/10" />
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500">Будет начислено</div>
                <div className="mt-0.5 text-xl font-semibold tabular-nums text-slate-950 dark:text-white">
                  {formatNumber(totalAttempts)}
                </div>
              </div>
              <div className="text-right text-xs leading-5 text-slate-500">
                {formatNumber(recipientsCount)} получателей
              </div>
            </div>
            <button
              type="button"
              className="btn-primary mt-3 w-full justify-center"
              disabled={!canSubmit}
              onClick={() => {
                setOperationId((current) => current ?? crypto.randomUUID())
                setConfirmOpen(true)
              }}
            >
              <Gift className="h-4 w-4" />
              Начислить
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
          Начисление появится в кабинете получателя. Администраторы и модераторы не входят в массовую выдачу.
        </p>
      </section>

      <AdminModal
        open={confirmOpen}
        title="Подтвердить начисление"
        description={audience === 'ALL' ? 'Начисление всем пользователям' : 'Начисление выбранным пользователям'}
        onClose={() => {
          if (!submitting) setConfirmOpen(false)
        }}
        size="md"
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
          <SummaryLine label="Получателей" value={formatNumber(recipientsCount)} />
          <SummaryLine label="Прокруток каждому" value={formatNumber(attemptsCount)} />
          <SummaryLine label="Всего прокруток" value={formatNumber(totalAttempts)} strong />
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-500">
          Отменить начисление после подтверждения нельзя. Повторная отправка этой операции не создаст дубликаты.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
          <button
            type="button"
            className="btn-secondary justify-center"
            onClick={() => setConfirmOpen(false)}
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            type="button"
            className="btn-primary justify-center"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
            {submitting ? 'Начисляем...' : 'Подтвердить'}
          </button>
        </div>
      </AdminModal>
    </>
  )
}

function AudienceButton({
  active,
  icon,
  title,
  meta,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  title: string
  meta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-16 items-center gap-3 rounded-xl px-3 text-left transition-colors',
        active
          ? 'bg-white text-slate-950 shadow-sm dark:bg-white/10 dark:text-white'
          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', active && 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300')}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-xs opacity-70">{meta}</span>
      </span>
    </button>
  )
}

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-white/[0.07]">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={cn('tabular-nums text-slate-900 dark:text-white', strong ? 'text-lg font-semibold' : 'text-sm font-medium')}>
        {value}
      </span>
    </div>
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value)
}
