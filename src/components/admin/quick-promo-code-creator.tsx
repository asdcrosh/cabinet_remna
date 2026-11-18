'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import {
  QUICK_PROMO_AUDIENCES,
  buildQuickPromoCodePayload,
  suggestQuickPromoCode,
  type QuickPromoAudience,
  type QuickPromoOption,
} from '@/lib/admin-quick-promo'

/** Кнопка «Новый промокод» под выбором промокода. */
export function QuickPromoCodeToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-cyan-700 hover:text-cyan-900 dark:text-cyan-300 dark:hover:text-cyan-100"
    >
      <Plus className="h-4 w-4" />
      Новый промокод
    </button>
  )
}

/**
 * Короткая форма создания промокода внутри другой формы: код, скидка, кому.
 * Не <form>, чтобы не вкладываться в форму-родителя; Enter в полях тоже создаёт код.
 */
export function QuickPromoCodeCreator({
  codePrefix,
  defaultAudience = 'ALL',
  defaultDiscount = '10',
  onCreated,
  onCancel,
}: {
  codePrefix: string
  defaultAudience?: QuickPromoAudience
  defaultDiscount?: string
  onCreated: (promoCode: QuickPromoOption) => void
  onCancel: () => void
}) {
  const id = useId()
  const [discountPercent, setDiscountPercent] = useState(defaultDiscount)
  const [code, setCode] = useState(() => suggestQuickPromoCode(codePrefix, defaultDiscount))
  const [codeTouched, setCodeTouched] = useState(false)
  const [audience, setAudience] = useState<QuickPromoAudience>(defaultAudience)
  const [loading, setLoading] = useState(false)

  async function create() {
    if (loading) return
    const result = buildQuickPromoCodePayload({ code, discountPercent, audience })
    if (!result.ok) {
      toast(result.error)
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch<{ promoCode: QuickPromoOption }>('/api/admin/promo-codes', {
        method: 'POST',
        body: JSON.stringify(result.payload),
      })
      toast(`Промокод ${response.promoCode.code} создан и выбран`, 'success')
      onCreated({
        id: response.promoCode.id,
        code: response.promoCode.code,
        discountPercent: response.promoCode.discountPercent,
      })
    } catch {
      // apiFetch уже покажет ошибку (например, код занят).
    } finally {
      setLoading(false)
    }
  }

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void create()
  }

  return (
    <div
      role="group"
      aria-labelledby={`${id}-title`}
      data-testid="quick-promo-creator"
      className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-3 dark:border-white/15 dark:bg-white/[0.03]"
    >
      <div id={`${id}-title`} className="text-sm font-semibold text-slate-900 dark:text-white">Новый промокод</div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Код</span>
          <input
            className="input font-mono uppercase"
            value={code}
            maxLength={32}
            onChange={(event) => {
              setCode(event.target.value)
              setCodeTouched(true)
            }}
            onKeyDown={submitOnEnter}
            autoFocus
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Скидка, %</span>
          <input
            className="input"
            type="number"
            min={1}
            max={99}
            value={discountPercent}
            onChange={(event) => {
              setDiscountPercent(event.target.value)
              if (!codeTouched) setCode(suggestQuickPromoCode(codePrefix, event.target.value))
            }}
            onKeyDown={submitOnEnter}
          />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Кому доступен</span>
        <select className="input" value={audience} onChange={(event) => setAudience(event.target.value as QuickPromoAudience)}>
          {QUICK_PROMO_AUDIENCES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>
      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
        Без срока и общего лимита, на все тарифы. Остальные условия можно поменять в «Промокодах».
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button type="button" className="btn-secondary justify-center" onClick={onCancel} disabled={loading}>
          Отмена
        </button>
        <button type="button" className="btn-primary justify-center" onClick={() => void create()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {loading ? 'Создаём...' : 'Создать и выбрать'}
        </button>
      </div>
    </div>
  )
}
