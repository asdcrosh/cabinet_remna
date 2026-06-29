'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PersonalOfferSetting, PersonalOfferTone } from '@prisma/client'
import { Edit3, Sparkles } from 'lucide-react'
import { AdminModal } from '@/components/admin/admin-modal'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import {
  personalOfferPlaceholders,
  personalOfferScenarioLabels,
  personalOfferToneLabels,
} from '@/lib/personal-offers'

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
}

export function PersonalOffersAdmin({ offers }: { offers: PersonalOfferSetting[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<PersonalOfferSetting | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<OfferForm>(() => toForm(offers[0]))

  const activeOffer = useMemo(() => editing, [editing])

  function openEdit(offer: PersonalOfferSetting) {
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

function toForm(offer?: PersonalOfferSetting): OfferForm {
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
  }
}
