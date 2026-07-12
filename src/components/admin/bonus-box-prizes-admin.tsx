'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { BarChart3, Clock3, Edit3, Gift, History, Plus, Power, ShieldCheck, SlidersHorizontal, TicketPercent, UserRound, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'
import { AdminEmptyState } from '@/components/admin/admin-empty-state'
import { LazyListLoader } from '@/components/admin/lazy-list-loader'
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock'

type PrizeType = 'SUBSCRIPTION_DAYS' | 'TRAFFIC_GB' | 'PROMO_CODE_PERCENT' | 'BONUS_ATTEMPTS' | 'NO_PRIZE'
type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
type AdminBonusTab = 'prizes' | 'history'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export type BonusBoxSettingsAdminRow = {
  pityEnabled: boolean
  pityOpenings: number
  showBestRecentOpening: boolean
  activePromoRewardsLimit: number
}

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
  attemptSource: string
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
  settings,
  totalOpenings,
}: {
  prizes: BonusBoxPrizeAdminRow[]
  openings: BonusBoxOpeningAdminRow[]
  settings: BonusBoxSettingsAdminRow
  totalOpenings: number
}) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<AdminBonusTab>('prizes')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsForm, setSettingsForm] = useState<BonusBoxSettingsAdminRow>(settings)

  const editingPrize = useMemo(() => prizes.find((prize) => prize.id === editingId) ?? null, [editingId, prizes])
  const stats = useMemo(() => getPrizeStats(prizes), [prizes])
  const estimatedChance = useMemo(
    () => estimatePrizeChance(prizes, editingId, editingPrize, form),
    [editingId, editingPrize, form, prizes]
  )

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

  async function saveSettings() {
    setSettingsLoading(true)
    try {
      await apiFetch('/api/admin/bonus-box/settings', {
        method: 'PATCH',
        body: JSON.stringify(settingsForm),
      })
      toast('Настройки рулетки сохранены', 'success')
      router.refresh()
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setSettingsLoading(false)
    }
  }

  function startEdit(prize: BonusBoxPrizeAdminRow) {
    setEditingId(prize.id)
    setDrawerOpen(true)
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

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setDrawerOpen(true)
  }

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
    setDrawerOpen(false)
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
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20">
        <div className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                <BarChart3 className="h-3.5 w-3.5" />
                Управление подарками
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Состав и шансы</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Держите баланс наград, пустых исходов и редких подарков под контролем. Вес управляет шансом выпадения.
              </p>
            </div>
            <button type="button" className="btn-primary shrink-0" onClick={startCreate}>
              <Plus className="h-4 w-4" />
              Создать подарок
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCell label="Активных" value={`${stats.active}/${prizes.length}`} />
            <SummaryCell label="Шанс награды" value={formatChance(stats.rewardChance)} />
            <SummaryCell label="Без подарка" value={formatChance(stats.noPrizeChance)} tone="danger" />
            <SummaryCell label="Открытий" value={totalOpenings} />
          </div>

          <div className="mt-4 space-y-2">
            <EconomyLine label="Награды" value={stats.rewardChance} className="bg-emerald-500" />
            <EconomyLine label="Без подарка" value={stats.noPrizeChance} className="bg-red-500" />
            <EconomyLine label="Промокоды" value={stats.promoChance} className="bg-violet-500" />
            <EconomyLine label="Доп. открытия" value={stats.attemptChance} className="bg-cyan-500" />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 dark:border-white/10 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-200">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Настройки рулетки
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
              Гарантия и витрина
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Управляет гарантированным редким призом, лучшим выигрышем и промокодами в кабинете.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary shrink-0"
            onClick={saveSettings}
            disabled={settingsLoading}
          >
            <ShieldCheck className="h-4 w-4" />
            {settingsLoading ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </div>

        <div className="grid gap-3 bg-slate-50/70 p-4 dark:bg-white/[0.03] xl:grid-cols-2">
          <SettingsCard
            title="Гарантия редкого"
            description="Если долго выпадает база, следующий редкий приз будет гарантирован."
            checked={settingsForm.pityEnabled}
            onToggle={(checked) => setSettingsForm((current) => ({ ...current, pityEnabled: checked }))}
            fieldLabel="Открытий до гарантии"
            fieldValue={settingsForm.pityOpenings}
            fieldMin={2}
            fieldMax={100}
            fieldDisabled={!settingsForm.pityEnabled}
            onFieldChange={(value) => setSettingsForm((current) => ({ ...current, pityOpenings: value }))}
          />
          <SettingsCard
            title="Лучший выигрыш"
            description="Показывать в кабинете лучший недавний результат пользователя."
            checked={settingsForm.showBestRecentOpening}
            onToggle={(checked) => setSettingsForm((current) => ({ ...current, showBestRecentOpening: checked }))}
            fieldLabel="Промокодов в кабинете"
            fieldValue={settingsForm.activePromoRewardsLimit}
            fieldMin={0}
            fieldMax={12}
            onFieldChange={(value) => setSettingsForm((current) => ({ ...current, activePromoRewardsLimit: value }))}
          />
        </div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20">
        <AdminTabButton
          active={activeTab === 'prizes'}
          icon={<Gift className="h-4 w-4" />}
          label="Состав"
          meta={`${prizes.length}`}
          onClick={() => setActiveTab('prizes')}
        />
        <AdminTabButton
          active={activeTab === 'history'}
          icon={<History className="h-4 w-4" />}
          label="История"
          meta={`${totalOpenings}`}
          onClick={() => setActiveTab('history')}
        />
      </div>

      {activeTab === 'prizes' && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {prizes.map((prize) => (
            <PrizeAdminRow
              key={prize.id}
              prize={prize}
              onEdit={() => startEdit(prize)}
              onToggle={() => toggleActive(prize)}
            />
          ))}
          {prizes.length === 0 && (
            <AdminEmptyState
              title="Подарков пока нет"
              description="Добавьте первый подарок для Подарочного бокса."
              surface="plain"
              className="md:col-span-2 xl:col-span-3"
            />
          )}
        </section>
      )}

      {activeTab === 'history' && (
        <>
          <BonusBoxOpeningHistory openings={openings} />
          <LazyListLoader loaded={openings.length} total={totalOpenings} />
        </>
      )}

      <PrizeEditorDrawer
        open={drawerOpen}
        editingPrize={editingPrize}
        form={form}
        loading={loading}
        onClose={resetForm}
        onSubmit={submit}
        onChange={setForm}
        onTypeChange={changePrizeType}
        estimatedChance={estimatedChance}
      />
    </div>
  )
}

function AdminTabButton({
  active,
  icon,
  label,
  meta,
  onClick,
}: {
  active: boolean
  icon: ReactNode
  label: string
  meta: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-10 flex-1 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors sm:flex-none sm:min-w-40',
        active
          ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
          : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
      )}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-2 font-semibold">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
          active
            ? 'bg-white/15 text-white dark:bg-slate-950/10 dark:text-slate-700'
            : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400'
        )}
      >
        {meta}
      </span>
    </button>
  )
}

function SummaryCell({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={cn('mt-1 text-xl font-semibold tracking-tight', tone === 'danger' && 'text-red-600 dark:text-red-300')}>
        {value}
      </div>
    </div>
  )
}

function EconomyLine({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className: string
}) {
  const percent = value * 100

  return (
    <div className="grid gap-2 sm:grid-cols-[130px_1fr_64px] sm:items-center">
      <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className={cn('h-full rounded-full', className)}
          style={{ width: percent <= 0 ? '0%' : `${Math.max(2, Math.min(100, percent))}%` }}
        />
      </div>
      <div className="text-sm text-slate-500 sm:text-right">{formatChance(value)}</div>
    </div>
  )
}

function PrizeAdminRow({
  prize,
  onEdit,
  onToggle,
}: {
  prize: BonusBoxPrizeAdminRow
  onEdit: () => void
  onToggle: () => void
}) {
  return (
    <article className={cn('group relative overflow-hidden rounded-lg border bg-white shadow-sm shadow-slate-200/60 transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-lg hover:shadow-slate-950/5 dark:bg-surface-900 dark:shadow-black/20 dark:hover:border-cyan-500/30', prizeAdminBorderClass(prize))}>
      <div className={cn('h-1', prizeAdminTopClass(prize))} />
      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={prize.isActive ? 'badge-active' : 'badge-disabled'}>
                {prize.isActive ? 'Активен' : 'Отключён'}
              </span>
              <span className={cn('rounded-full px-2 py-1 text-xs font-semibold', rarityClass(prize.rarity))}>
                {rarityLabel(prize.rarity)}
              </span>
            </div>
            <h3 className="mt-2 truncate text-base font-semibold text-slate-950 dark:text-white">{prize.title}</h3>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {prize.description || prizeTypeLabel(prize.type)}
            </div>
          </div>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-950 text-cyan-200 shadow-sm dark:bg-white dark:text-slate-950">
            <Gift className="h-4 w-4" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <CompactMetric label="Подарок" value={prizeValue(prize)} />
          <CompactMetric label="Шанс" value={formatChance(prize.chance)} />
          <CompactMetric label="Вес" value={prize.weight} />
          <CompactMetric label="Выпало" value={`${prize.winsCount}/${prize.maxWins ?? '∞'}`} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary min-h-10 justify-center px-3 text-xs" onClick={onEdit}>
            <Edit3 className="h-3.5 w-3.5" />
            Изменить
          </button>
          <button type="button" className="btn-secondary min-h-10 justify-center px-3 text-xs" onClick={onToggle}>
            <Power className="h-3.5 w-3.5" />
            {prize.isActive ? 'Отключить' : 'Включить'}
          </button>
        </div>
      </div>
    </article>
  )
}

function PrizeEditorDrawer({
  open,
  editingPrize,
  form,
  loading,
  onClose,
  onSubmit,
  onChange,
  onTypeChange,
  estimatedChance,
}: {
  open: boolean
  editingPrize: BonusBoxPrizeAdminRow | null
  form: FormState
  loading: boolean
  onClose: () => void
  onSubmit: () => void
  onChange: Dispatch<SetStateAction<FormState>>
  onTypeChange: (type: PrizeType) => void
  estimatedChance: number
}) {
  useBodyScrollLock(open)
  const titleId = useId()
  const descriptionId = useId()
  const drawerRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    window.setTimeout(() => {
      drawerRef.current?.focus()
    }, 0)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(drawerRef.current)
      if (focusable.length === 0) {
        event.preventDefault()
        drawerRef.current?.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocusedRef.current?.focus()
      previouslyFocusedRef.current = null
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[160] h-dvh w-dvw">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="absolute right-0 top-0 h-dvh w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-surface-950"
      >
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 p-5 backdrop-blur dark:border-white/10 dark:bg-surface-950/95 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="text-xl font-semibold">
                {editingPrize ? `Редактировать ${editingPrize.title}` : 'Новый подарок'}
              </h2>
              <p id={descriptionId} className="mt-1 text-sm text-slate-500">
                Вес управляет шансом выпадения среди активных исходов.
              </p>
            </div>
            <button type="button" className="btn-secondary h-10 w-10 px-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-5 sm:p-6">
          <Field label="Название">
            <input
              value={form.title}
              onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
              className="input"
              placeholder="+3 дня"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Тип">
              <select
                value={form.type}
                onChange={(event) => onTypeChange(event.target.value as PrizeType)}
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
                onChange={(event) => onChange((current) => ({ ...current, value: event.target.value }))}
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
                onChange={(event) => onChange((current) => ({ ...current, weight: event.target.value }))}
                className="input"
                type="number"
                min={1}
              />
            </Field>
            <Field label="Редкость">
              <select
                value={form.rarity}
                onChange={(event) => onChange((current) => ({ ...current, rarity: event.target.value as Rarity }))}
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
                onChange={(event) => onChange((current) => ({ ...current, maxWins: event.target.value }))}
                className="input"
                type="number"
                min={1}
                placeholder="Без лимита"
              />
            </Field>
            <Field label="Промокод, дней">
              <input
                value={form.promoExpiresInDays}
                onChange={(event) => onChange((current) => ({ ...current, promoExpiresInDays: event.target.value }))}
                className="input"
                type="number"
                min={1}
                placeholder="Из .env"
                disabled={form.type !== 'PROMO_CODE_PERCENT'}
              />
            </Field>
          </div>

          <PrizeFormPreview form={form} estimatedChance={estimatedChance} />

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm dark:border-white/10 dark:bg-white/[0.04]">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => onChange((current) => ({ ...current, isActive: event.target.checked }))}
            />
            Активен
          </label>

          <Field label="Описание">
            <textarea
              value={form.description}
              onChange={(event) => onChange((current) => ({ ...current, description: event.target.value }))}
              className="input min-h-24"
              placeholder="Коротко для пользователя"
            />
          </Field>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-white/10 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="button" className="btn-primary" onClick={onSubmit} disabled={loading}>
              {loading ? 'Сохраняем...' : editingPrize ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  )
}

function BonusBoxOpeningHistory({ openings }: { openings: BonusBoxOpeningAdminRow[] }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20">
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
        <>
        <div className="hidden overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 xl:block">
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
        <div className="space-y-3 xl:hidden">
          {openings.map((opening) => (
            <article key={opening.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="break-words text-sm font-semibold">{opening.userName || opening.userEmail}</div>
                    {opening.userName && <div className="mt-0.5 break-words text-xs text-slate-500">{opening.userEmail}</div>}
                    <div className="mt-1 text-xs text-slate-400">{formatDateTime(opening.createdAt)}</div>
                  </div>
                </div>
                <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', rarityClass(opening.prizeRarity))}>
                  {rarityLabel(opening.prizeRarity)}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
                  <div className="text-xs text-slate-500">Подарок</div>
                  <div className="mt-1 font-medium">{opening.prizeTitle}</div>
                  <div className="text-xs text-slate-500">{prizeValueFromParts(opening.prizeType, opening.prizeValue)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
                  <div className="text-xs text-slate-500">Источник</div>
                  <div className="mt-1 font-medium">{sourceLabel(opening.attemptSource)}</div>
                </div>
              </div>
              {opening.promoCode ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-xs dark:bg-surface-800">
                  <TicketPercent className="h-3.5 w-3.5 text-slate-400" />
                  <span className="break-all font-mono">{opening.promoCode}</span>
                  {opening.promoCodeExpiresAt && (
                    <span className="text-slate-500">до {formatDateOnly(opening.promoCodeExpiresAt)}</span>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
        </>
      ) : (
        <AdminEmptyState
          title="Открытий пока не было"
          description="История появится после первого открытия Подарочного бокса."
          surface="plain"
        />
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

function SettingsCard({
  title,
  description,
  checked,
  onToggle,
  fieldLabel,
  fieldValue,
  fieldMin,
  fieldMax,
  fieldDisabled = false,
  onFieldChange,
}: {
  title: string
  description: string
  checked: boolean
  onToggle: (checked: boolean) => void
  fieldLabel: string
  fieldValue: number
  fieldMin: number
  fieldMax: number
  fieldDisabled?: boolean
  onFieldChange: (value: number) => void
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/50 dark:border-white/10 dark:bg-surface-950/80 dark:shadow-black/20">
      <label className="flex cursor-pointer items-start justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-base font-semibold text-slate-950 dark:text-white">{title}</span>
          <span className="mt-1 block max-w-lg text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</span>
        </span>
        <span
          className={cn(
            'relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors',
            checked
              ? 'border-cyan-500 bg-cyan-500'
              : 'border-slate-300 bg-slate-200 dark:border-white/10 dark:bg-white/10'
          )}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => onToggle(event.target.checked)}
            className="sr-only"
          />
          <span
            className={cn(
              'absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              checked && 'translate-x-5'
            )}
          />
        </span>
      </label>
      <label className={cn('mt-4 block border-t border-slate-100 pt-4 dark:border-white/10', fieldDisabled && 'opacity-55')}>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-200">{fieldLabel}</span>
        <input
          type="number"
          min={fieldMin}
          max={fieldMax}
          value={fieldValue}
          onChange={(event) => onFieldChange(Number(event.target.value))}
          className="input h-12 bg-slate-50 text-base font-semibold dark:bg-surface-900"
          disabled={fieldDisabled}
        />
      </label>
    </div>
  )
}

function PrizeFormPreview({ form, estimatedChance }: { form: FormState; estimatedChance: number }) {
  const title = form.title.trim() || 'Новый подарок'
  const value = previewPrizeValue(form.type, Number(form.value || 0))

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Превью
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-950 dark:text-white">{title}</div>
          <div className="mt-1 text-sm text-slate-500">{value}</div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', rarityClass(form.rarity))}>
          {form.type === 'NO_PRIZE' ? 'Без подарка' : rarityLabel(form.rarity)}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-white px-2.5 py-2 dark:bg-surface-900">
          <div className="text-xs text-slate-400">Тип</div>
          <div className="mt-0.5 truncate font-medium">{prizeTypeLabel(form.type)}</div>
        </div>
        <div className="rounded-md bg-white px-2.5 py-2 dark:bg-surface-900">
          <div className="text-xs text-slate-400">Вес</div>
          <div className="mt-0.5 truncate font-medium">{form.weight || '0'}</div>
        </div>
        <div className="rounded-md bg-white px-2.5 py-2 dark:bg-surface-900">
          <div className="text-xs text-slate-400">Шанс по весу</div>
          <div className="mt-0.5 truncate font-medium">{formatChance(estimatedChance)}</div>
        </div>
      </div>
    </div>
  )
}

function CompactMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/80 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="truncate text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold">{value}</div>
    </div>
  )
}

function getPrizeStats(prizes: BonusBoxPrizeAdminRow[]) {
  const activePrizes = prizes.filter((prize) => prize.isActive && prize.weight > 0 && (prize.maxWins == null || prize.winsCount < prize.maxWins))
  const active = activePrizes.length
  const noPrizeChance = activePrizes
    .filter((prize) => prize.type === 'NO_PRIZE')
    .reduce((sum, prize) => sum + prize.chance, 0)
  const promoChance = activePrizes
    .filter((prize) => prize.type === 'PROMO_CODE_PERCENT')
    .reduce((sum, prize) => sum + prize.chance, 0)
  const attemptChance = activePrizes
    .filter((prize) => prize.type === 'BONUS_ATTEMPTS')
    .reduce((sum, prize) => sum + prize.chance, 0)

  return {
    active,
    noPrizeChance,
    promoChance,
    attemptChance,
    rewardChance: Math.max(0, 1 - noPrizeChance),
  }
}

function estimatePrizeChance(
  prizes: BonusBoxPrizeAdminRow[],
  editingId: string | null,
  editingPrize: BonusBoxPrizeAdminRow | null,
  form: FormState
) {
  const weight = Number(form.weight)
  const maxWins = form.maxWins ? Number(form.maxWins) : null
  const isCurrentEligible = form.isActive
    && Number.isFinite(weight)
    && weight > 0
    && (maxWins == null || !editingPrize || editingPrize.winsCount < maxWins)
  const otherWeight = prizes
    .filter((prize) =>
      prize.id !== editingId
      && prize.isActive
      && prize.weight > 0
      && (prize.maxWins == null || prize.winsCount < prize.maxWins)
    )
    .reduce((sum, prize) => sum + prize.weight, 0)

  if (!isCurrentEligible) return 0
  return weight / (otherWeight + weight)
}

function getFocusableElements(root: HTMLElement | null) {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true')
}

function formatChance(value: number) {
  return `${(value * 100).toFixed(1)}%`
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

function previewPrizeValue(type: PrizeType, value: number) {
  if (type === 'NO_PRIZE') return 'Открытие без начисления'
  if (!Number.isFinite(value) || value <= 0) return 'Укажите значение подарка'
  return prizeValueFromParts(type, value)
}

function sourceLabel(source: BonusBoxOpeningAdminRow['attemptSource']) {
  if (source === 'PAYMENT') return 'Оплата'
  if (source === 'WEEKLY') return 'Еженедельный бонус'
  if (source === 'REFERRAL') return 'Реферал'
  if (source === 'PRIZE') return 'Подарок из бокса'
  if (source === 'SEASONAL_EVENT') return 'Событие'
  if (source === 'MISSION') return 'Миссия'
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

function prizeAdminBorderClass(prize: BonusBoxPrizeAdminRow) {
  if (prize.type === 'NO_PRIZE') return 'border-red-300 dark:border-red-500/60'
  if (prize.rarity === 'LEGENDARY') return 'border-amber-200 dark:border-amber-500/40'
  if (prize.rarity === 'EPIC') return 'border-fuchsia-200 dark:border-fuchsia-500/40'
  if (prize.rarity === 'RARE') return 'border-cyan-200 dark:border-cyan-500/40'
  return 'border-slate-200 dark:border-white/10'
}

function prizeAdminTopClass(prize: BonusBoxPrizeAdminRow) {
  if (prize.type === 'NO_PRIZE') return 'bg-red-500'
  if (prize.rarity === 'LEGENDARY') return 'bg-amber-400'
  if (prize.rarity === 'EPIC') return 'bg-fuchsia-400'
  if (prize.rarity === 'RARE') return 'bg-cyan-400'
  return 'bg-slate-400'
}
