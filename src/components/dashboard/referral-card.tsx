'use client'

import { useState } from 'react'
import { Check, Copy, Send } from 'lucide-react'
import { toast } from '@/components/ui/toaster'
import type { ReferralSettings } from '@/lib/referral-settings'

export function ReferralLinkCard({
  code,
  url,
  settings,
}: {
  code: string
  url: string
  settings: ReferralSettings
}) {
  const [copied, setCopied] = useState(false)

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast('Ссылка скопирована', 'success')
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast('Не удалось скопировать ссылку', 'error')
    }
  }

  async function share() {
    const condition = settings.trigger === 'REGISTRATION'
      ? 'после регистрации'
      : settings.minimumPaymentKopecks > 0
        ? `после первой оплаты от ${Math.floor(settings.minimumPaymentKopecks / 100)} ₽`
        : 'после первой оплаты'
    const promotionEnd = settings.promotionEndsAt
      ? ` Акция действует до ${formatPromotionEnd(settings.promotionEndsAt)}.`
      : ''
    const text = `Присоединяйся по моей ссылке. ${referralRewardText(settings, 'referred', 'Ты')} ${condition}, а ${referralRewardText(settings, 'referrer', 'я').toLowerCase()}.${promotionEnd}`
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Приглашение',
          text,
          url,
        })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copy(url)
  }

  return (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.035] sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-full">
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-950 dark:text-white">Ваша ссылка</span>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
              {settings.trigger === 'REGISTRATION' ? 'за регистрацию' : 'за первую оплату'}
            </span>
            {settings.promotionEndsAt && (
              <span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">
                до {formatPromotionEnd(settings.promotionEndsAt)}
              </span>
            )}
          </div>
          <div className="mt-3 flex min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-surface-950/70">
            <div className="min-w-0 flex-1 overflow-hidden truncate font-mono text-xs text-slate-600 dark:text-slate-300 sm:text-sm">{url}</div>
            <button
              type="button"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              onClick={() => copy(url)}
              aria-label="Копировать ссылку"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Код</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 font-mono font-semibold text-slate-800 dark:bg-white/10 dark:text-white">{code}</span>
            <span className="min-w-0">{referralRewardText(settings, 'referrer', 'Вам')}</span>
            <span className="text-slate-300 dark:text-white/20">·</span>
            <span className="min-w-0">{referralRewardText(settings, 'referred', 'Другу')}</span>
          </div>
        </div>
        <div className="min-w-0 max-w-full lg:w-auto">
          <button type="button" className="btn-primary" onClick={share}>
            <Send className="h-4 w-4" />
            Поделиться
          </button>
        </div>
      </div>
    </div>
  )
}

function referralRewardText(
  settings: ReferralSettings,
  side: 'referrer' | 'referred',
  subject: string
) {
  const days = side === 'referrer' ? settings.referrerBonusDays : settings.referredBonusDays
  const attempts = side === 'referrer' ? settings.referrerAttempts : settings.referredAttempts
  const rewards = []
  if (days > 0) rewards.push(`+${days} дн.`)
  if (attempts > 0) rewards.push(`+${attempts} ${attemptWord(attempts)}`)
  return `${subject}: ${rewards.join(' и ') || 'без награды'}`
}

function attemptWord(value: number) {
  const mod100 = value % 100
  const mod10 = value % 10
  if (mod100 >= 11 && mod100 <= 14) return 'попыток'
  if (mod10 === 1) return 'попытка'
  if (mod10 >= 2 && mod10 <= 4) return 'попытки'
  return 'попыток'
}

function formatPromotionEnd(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  })
}
