'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Clock3, Edit3, Power, TicketPercent, UserRound, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'

type PrizeType = 'SUBSCRIPTION_DAYS' | 'TRAFFIC_GB' | 'PROMO_CODE_PERCENT' | 'BONUS_ATTEMPTS' | 'NO_PRIZE'
type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

export type BonusBoxPrizeAdminRow = {
  id: string
  title: string
  description: string | null
  type: PrizeType
  value: number
  weight: number
  rarity: Rarity
  isActive: boolean
  maxWins: number | null
  winsCount: number
  promoExpiresInDays: number | null
  chance: number
}

export type BonusBoxOpeningAdminRow = {
  id: string
  createdAt: string
  userEmail: string
  userName: string | null
  attemptSource: 'PAYMENT' | 'WEEKLY' | 'REFERRAL' | 'MANUAL' | 'PRIZE'
  prizeTitle: string
  prizeType: PrizeType
  prizeValue: number
  prizeRarity: Rarity
  promoCode: string | null
  promoCodeExpiresAt: string | null
}

type FormState = {
  title: string
  description: string
  type: PrizeType
  value: string
  weight: string
  rarity: Rarity
  isActive: boolean
  maxWins: string
  promoExpiresInDays: string
}

const emptyForm: FormState = {
  title: '',
  description: '',
  type: 'SUBSCRIPTION_DAYS',
  value: '1',
  weight: '20',
  rarity: 'COMMON',
  isActive: true,
  maxWins: '',
  promoExpiresInDays: '',
}

export function BonusBoxPrizesAdmin({
  prizes,
  openings,
}: {
  prizes: BonusBoxPrizeAdminRow[]
  openings: BonusBoxOpeningAdminRow[]
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(false)

  const editingPrize = useMemo(() => prizes.find((prize) => prize.id === editingId) ?? null, [editingId, prizes])

  async function submit() {
    setLoading(true)
    try {
      await apiFetch(editingId ? `/api/admin/bonus-box/prizes/${editingId}` : '/api/admin/bonus-box/prizes', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(toPayload(form)),
      })
      toast(editingId ? 'Подарок обновлён' : 'Подарок создан', 'success')
      resetForm()
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setLoading(false)
    }
  }

  async function toggleActive(prize: BonusBoxPrizeAdminRow) {
    try {
      await apiFetch(`/api/admin/bonus-box/prizes/${prize.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !prize.isActive }),
      })
      toast(prize.isActive ? 'Подарок отключён' : 'Подарок включён', 'success')
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    }
  }

  function startEdit(prize: BonusBoxPrizeAdminRow) {
    setEditingId(prize.id)
    setForm({
      title: prize.title,
      description: prize.description ?? '',
      type: prize.type,
      value: String(prize.value),
      weight: String(prize.weight),
      rarity: prize.rarity,
      isActive: prize.isActive,
      maxWins: prize.maxWins == null ? '' : String(prize.maxWins),
      promoExpiresInDays: prize.promoExpiresInDays == null ? '' : String(prize.promoExpiresInDays),
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
  }

  function changePrizeType(type: PrizeType) {
    setForm((current) => ({
      ...current,
      type,
      value: type === 'NO_PRIZE' ? '0' : current.value === '0' ? '1' : current.value,
      rarity: type === 'NO_PRIZE' ? 'COMMON' : current.rarity,
      promoExpiresInDays: type === 'PROMO_CODE_PERCENT' ? current.promoExpiresInDays : '',
    }))
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {editingPrize ? `Редактировать ${editingPrize.title}` : 'Новый подарок'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Шансы считаются по весам активных подарков. Чем больше вес, тем чаще выпадает подарок.
            </p>
          </div>
          {editingId && (
            <button type="button" className="btn-secondary text-xs" onClick={resetForm}>
              <X className="h-4 w-4" />
              Отмена
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Название">
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              className="input"
              placeholder="+3 дня"
            />
          </Field>
          <Field label="Тип">
            <select
              value={form.type}
              onChange={(event) => changePrizeType(event.target.value as PrizeType)}
              className="input"
            >
              <option value="SUBSCRIPTION_DAYS">Дни подписки</option>
              <option value="TRAFFIC_GB">Трафик, ГБ</option>
              <option value="PROMO_CODE_PERCENT">Промокод, %</option>
              <option value="BONUS_ATTEMPTS">Открытия бокса</option>
              <option value="NO_PRIZE">Без подарка</option>
            </select>
          </Field>
          <Field label={valueLabel(form.type)}>
            <input
              value={form.value}
              onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
              className="input"
              type="number"
              min={form.type === 'NO_PRIZE' ? 0 : 1}
              max={form.type === 'NO_PRIZE' ? 0 : form.type === 'PROMO_CODE_PERCENT' ? 99 : form.type === 'BONUS_ATTEMPTS' ? 100 : 10000}
              disabled={form.type === 'NO_PRIZE'}
            />
          </Field>
          <Field label="Вес">
            <input
              value={form.weight}
              onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
              className="input"
              type="number"
              min={1}
            />
          </Field>
          <Field label="Редкость">
            <select
              value={form.rarity}
              onChange={(event) => setForm((current) => ({ ...current, rarity: event.target.value as Rarity }))}
              className="input"
              disabled={form.type === 'NO_PRIZE'}
            >
              <option value="COMMON">База</option>
              <option value="RARE">Редкий</option>
              <option value="EPIC">Эпик</option>
              <option value="LEGENDARY">Легенда</option>
            </select>
          </Field>
          <Field label="Лимит выпадений">
            <input
              value={form.maxWins}
              onChange={(event) => setForm((current) => ({ ...current, maxWins: event.target.value }))}
              className="input"
              type="number"
              min={1}
              placeholder="Без лимита"
            />
          </Field>
          <Field label="Промокод, дней">
            <input
              value={form.promoExpiresInDays}
              onChange={(event) => setForm((current) => ({ ...current, promoExpiresInDays: event.target.value }))}
              className="input"
              type="number"
              min={1}
              placeholder="Из .env"
              disabled={form.type !== 'PROMO_CODE_PERCENT'}
            />
          </Field>
          <label className="flex items-center gap-2 rounded-lg border px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Активен
          </label>
        </div>

        <Field label="Описание">
          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            className="input min-h-24"
            placeholder="Коротко для пользователя"
          />
        </Field>

        <button type="button" className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Сохраняем...' : editingId ? 'Сохранить изменения' : 'Создать подарок'}
        </button>
      </div>

      <div className="grid gap-3">
        {prizes.map((prize) => (
          <article key={prize.id} className="card">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 xl:max-w-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{prize.title}</span>
                  <span className={prize.isActive ? 'badge-active' : 'badge-disabled'}>
                    {prize.isActive ? 'Активен' : 'Отключён'}
                  </span>
                  <span className={cn('rounded-full px-2 py-1 text-xs font-semibold', rarityClass(prize.rarity))}>
                    {rarityLabel(prize.rarity)}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {prize.description || prizeTypeLabel(prize.type)}
                </div>
              </div>

              <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2 xl:flex-1 2xl:grid-cols-5">
                <Metric label="Подарок" value={prizeValue(prize)} />
                <Metric label="Вес" value={prize.weight} />
                <Metric label="Шанс" value={`${(prize.chance * 100).toFixed(1)}%`} />
                <Metric label="Выпало" value={`${prize.winsCount}/${prize.maxWins ?? '∞'}`} />
                <Metric label="Промокод" value={prize.type === 'PROMO_CODE_PERCENT' ? `${prize.promoExpiresInDays ?? 'env'} дн.` : '—'} />
              </div>

              <div className="action-row xl:w-[240px]">
                <button type="button" className="btn-secondary min-w-[112px] px-3 text-xs" onClick={() => startEdit(prize)}>
                  <Edit3 className="h-3.5 w-3.5" />
                  Изменить
                </button>
                <button type="button" className="btn-secondary min-w-[112px] px-3 text-xs" onClick={() => toggleActive(prize)}>
                  <Power className="h-3.5 w-3.5" />
                  {prize.isActive ? 'Отключить' : 'Включить'}
                </button>
              </div>
            </div>
          </article>
        ))}
        {prizes.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-surface-900">
            Добавьте первый подарок для Подарочного бокса.
          </div>
        )}
      </div>

      <BonusBoxOpeningHistory openings={openings} />
    </div>
  )
}

function BonusBoxOpeningHistory({ openings }: { openings: BonusBoxOpeningAdminRow[] }) {
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">История открытий</h2>
          <p className="mt-1 text-sm text-slate-500">
            Последние исходы, пользователи и промокоды для контроля начислений.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
          <Clock3 className="h-3.5 w-3.5" />
          {openings.length}
        </span>
      </div>

      {openings.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-2 pr-4 font-medium">Когда</th>
                <th className="px-4 py-2 font-medium">Пользователь</th>
                <th className="px-4 py-2 font-medium">Подарок</th>
                <th className="px-4 py-2 font-medium">Источник</th>
                <th className="py-2 pl-4 font-medium">Промокод</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
              {openings.map((opening) => (
                <tr key={opening.id}>
                  <td className="py-3 pr-4 text-slate-500">{formatDateTime(opening.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{opening.userName || opening.userEmail}</div>
                        {opening.userName && (
                          <div className="truncate text-xs text-slate-500">{opening.userEmail}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{opening.prizeTitle}</span>
                      <span className={cn('rounded-full px-2 py-1 text-[11px] font-semibold', rarityClass(opening.prizeRarity))}>
                        {rarityLabel(opening.prizeRarity)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{prizeValueFromParts(opening.prizeType, opening.prizeValue)}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {sourceLabel(opening.attemptSource)}
                  </td>
                  <td className="py-3 pl-4">
                    {opening.promoCode ? (
                      <div className="inline-flex max-w-[220px] flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-surface-800">
                        <TicketPercent className="h-3.5 w-3.5 text-slate-400" />
                        <span className="break-all font-mono">{opening.promoCode}</span>
                        {opening.promoCodeExpiresAt && (
                          <span className="text-slate-500">до {formatDateOnly(opening.promoCodeExpiresAt)}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-surface-800/60">
          Открытий пока не было.
        </div>
      )}
    </section>
  )
}

function toPayload(form: FormState) {
  return {
    title: form.title,
    description: form.description || null,
    type: form.type,
    value: form.type === 'NO_PRIZE' ? 0 : Number(form.value),
    weight: Number(form.weight),
    rarity: form.type === 'NO_PRIZE' ? 'COMMON' : form.rarity,
    isActive: form.isActive,
    maxWins: form.maxWins ? Number(form.maxWins) : null,
    promoExpiresInDays:
      form.type === 'PROMO_CODE_PERCENT' && form.promoExpiresInDays
        ? Number(form.promoExpiresInDays)
        : null,
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="info-cell">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  )
}

function valueLabel(type: PrizeType) {
  if (type === 'NO_PRIZE') return 'Значение'
  if (type === 'SUBSCRIPTION_DAYS') return 'Дни'
  if (type === 'TRAFFIC_GB') return 'ГБ'
  if (type === 'BONUS_ATTEMPTS') return 'Открытия'
  return 'Скидка, %'
}

function prizeTypeLabel(type: PrizeType) {
  if (type === 'NO_PRIZE') return 'Открытие без начисления'
  if (type === 'SUBSCRIPTION_DAYS') return 'Дни подписки'
  if (type === 'TRAFFIC_GB') return 'Дополнительный трафик'
  if (type === 'BONUS_ATTEMPTS') return 'Дополнительные открытия'
  return 'Персональный промокод'
}

function prizeValue(prize: BonusBoxPrizeAdminRow) {
  if (prize.type === 'NO_PRIZE') return 'Без подарка'
  if (prize.type === 'SUBSCRIPTION_DAYS') return `+${prize.value} дн.`
  if (prize.type === 'TRAFFIC_GB') return `+${prize.value} ГБ`
  if (prize.type === 'BONUS_ATTEMPTS') return `+${prize.value} откр.`
  return `-${prize.value}%`
}

function prizeValueFromParts(type: PrizeType, value: number) {
  if (type === 'NO_PRIZE') return 'Без начислений'
  if (type === 'SUBSCRIPTION_DAYS') return `+${value} дн.`
  if (type === 'TRAFFIC_GB') return `+${value} ГБ`
  if (type === 'BONUS_ATTEMPTS') return `+${value} откр.`
  return `-${value}%`
}

function sourceLabel(source: BonusBoxOpeningAdminRow['attemptSource']) {
  if (source === 'PAYMENT') return 'Оплата'
  if (source === 'WEEKLY') return 'Еженедельный бонус'
  if (source === 'REFERRAL') return 'Реферал'
  if (source === 'PRIZE') return 'Подарок из бокса'
  return 'Админ'
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnly(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function rarityLabel(rarity: Rarity) {
  if (rarity === 'LEGENDARY') return 'Легенда'
  if (rarity === 'EPIC') return 'Эпик'
  if (rarity === 'RARE') return 'Редкий'
  return 'База'
}

function rarityClass(rarity: Rarity) {
  if (rarity === 'LEGENDARY') return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100'
  if (rarity === 'EPIC') return 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-100'
  if (rarity === 'RARE') return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-100'
  return 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200'
}
