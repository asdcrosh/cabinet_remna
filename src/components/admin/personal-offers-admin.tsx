'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PersonalOfferSetting, PersonalOfferTone, PersonalOfferWelcomeBonusType } from '@prisma/client'
import { Edit3, Sparkles } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import {
  personalOfferPlaceholders,
  personalOfferScenarioLabels,
  personalOfferToneLabels,
  personalOfferWelcomeBonusLabels,
} from '@/lib/personal-offers'

type Offer = PersonalOfferSetting & {
  promoCode?: { id: string; code: string; discountPercent: number; isActive: boolean } | null
  welcomeTrialPlan?: { id: string; name: string; durationDays: number; isActive: boolean } | null
}

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
  welcomeBonusEnabled: boolean
  welcomeBonusType: PersonalOfferWelcomeBonusType
  welcomeTrialPlanId: string
  welcomeBonusAttempts: number
}

export function PersonalOffersAdmin({
  offers,
  promoCodes,
  trialPlans,
}: {
  offers: Offer[]
  promoCodes: Array<{ id: string; code: string; discountPercent: number }>
  trialPlans: Array<{ id: string; name: string; durationDays: number }>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<Offer | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<OfferForm>(() => toForm(offers[0]))

  const activeOffer = useMemo(() => editing, [editing])

  function openEdit(offer: Offer) {
    setEditing(offer)
    setForm(toForm(offer))
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

  return (
    <>
      <section className="grid gap-3 xl:grid-cols-2">
        {offers.map((offer) => (
          <article key={offer.id} className="surface-card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={offer.enabled ? 'badge-active' : 'badge-muted'}>
                    {offer.enabled ? 'Включён' : 'Выключен'}
                  </span>
                  <span className="badge bg-slate-100 text-slate-600">#{offer.priority}</span>
                  <span className="text-sm font-medium text-slate-500">
                    {personalOfferScenarioLabels[offer.scenario]}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-semibold text-slate-950 dark:text-white">{offer.title}</h2>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{offer.description}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2 py-1">{offer.eyebrow}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1">{personalOfferToneLabels[offer.tone]}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1">{offer.cta}</span>
                </div>
                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-950">Выдача: </span>
                  {rewardSummary(offer)}
                </div>
              </div>
              <button type="button" className="btn-secondary min-h-10 shrink-0 px-3" onClick={() => openEdit(offer)}>
                <Edit3 className="h-4 w-4" />
                Изменить
              </button>
            </div>
          </article>
        ))}
      </section>

      <AdminModal
        open={Boolean(activeOffer)}
        title={activeOffer ? personalOfferScenarioLabels[activeOffer.scenario] : 'Оффер'}
        description="Текст поддерживает подстановки. Ссылка должна вести внутри кабинета."
        size="lg"
        onClose={() => setEditing(null)}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem_12rem]">
            <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              <span className="text-sm font-medium">Показывать оффер</span>
            </label>
            <Field label="Приоритет">
              <input
                className="input"
                type="number"
                min={0}
                max={1000}
                value={form.priority}
                onChange={(event) => setForm((prev) => ({ ...prev, priority: Number(event.target.value) }))}
              />
            </Field>
            <Field label="Цвет">
              <select
                className="input"
                value={form.tone}
                onChange={(event) => setForm((prev) => ({ ...prev, tone: event.target.value as PersonalOfferTone }))}
              >
                {Object.entries(personalOfferToneLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Метка">
              <input className="input" value={form.eyebrow} onChange={(event) => setFormValue('eyebrow', event.target.value)} />
            </Field>
            <Field label="Кнопка">
              <input className="input" value={form.cta} onChange={(event) => setFormValue('cta', event.target.value)} />
            </Field>
          </div>

          <Field label="Заголовок">
            <input className="input" value={form.title} onChange={(event) => setFormValue('title', event.target.value)} />
          </Field>
          <Field label="Описание">
            <textarea
              className="input min-h-28 resize-y"
              value={form.description}
              onChange={(event) => setFormValue('description', event.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ссылка">
              <input className="input" value={form.href} onChange={(event) => setFormValue('href', event.target.value)} />
            </Field>
            <Field label="Подпись">
              <input className="input" value={form.meta} onChange={(event) => setFormValue('meta', event.target.value)} />
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">Что выдавать пользователю</div>
              <div className="text-sm text-slate-500">
                Здесь задается промокод для возврата или приветственный бонус для новых пользователей.
              </div>
            </div>
            <Field label="Промокод для оффера">
              <select
                className="input"
                value={form.promoCodeId}
                onChange={(event) => setFormValue('promoCodeId', event.target.value)}
              >
                <option value="">Автоматически</option>
                {promoCodes.map((promoCode) => (
                  <option key={promoCode.id} value={promoCode.id}>
                    {promoCode.code} · {promoCode.discountPercent}%
                  </option>
                ))}
              </select>
            </Field>
            <div className="text-sm leading-6 text-slate-500">
              Работает для оффера “Давно не покупал”. Если не выбрать, кабинет покажет лучший доступный промокод.
            </div>
          </div>

          {activeOffer?.scenario === 'NO_SUBSCRIPTION' && (
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.welcomeBonusEnabled}
                  onChange={(event) => setForm((prev) => ({ ...prev, welcomeBonusEnabled: event.target.checked }))}
                />
                <span className="text-sm font-semibold text-emerald-950">Включить приветственный бонус новым пользователям</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Тип бонуса">
                  <select
                    className="input"
                    value={form.welcomeBonusType}
                    onChange={(event) => setForm((prev) => ({ ...prev, welcomeBonusType: event.target.value as PersonalOfferWelcomeBonusType }))}
                  >
                    {Object.entries(personalOfferWelcomeBonusLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Пробный тариф">
                  <select
                    className="input"
                    value={form.welcomeTrialPlanId}
                    onChange={(event) => setFormValue('welcomeTrialPlanId', event.target.value)}
                    disabled={form.welcomeBonusType !== 'TRIAL_PLAN'}
                  >
                    <option value="">Выберите тариф</option>
                    {trialPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} · {plan.durationDays} дн.
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Открытий">
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={20}
                    value={form.welcomeBonusAttempts}
                    disabled={form.welcomeBonusType !== 'BONUS_BOX_ATTEMPTS'}
                    onChange={(event) => setForm((prev) => ({ ...prev, welcomeBonusAttempts: Number(event.target.value) }))}
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-cyan-100 bg-cyan-50/80 p-3 text-sm text-cyan-900">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4" />
              Подстановки
            </div>
            <div className="flex flex-wrap gap-2">
              {personalOfferPlaceholders.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-md border border-cyan-200 bg-white px-2 py-1 font-mono text-xs text-cyan-800"
                  onClick={() => setFormValue('description', `${form.description} ${item}`.trim())}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
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
    welcomeBonusEnabled: offer?.welcomeBonusEnabled ?? false,
    welcomeBonusType: offer?.welcomeBonusType ?? 'NONE',
    welcomeTrialPlanId: offer?.welcomeTrialPlanId ?? '',
    welcomeBonusAttempts: offer?.welcomeBonusAttempts ?? 1,
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

  if (offer.scenario === 'NO_SUBSCRIPTION') {
    if (!offer.welcomeBonusEnabled || offer.welcomeBonusType === 'NONE') {
      parts.push('приветственный бонус выключен')
    } else if (offer.welcomeBonusType === 'TRIAL_PLAN') {
      parts.push(offer.welcomeTrialPlan ? `пробный тариф ${offer.welcomeTrialPlan.name}` : 'пробный тариф не выбран')
    } else {
      parts.push(`${offer.welcomeBonusAttempts || 1} открытий бонус-бокса`)
    }
  }

  return parts.length > 0 ? parts.join(' · ') : 'только переход по кнопке'
}
