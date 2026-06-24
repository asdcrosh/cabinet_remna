'use client'

import { type ReactNode, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, CalendarPlus, CreditCard, Gift, LockKeyhole, Sparkles, TicketPercent, Users, Zap } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/cn'

type PrizeType = 'SUBSCRIPTION_DAYS' | 'TRAFFIC_GB' | 'PROMO_CODE_PERCENT' | 'BONUS_ATTEMPTS'
type Rarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

export type BonusBoxPrizeView = {
  id: string
  title: string
  description: string | null
  type: PrizeType
  value: number
  weight: number
  rarity: Rarity
  chance: number
}

type BonusBoxOpeningView = {
  id: string
  createdAt: string
  prize: BonusBoxPrizeView
  promoCode: string | null
  promoCodeExpiresAt: string | null
}

type BonusBoxConfigView = {
  rubPerAttempt: number
  minAttemptsPerPayment: number
  maxAttemptsPerPayment: number
  attemptTtlDays: number
  weeklyEnabled: boolean
  weeklyDay: number
  weeklyAttempts: number
  weeklyMaxBalance: number
  referrerAttempts: number
  referredAttempts: number
}

type BonusBoxOverview = {
  config: BonusBoxConfigView
  hasActiveSubscription: boolean
  attemptsCount: number
  prizes: BonusBoxPrizeView[]
  openings: BonusBoxOpeningView[]
}

type OpenBoxResponse = {
  id: string
  prize: BonusBoxPrizeView
  reel: BonusBoxPrizeView[]
  winningIndex: number
  stopOffsetRatio: number
  promoCode: string | null
  promoCodeExpiresAt: string | null
  remainingAttempts: number
  remoteSynced: boolean
}

const CARD_WIDTH = 176
const CARD_GAP = 14
const STEP = CARD_WIDTH + CARD_GAP

export function BonusBoxClient({ initialData }: { initialData: BonusBoxOverview }) {
  const router = useRouter()
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [data, setData] = useState(initialData)
  const [reel, setReel] = useState(() => makeIdleReel(initialData.prizes))
  const [offset, setOffset] = useState(0)
  const [opening, setOpening] = useState(false)
  const [result, setResult] = useState<OpenBoxResponse | null>(null)

  const canOpen =
    data.hasActiveSubscription && data.attemptsCount > 0 && data.prizes.length > 0 && !opening
  const openButtonLabel = opening
    ? 'Открываем...'
    : data.attemptsCount <= 0
        ? 'Нет открытий'
        : !data.hasActiveSubscription
          ? 'Нужна подписка'
          : data.prizes.length === 0
            ? 'Подарки не настроены'
            : 'Открыть бокс'
  const totalChance = useMemo(
    () => data.prizes.reduce((sum, prize) => sum + prize.chance, 0),
    [data.prizes]
  )

  async function refreshOverview() {
    const overview = await apiFetch<BonusBoxOverview>('/api/bonus-box')
    setData(overview)
    router.refresh()
  }

  async function openBox() {
    if (!canOpen) return
    setOpening(true)
    setResult(null)
    setOffset(0)

    try {
      const response = await apiFetch<OpenBoxResponse>('/api/bonus-box', { method: 'POST' })
      setReel(response.reel)

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = response.winningIndex * STEP + CARD_WIDTH * response.stopOffsetRatio
          setOffset(-target)
        })
      })

      window.setTimeout(async () => {
        setResult(response)
        setData((current) => ({ ...current, attemptsCount: response.remainingAttempts }))
        if (!response.remoteSynced) {
          toast('Подарок сохранён, синхронизация с VPN будет повторена', 'success')
        } else {
          toast('Подарок начислен', 'success')
        }
        await refreshOverview().catch(() => undefined)
        setOpening(false)
      }, 5400)
    } catch {
      setOpening(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-surface-900">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_300px] lg:items-center">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                Подарочный бокс
              </span>
              <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {data.attemptsCount} открытий
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                  data.hasActiveSubscription
                    ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                )}
              >
                {!data.hasActiveSubscription && <LockKeyhole className="h-3.5 w-3.5" />}
                {data.hasActiveSubscription ? 'Подписка активна' : 'Нужна подписка'}
              </span>
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Откройте бокс</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Внутри дни подписки, трафик и персональные скидки. Открытия начисляются за оплаты, рефералов и еженедельный бонус.
              </p>
            </div>
          </div>
          <div className="min-w-0">
            <button
              type="button"
              className="group relative h-12 w-full overflow-hidden rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 dark:disabled:bg-white/10 dark:disabled:text-slate-500"
              onClick={openBox}
              disabled={!canOpen}
            >
              <span className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[120%]" />
              <span className="relative flex items-center justify-center gap-2">
                <Gift className="h-5 w-5" />
                {openButtonLabel}
              </span>
            </button>
            {!data.hasActiveSubscription && data.attemptsCount > 0 && (
              <div className="mt-2 text-center text-xs text-slate-400">
                Открытия сохраняются, активируйте подписку для получения подарка.
              </div>
            )}
          </div>
        </div>

        <div className="relative border-y border-slate-100 bg-slate-950 py-7 shadow-inner shadow-black/25 dark:border-white/10 sm:py-8">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent sm:w-40" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-slate-950 via-slate-950/80 to-transparent sm:w-40" />
          <div className="pointer-events-none absolute inset-y-5 left-1/2 z-30 w-px -translate-x-1/2 bg-cyan-100/90 shadow-[0_0_18px_rgba(165,243,252,.72)]" />
          <div className="pointer-events-none absolute left-1/2 top-3 z-30 h-0 w-0 -translate-x-1/2 border-x-[11px] border-t-[16px] border-x-transparent border-t-cyan-100/90" />
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 h-0 w-0 -translate-x-1/2 border-x-[11px] border-b-[16px] border-x-transparent border-b-cyan-100/90" />

          <div ref={viewportRef} className="overflow-hidden">
            <div
              className="flex will-change-transform"
              style={{
                gap: `${CARD_GAP}px`,
                transform: `translate3d(${offset}px,0,0)`,
                transition: opening ? 'transform 5.2s cubic-bezier(.12,.78,.1,1)' : 'none',
                paddingLeft: '50%',
                paddingRight: '50%',
              }}
            >
              {reel.map((prize, index) => (
                <PrizeCard key={`${prize.id}-${index}`} prize={prize} compact />
              ))}
            </div>
          </div>
        </div>

        {result && (
          <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                <Sparkles className="h-4 w-4" />
                Ваш подарок
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{result.prize.title}</div>
              {result.prize.description && (
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{result.prize.description}</div>
              )}
              {result.promoCode && (
                <div className="mt-3 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                  <TicketPercent className="h-4 w-4 shrink-0" />
                  <span className="break-all">{result.promoCode}</span>
                  {result.promoCodeExpiresAt && (
                    <span className="text-xs font-medium text-emerald-700/80 dark:text-emerald-100/75">
                      до {formatDateOnly(result.promoCodeExpiresAt)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setResult(null)}
            >
              Закрыть
            </button>
          </div>
        )}
      </section>

      <BonusBoxRules config={data.config} hasActiveSubscription={data.hasActiveSubscription} />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Подарки внутри</h2>
            <div className="text-sm text-slate-500">{Math.round(totalChance * 100)}%</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.prizes.map((prize) => (
              <PrizeCard key={prize.id} prize={prize} />
            ))}
            {data.prizes.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-surface-900">
                Подарки скоро появятся.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-900">
          <h2 className="text-lg font-semibold">Ваши подарки</h2>
          <div className="mt-4 space-y-3">
            {data.openings.map((opening) => (
              <div key={opening.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/10 dark:bg-surface-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{opening.prize.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatDate(opening.createdAt)}</div>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', rarityClass(opening.prize.rarity))}>
                    {rarityLabel(opening.prize.rarity)}
                  </span>
                </div>
                {opening.promoCode && (
                  <div className="mt-2 break-all rounded-md bg-white px-2 py-1 font-mono text-xs text-slate-700 dark:bg-surface-950 dark:text-slate-200">
                    {opening.promoCode}
                    {opening.promoCodeExpiresAt && (
                      <span className="ml-2 font-sans text-slate-500">
                        до {formatDateOnly(opening.promoCodeExpiresAt)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {data.openings.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-white/10">
                История пока пустая.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function BonusBoxRules({
  config,
  hasActiveSubscription,
}: {
  config: BonusBoxConfigView
  hasActiveSubscription: boolean
}) {
  const paymentRange =
    config.minAttemptsPerPayment > 0
      ? `${config.minAttemptsPerPayment}-${config.maxAttemptsPerPayment}`
      : `до ${config.maxAttemptsPerPayment}`
  const referralText =
    config.referrerAttempts > 0 || config.referredAttempts > 0
      ? `За приглашение после первой оплаты: вам +${config.referrerAttempts}, другу +${config.referredAttempts}.`
      : 'Реферальные открытия сейчас не начисляются.'
  const weeklyText =
    config.weeklyEnabled && config.weeklyAttempts > 0
      ? `Раз в неделю с дня "${weekdayLabel(config.weeklyDay)}": +${config.weeklyAttempts}, если VPN-подписка активна.`
      : 'Еженедельный бонус сейчас выключен.'
  const ttlText = config.attemptTtlDays > 0
    ? `Открытия хранятся ${config.attemptTtlDays} дн.`
    : 'Открытия не сгорают.'

  return (
    <section className="grid gap-3 md:grid-cols-3">
      <RuleCard
        icon={<CreditCard className="h-5 w-5" />}
        title="За оплату"
        text={`1 открытие за каждые ${config.rubPerAttempt} ₽. За платеж можно получить ${paymentRange}.`}
      />
      <RuleCard
        icon={<Users className="h-5 w-5" />}
        title="За приглашения"
        text={referralText}
      />
      <RuleCard
        icon={<CalendarClock className="h-5 w-5" />}
        title="Еженедельно"
        text={`${weeklyText} ${ttlText}`}
        muted={!hasActiveSubscription}
      />
    </section>
  )
}

function RuleCard({
  icon,
  title,
  text,
  muted = false,
}: {
  icon: ReactNode
  title: string
  text: string
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-surface-900',
        muted && 'bg-slate-50 text-slate-500 dark:bg-surface-900/70 dark:text-slate-400'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{text}</div>
        </div>
      </div>
    </div>
  )
}

function PrizeCard({ prize, compact = false }: { prize: BonusBoxPrizeView; compact?: boolean }) {
  const Icon =
    prize.type === 'SUBSCRIPTION_DAYS'
      ? CalendarPlus
      : prize.type === 'TRAFFIC_GB'
        ? Zap
        : prize.type === 'BONUS_ATTEMPTS'
          ? Gift
          : TicketPercent

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-lg border p-3 transition-transform duration-200',
        compact
          ? 'h-36 text-white shadow-[0_18px_42px_rgba(0,0,0,.28)]'
          : 'min-h-[132px] bg-white shadow-sm hover:-translate-y-0.5 dark:bg-surface-900',
        compact ? rarityReelClass(prize.rarity) : rarityBorderClass(prize.rarity)
      )}
      style={compact ? { width: CARD_WIDTH } : undefined}
    >
      <div className={cn('absolute inset-x-0 top-0 h-1', rarityTopClass(prize.rarity))} />
      {compact && (
        <>
          <div className={cn('absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl', rarityGlowClass(prize.rarity))} />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.14),transparent_38%),radial-gradient(circle_at_50%_115%,rgba(255,255,255,.12),transparent_48%)]" />
        </>
      )}

      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={cn('truncate font-semibold', compact && 'text-lg text-white')}>{prize.title}</div>
          <div className={cn('mt-1 text-xs', compact ? 'text-slate-300' : 'text-slate-500')}>
            {prizeLabel(prize)}
          </div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold', rarityClass(prize.rarity))}>
          {rarityLabel(prize.rarity)}
        </span>
      </div>
      {compact && (
        <div className="relative mt-6 flex items-end justify-between">
          <div className="grid h-12 w-12 place-items-center rounded-lg border border-white/10 bg-white/10 text-white shadow-inner shadow-white/5">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex items-end gap-1">
            <span className={cn('h-5 w-1 rounded-full', rarityTopClass(prize.rarity))} />
            <span className={cn('h-8 w-1 rounded-full', rarityTopClass(prize.rarity))} />
            <span className={cn('h-3 w-1 rounded-full', rarityTopClass(prize.rarity))} />
          </div>
        </div>
      )}
      {!compact && prize.description && (
        <p className="mt-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{prize.description}</p>
      )}
      {!compact && (
        <div className="mt-4 text-xs text-slate-400">Шанс {(prize.chance * 100).toFixed(1)}%</div>
      )}
    </div>
  )
}

function makeIdleReel(prizes: BonusBoxPrizeView[]) {
  if (prizes.length === 0) return []
  return Array.from({ length: 40 }, (_, index) => prizes[index % prizes.length])
}

function prizeLabel(prize: BonusBoxPrizeView) {
  if (prize.type === 'SUBSCRIPTION_DAYS') return `+${prize.value} дн.`
  if (prize.type === 'TRAFFIC_GB') return `+${prize.value} ГБ`
  if (prize.type === 'BONUS_ATTEMPTS') return `+${prize.value} открытий`
  return `-${prize.value}%`
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

function rarityBorderClass(rarity: Rarity) {
  if (rarity === 'LEGENDARY') return 'border-amber-200 dark:border-amber-500/40'
  if (rarity === 'EPIC') return 'border-fuchsia-200 dark:border-fuchsia-500/40'
  if (rarity === 'RARE') return 'border-cyan-200 dark:border-cyan-500/40'
  return 'border-slate-200 dark:border-white/10'
}

function rarityReelClass(rarity: Rarity) {
  if (rarity === 'LEGENDARY') return 'border-amber-300 bg-[linear-gradient(135deg,#451a03,#78350f_58%,#111827)] shadow-amber-950/30'
  if (rarity === 'EPIC') return 'border-fuchsia-300 bg-[linear-gradient(135deg,#3b0764,#701a75_58%,#111827)] shadow-fuchsia-950/30'
  if (rarity === 'RARE') return 'border-cyan-300 bg-[linear-gradient(135deg,#083344,#164e63_58%,#111827)] shadow-cyan-950/30'
  return 'border-slate-700 bg-[linear-gradient(135deg,#0f172a,#111827_58%,#020617)]'
}

function rarityGlowClass(rarity: Rarity) {
  if (rarity === 'LEGENDARY') return 'bg-amber-300/45'
  if (rarity === 'EPIC') return 'bg-fuchsia-300/40'
  if (rarity === 'RARE') return 'bg-cyan-300/40'
  return 'bg-slate-300/25'
}

function rarityTopClass(rarity: Rarity) {
  if (rarity === 'LEGENDARY') return 'bg-amber-400'
  if (rarity === 'EPIC') return 'bg-fuchsia-400'
  if (rarity === 'RARE') return 'bg-cyan-400'
  return 'bg-slate-400'
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateOnly(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function weekdayLabel(day: number) {
  const labels = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
  return labels[day] ?? 'Пятница'
}
