'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PersonalOfferSetting, PersonalOfferTone, WelcomeBonusSetting } from '@prisma/client'
import { Edit3, Gift, Sparkles, Ticket, WandSparkles } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { apiFetch } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import { toast } from '@/components/ui/toaster'
import { Tabs } from '@/components/ui/tabs'
import {
  personalOfferPlaceholders,
  personalOfferScenarioLabels,
  personalOfferToneLabels,
} from '@/lib/personal-offers'

type Offer = PersonalOfferSetting & {
  promoCode?: { id: string; code: string; discountPercent: number; isActive: boolean } | null
}

type WelcomeBonus = (WelcomeBonusSetting & {
  trialPlan?: { id: string; name: string; durationDays: number; isActive: boolean } | null
  promoCode?: { id: string; code: string; discountPercent: number; isActive: boolean } | null
}) | null

type OfferForm = {
  enabled: boolean
  priority: number
  eyebrow: string
  title: string
  description: string
  cta: string
  href: string
  meta: string
  tone: PersonalOfferTone
  promoCodeId: string
}

type WelcomeBonusForm = {
  enabled: boolean
  trialEnabled: boolean
  trialPlanId: string
  bonusAttemptsEnabled: boolean
  bonusAttempts: number
  promoCodeEnabled: boolean
  promoCodeId: string
}

export function PersonalOffersAdmin({
  offers,
  promoCodes,
  trialPlans,
  welcomeBonusSetting,
}: {
  offers: Offer[]
  promoCodes: Array<{ id: string; code: string; discountPercent: number }>
  trialPlans: Array<{ id: string; name: string; durationDays: number }>
  welcomeBonusSetting: WelcomeBonus
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<Offer | null>(null)
  const [loading, setLoading] = useState(false)
  const [welcomeLoading, setWelcomeLoading] = useState(false)
  const [form, setForm] = useState<OfferForm>(() => toForm(offers[0]))
  const [welcomeForm, setWelcomeForm] = useState<WelcomeBonusForm>(() => toWelcomeForm(welcomeBonusSetting))
  const [editorSection, setEditorSection] = useState<'CONTENT' | 'BEHAVIOR' | 'PREVIEW'>('CONTENT')

  const activeOffer = useMemo(() => editing, [editing])

  function openEdit(offer: Offer) {
    setEditing(offer)
    setForm(toForm(offer))
    setEditorSection('CONTENT')
  }

  async function save() {
    if (!editing) return
    setLoading(true)
    try {
      await apiFetch(`/api/admin/offers/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(form),
      })
      toast('Оффер обновлён', 'success')
      setEditing(null)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function saveWelcomeBonus() {
    setWelcomeLoading(true)
    try {
      await apiFetch('/api/admin/welcome-bonus', {
        method: 'PATCH',
        body: JSON.stringify(welcomeForm),
      })
      toast('Приветственный бонус обновлён', 'success')
      router.refresh()
    } finally {
      setWelcomeLoading(false)
    }
  }

  return (
    <>
      <section className="surface-card border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
        <div className="flex flex-col gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-100">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Приветственный бонус</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Отдельная выдача для новых пользователей: пробный период, рулетка или промокод.
                </p>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-emerald-100 bg-white/80 px-3 py-2 text-sm text-slate-600 dark:border-emerald-500/20 dark:bg-white/[0.04] dark:text-slate-300">
              <span className="font-medium text-slate-950 dark:text-white">Сейчас: </span>
              {welcomeSummary(welcomeForm, trialPlans, promoCodes)}
            </div>
          </div>

          <div className="grid w-full gap-3">
            <label className="flex min-h-12 items-center gap-2 rounded-lg border border-emerald-100 bg-white px-3 py-2 text-sm font-medium shadow-sm dark:border-emerald-500/20 dark:bg-surface-900">
              <input
                type="checkbox"
                checked={welcomeForm.enabled}
                onChange={(event) => setWelcomeForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              Включить приветственный бонус
            </label>

            <div className="grid gap-3 xl:grid-cols-3">
              <WelcomeBonusOption
                title="Пробный период"
                description="Новый пользователь сможет выбрать бесплатный тариф."
                icon={<Sparkles className="h-5 w-5" />}
                checked={welcomeForm.trialEnabled}
                onToggle={(checked) => setWelcomeForm((prev) => ({ ...prev, trialEnabled: checked }))}
              >
                <select
                  className="input"
                  value={welcomeForm.trialPlanId}
                  onChange={(event) => setWelcomeForm((prev) => ({ ...prev, trialPlanId: event.target.value }))}
                >
                  <option value="">Выберите тариф</option>
                  {trialPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>{plan.name} · {plan.durationDays} дн.</option>
                  ))}
                </select>
              </WelcomeBonusOption>

              <WelcomeBonusOption
                title="Промокод"
                description="Пользователь получит код на первую оплату."
                icon={<Ticket className="h-5 w-5" />}
                checked={welcomeForm.promoCodeEnabled}
                onToggle={(checked) => setWelcomeForm((prev) => ({ ...prev, promoCodeEnabled: checked }))}
              >
                <select
                  className="input"
                  value={welcomeForm.promoCodeId}
                  onChange={(event) => setWelcomeForm((prev) => ({ ...prev, promoCodeId: event.target.value }))}
                >
                  <option value="">Выберите промокод</option>
                  {promoCodes.map((promoCode) => (
                    <option key={promoCode.id} value={promoCode.id}>
                      {promoCode.code} · {promoCode.discountPercent}%
                    </option>
                  ))}
                </select>
              </WelcomeBonusOption>

              <WelcomeBonusOption
                title="Рулетка"
                description="Начислить попытки в подарочном боксе."
                icon={<WandSparkles className="h-5 w-5" />}
                checked={welcomeForm.bonusAttemptsEnabled}
                onToggle={(checked) => setWelcomeForm((prev) => ({ ...prev, bonusAttemptsEnabled: checked }))}
              >
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={50}
                  value={welcomeForm.bonusAttempts}
                  onChange={(event) => setWelcomeForm((prev) => ({ ...prev, bonusAttempts: Number(event.target.value) }))}
                />
              </WelcomeBonusOption>
            </div>

            <button type="button" className="btn-primary min-h-11 justify-center sm:w-fit sm:px-5" onClick={() => void saveWelcomeBonus()} disabled={welcomeLoading}>
              {welcomeLoading ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </section>

      <section className="surface-card overflow-hidden p-0">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <h2 className="font-semibold text-slate-950 dark:text-white">Офферы на главной</h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Порядок, текст и кнопки для разных состояний пользователя.
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/10">
          {offers.map((offer) => (
            <article key={offer.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[13rem_minmax(0,1fr)_13rem_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={offer.enabled ? 'badge-active' : 'badge-muted'}>
                    {offer.enabled ? 'Вкл' : 'Выкл'}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-white/10 dark:text-slate-300">
                    #{offer.priority}
                  </span>
                </div>
                <div className="mt-2 truncate font-medium text-slate-950 dark:text-white">
                  {personalOfferScenarioLabels[offer.scenario]}
                </div>
              </div>

              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-950 dark:text-white">{offer.title}</div>
                <div className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
                  {offer.description}
                </div>
              </div>

              <div className="min-w-0 text-sm text-slate-500 dark:text-slate-400">
                <div className="truncate font-medium text-slate-700 dark:text-slate-200">{offer.cta || 'Без кнопки'}</div>
                <div className="mt-1 truncate">{offer.href || 'Нет ссылки'}</div>
                <div className="mt-1 truncate">{rewardSummary(offer)}</div>
              </div>

              <button type="button" className="btn-secondary min-h-10 justify-center px-3 lg:w-32" onClick={() => openEdit(offer)}>
                <Edit3 className="h-4 w-4" />
                Изменить
              </button>
            </article>
          ))}
        </div>
      </section>

      <AdminModal
        open={Boolean(activeOffer)}
        title={activeOffer ? personalOfferScenarioLabels[activeOffer.scenario] : 'Оффер'}
        description="Текст поддерживает подстановки. Ссылка должна вести внутри кабинета."
        size="lg"
        onClose={() => setEditing(null)}
      >
        <div className="space-y-5">
          <Tabs
            value={editorSection}
            onValueChange={setEditorSection}
            className="w-full"
            items={[
              { value: 'CONTENT', label: 'Содержание' },
              { value: 'BEHAVIOR', label: 'Условия' },
              { value: 'PREVIEW', label: 'Предпросмотр' },
            ]}
          />

          {editorSection === 'CONTENT' ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Метка">
                  <input className="input" value={form.eyebrow} onChange={(event) => setFormValue('eyebrow', event.target.value)} />
                </Field>
                <Field label="Текст кнопки">
                  <input className="input" value={form.cta} onChange={(event) => setFormValue('cta', event.target.value)} />
                </Field>
              </div>
              <Field label="Заголовок">
                <input className="input" value={form.title} onChange={(event) => setFormValue('title', event.target.value)} />
              </Field>
              <Field label="Описание">
                <textarea className="input min-h-28 resize-y" value={form.description} onChange={(event) => setFormValue('description', event.target.value)} />
              </Field>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Подстановки</div>
                <div className="flex flex-wrap gap-2">
                  {personalOfferPlaceholders.map((item) => (
                    <button key={item} type="button" className="rounded-md border bg-white px-2 py-1 font-mono text-xs dark:bg-white/5" onClick={() => setFormValue('description', `${form.description} ${item}`.trim())}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {editorSection === 'BEHAVIOR' ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem_12rem]">
                <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                  <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))} />
                  <span className="text-sm font-medium">Показывать</span>
                </label>
                <Field label="Приоритет">
                  <input className="input" type="number" min={0} max={1000} value={form.priority} onChange={(event) => setForm((prev) => ({ ...prev, priority: Number(event.target.value) }))} />
                </Field>
                <Field label="Цвет">
                  <select className="input" value={form.tone} onChange={(event) => setForm((prev) => ({ ...prev, tone: event.target.value as PersonalOfferTone }))}>
                    {Object.entries(personalOfferToneLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ссылка">
                  <input className="input" value={form.href} onChange={(event) => setFormValue('href', event.target.value)} />
                </Field>
                <Field label="Короткая подпись">
                  <input className="input" value={form.meta} onChange={(event) => setFormValue('meta', event.target.value)} />
                </Field>
              </div>
              <Field label="Промокод для оффера «Давно не покупал»">
                <select className="input" value={form.promoCodeId} onChange={(event) => setFormValue('promoCodeId', event.target.value)}>
                  <option value="">Лучший доступный автоматически</option>
                  {promoCodes.map((promoCode) => <option key={promoCode.id} value={promoCode.id}>{promoCode.code} · {promoCode.discountPercent}%</option>)}
                </select>
              </Field>
            </div>
          ) : null}

          {editorSection === 'PREVIEW' ? <OfferPreview form={form} /> : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)} disabled={loading}>
              Отмена
            </button>
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={loading}>
              {loading ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </AdminModal>
    </>
  )

  function setFormValue(key: keyof OfferForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }
}

function OfferPreview({ form }: { form: OfferForm }) {
  const tone = form.tone === 'AMBER'
    ? 'border-amber-200 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/10'
    : form.tone === 'EMERALD'
      ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10'
      : form.tone === 'VIOLET'
        ? 'border-violet-200 bg-violet-50 dark:border-violet-500/25 dark:bg-violet-500/10'
        : 'border-cyan-200 bg-cyan-50 dark:border-cyan-500/25 dark:bg-cyan-500/10'

  return (
    <div className={cn('rounded-lg border p-4', tone)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-slate-500">
            <span>{form.eyebrow || 'Метка оффера'}</span>
            {form.meta ? <span className="badge-muted normal-case">{form.meta}</span> : null}
          </div>
          <h3 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">{form.title || 'Заголовок оффера'}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{form.description || 'Описание появится здесь.'}</p>
        </div>
        <span className="btn-primary shrink-0">{form.cta || 'Кнопка'}</span>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  )
}

function WelcomeBonusOption({
  title,
  description,
  icon,
  checked,
  onToggle,
  children,
}: {
  title: string
  description: string
  icon: React.ReactNode
  checked: boolean
  onToggle: (checked: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className={cn(
      'flex min-h-36 flex-col rounded-xl border bg-white p-3 shadow-sm transition-colors dark:bg-surface-900',
      checked ? 'border-emerald-300 ring-2 ring-emerald-100 dark:border-emerald-500/40 dark:ring-emerald-500/10' : 'border-slate-200 dark:border-white/10'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-950 dark:text-white">{title}</div>
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>
          </div>
        </div>
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </div>
      <div className={cn('mt-3', !checked && 'opacity-50')}>{children}</div>
    </div>
  )
}

function toForm(offer?: Offer): OfferForm {
  return {
    enabled: offer?.enabled ?? true,
    priority: offer?.priority ?? 0,
    eyebrow: offer?.eyebrow ?? '',
    title: offer?.title ?? '',
    description: offer?.description ?? '',
    cta: offer?.cta ?? '',
    href: offer?.href ?? '',
    meta: offer?.meta ?? '',
    tone: offer?.tone ?? 'CYAN',
    promoCodeId: offer?.promoCodeId ?? '',
  }
}

function toWelcomeForm(setting: WelcomeBonus): WelcomeBonusForm {
  return {
    enabled: setting?.enabled ?? false,
    trialEnabled: setting?.trialEnabled ?? setting?.type === 'TRIAL_PLAN',
    trialPlanId: setting?.trialPlanId ?? '',
    bonusAttemptsEnabled: setting?.bonusAttemptsEnabled ?? setting?.type === 'BONUS_BOX_ATTEMPTS',
    bonusAttempts: setting?.bonusAttempts || 10,
    promoCodeEnabled: setting?.promoCodeEnabled ?? setting?.type === 'PROMO_CODE',
    promoCodeId: setting?.promoCodeId ?? '',
  }
}

function rewardSummary(offer: Offer) {
  const parts: string[] = []

  if (offer.scenario === 'RETURN_PROMO') {
    parts.push(
      offer.promoCode
        ? `промокод ${offer.promoCode.code} на ${offer.promoCode.discountPercent}%`
        : 'лучший доступный промокод автоматически'
    )
  }

  return parts.length > 0 ? parts.join(' · ') : 'только переход по кнопке'
}

function welcomeSummary(
  form: WelcomeBonusForm,
  trialPlans: Array<{ id: string; name: string; durationDays: number }>,
  promoCodes: Array<{ id: string; code: string; discountPercent: number }>
) {
  if (!form.enabled) return 'выключен'
  const parts: string[] = []
  if (form.trialEnabled) {
    const plan = trialPlans.find((item) => item.id === form.trialPlanId)
    parts.push(plan ? `пробный тариф ${plan.name} на ${plan.durationDays} дн.` : 'пробный тариф не выбран')
  }
  if (form.promoCodeEnabled) {
    const promoCode = promoCodes.find((item) => item.id === form.promoCodeId)
    parts.push(promoCode ? `промокод ${promoCode.code} на ${promoCode.discountPercent}%` : 'промокод не выбран')
  }
  if (form.bonusAttemptsEnabled) parts.push(`${form.bonusAttempts || 1} прокруток рулетки`)
  return parts.length ? parts.join(' · ') : 'варианты не выбраны'
}
