"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  CircleSlash,
  Copy,
  CreditCard,
  Gift,
  Sparkles,
  ShoppingCart,
  TicketPercent,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";

type PrizeType =
  | "SUBSCRIPTION_DAYS"
  | "TRAFFIC_GB"
  | "PROMO_CODE_PERCENT"
  | "BONUS_ATTEMPTS"
  | "NO_PRIZE";
type Rarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

export type BonusBoxPrizeView = {
  id: string;
  title: string;
  description: string | null;
  type: PrizeType;
  value: number;
  weight: number;
  rarity: Rarity;
  chance: number;
};

type BonusBoxOpeningView = {
  id: string;
  createdAt: string;
  prize: BonusBoxPrizeView;
  promoCode: string | null;
  promoCodeExpiresAt: string | null;
};

type BonusBoxConfigView = {
  enabled: boolean;
  rubPerAttempt: number;
  minAttemptsPerPayment: number;
  maxAttemptsPerPayment: number;
  attemptTtlDays: number;
  weeklyEnabled: boolean;
  weeklyDay: number;
  weeklyAttempts: number;
  weeklyMaxBalance: number;
  referrerAttempts: number;
  referredAttempts: number;
  pityEnabled: boolean;
  pityOpenings: number;
  showBestRecentOpening: boolean;
  activePromoRewardsLimit: number;
};

type BonusBoxPityProgress = {
  enabled: boolean;
  threshold: number;
  current: number;
  remaining: number | null;
  guaranteedNext: boolean;
};

type BonusBoxOpeningStreak = {
  current: number;
  nextTarget: number | null;
  targets: number[];
  completed: number[];
};

type ActivePromoRewardView = {
  id: string;
  code: string;
  discountPercent: number;
  expiresAt: string | null;
  prizeTitle: string;
  createdAt: string;
};

type BestRecentOpeningView = {
  id: string;
  title: string;
  label: string;
  rarity: Rarity;
  userLabel: string;
  createdAt: string;
};

type BonusBoxOverview = {
  config: BonusBoxConfigView;
  hasActiveSubscription: boolean;
  attemptsCount: number;
  welcomeAttemptsCount: number;
  canOpenReason: string | null;
  pityProgress: BonusBoxPityProgress;
  openingStreak: BonusBoxOpeningStreak;
  bestRecentOpening: BestRecentOpeningView | null;
  activePromoRewards: ActivePromoRewardView[];
  prizes: BonusBoxPrizeView[];
  openings: BonusBoxOpeningView[];
};

type OpenBoxResponse = {
  id: string;
  prize: BonusBoxPrizeView;
  reel: BonusBoxPrizeView[];
  winningIndex: number;
  stopOffsetRatio: number;
  promoCode: string | null;
  promoCodeExpiresAt: string | null;
  remainingAttempts: number;
  remoteSynced: boolean;
};

type BonusBoxTab = "outcomes" | "history" | "rules";

const DESKTOP_CARD_WIDTH = 184;
const MOBILE_CARD_WIDTH = 138;
const DESKTOP_CARD_GAP = 14;
const MOBILE_CARD_GAP = 12;
const OPENING_EFFECT_PARTICLES = [
  { x: 7, delay: 0, size: 3, drift: -22, duration: 1700 },
  { x: 13, delay: 180, size: 5, drift: 30, duration: 1900 },
  { x: 19, delay: 320, size: 2, drift: -16, duration: 1600 },
  { x: 26, delay: 80, size: 4, drift: 18, duration: 2100 },
  { x: 32, delay: 430, size: 3, drift: -34, duration: 1800 },
  { x: 39, delay: 220, size: 6, drift: 26, duration: 2300 },
  { x: 45, delay: 540, size: 3, drift: -20, duration: 1700 },
  { x: 50, delay: 120, size: 7, drift: 0, duration: 2200 },
  { x: 56, delay: 360, size: 3, drift: 24, duration: 1650 },
  { x: 62, delay: 60, size: 5, drift: -28, duration: 2050 },
  { x: 69, delay: 480, size: 2, drift: 18, duration: 1750 },
  { x: 75, delay: 260, size: 4, drift: -18, duration: 2000 },
  { x: 82, delay: 640, size: 3, drift: 32, duration: 1850 },
  { x: 88, delay: 140, size: 5, drift: -26, duration: 2150 },
  { x: 94, delay: 520, size: 2, drift: 16, duration: 1600 },
] as const;

export function BonusBoxClient({
  initialData,
}: {
  initialData: BonusBoxOverview;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState(initialData);
  const [reel, setReel] = useState(() => makeIdleReel(initialData.prizes));
  const [offset, setOffset] = useState(0);
  const [opening, setOpening] = useState(false);
  const [revealEffect, setRevealEffect] = useState(false);
  const [result, setResult] = useState<OpenBoxResponse | null>(null);
  const [activeTab, setActiveTab] = useState<BonusBoxTab>("outcomes");
  const [mobileReel, setMobileReel] = useState(false);
  const canUseWelcomeAttempts =
    !data.hasActiveSubscription && data.welcomeAttemptsCount > 0;
  const cardWidth = mobileReel ? MOBILE_CARD_WIDTH : DESKTOP_CARD_WIDTH;
  const cardGap = mobileReel ? MOBILE_CARD_GAP : DESKTOP_CARD_GAP;
  const reelStep = cardWidth + cardGap;

  const canOpen = !data.canOpenReason && !opening;
  const subscribeCta = Boolean(data.canOpenReason?.includes("подписк"));
  const openButtonLabel = opening
    ? "Открываем..."
    : data.canOpenReason
      ? getDisabledCtaLabel(data.canOpenReason)
      : canUseWelcomeAttempts
        ? "Открыть приветственный бонус"
        : "Открыть кейс";
  const totalChance = useMemo(
    () => data.prizes.reduce((sum, prize) => sum + prize.chance, 0),
    [data.prizes],
  );
  const openButtonClass =
    "bonus-box-open-button group relative inline-flex min-h-11 items-center justify-center overflow-hidden rounded-lg border border-slate-950 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-950/15 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none dark:border-white dark:text-slate-950 dark:shadow-black/20 dark:hover:border-slate-200 dark:disabled:border-white/10 dark:disabled:bg-white/10 dark:disabled:text-slate-500 sm:min-w-44";
  const revealClass = result ? bonusBoxRevealClass(result.prize) : null;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setMobileReel(media.matches);

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  async function openBox() {
    if (!canOpen) return;
    setOpening(true);
    setRevealEffect(false);
    setResult(null);
    setOffset(0);

    try {
      const response = await apiFetch<OpenBoxResponse>("/api/bonus-box", {
        method: "POST",
      });
      setReel(response.reel);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const stopRatio = Math.min(0.72, Math.max(0.28, response.stopOffsetRatio));
          const target = response.winningIndex * reelStep + cardWidth * stopRatio;
          setOffset(-target);
        });
      });

      window.setTimeout(async () => {
        setResult(response);
        setRevealEffect(true);
        const freshData = await apiFetch<BonusBoxOverview>("/api/bonus-box").catch(() => null);
        if (freshData) {
          setData(freshData);
        } else {
          setData((current) => ({
            ...current,
            attemptsCount: response.remainingAttempts,
            openings: [
              {
                id: response.id,
                createdAt: new Date().toISOString(),
                prize: response.prize,
                promoCode: response.promoCode,
                promoCodeExpiresAt: response.promoCodeExpiresAt,
              },
              ...current.openings,
            ].slice(0, 12),
          }));
        }
        setOpening(false);
        window.setTimeout(() => setRevealEffect(false), 1600);
      }, 5900);
    } catch {
      setOpening(false);
      setRevealEffect(false);
    }
  }

  async function copyPromoCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast("Промокод скопирован", "success");
    } catch {
      toast("Не удалось скопировать промокод", "error");
    }
  }

  const openCaseCta = subscribeCta && !opening ? (
    <a href="/dashboard/plans" className={cn(openButtonClass, "w-full")}>
      <span className="relative flex items-center justify-center gap-2">
        <ShoppingCart className="h-4 w-4" />
        <span>{openButtonLabel}</span>
      </span>
    </a>
  ) : data.canOpenReason && !opening ? (
    <div className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300">
      <Gift className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
      <span>{openButtonLabel}</span>
    </div>
  ) : (
    <button
      type="button"
      className={cn(openButtonClass, "w-full")}
      onClick={openBox}
      disabled={!canOpen}
    >
      <span className="relative flex items-center justify-center gap-2">
        <Gift className="h-4 w-4" />
        <span>{opening ? "Открываем..." : openButtonLabel}</span>
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <section
        className={cn(
          "bonus-box-stage order-first overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/50 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/25",
          opening && "bonus-box-stage--opening",
          revealEffect && "bonus-box-stage--reveal",
          revealEffect && result?.prize.type !== "NO_PRIZE" && "bonus-box-stage--win",
          revealEffect && result?.prize.type === "NO_PRIZE" && "bonus-box-stage--empty",
          revealEffect && revealClass,
        )}
      >
        <div className="bonus-box-stage-header grid gap-2.5 border-b border-slate-200 px-3 py-2.5 dark:border-white/10 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-center sm:gap-3 sm:px-5 sm:py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">Рулетка бонусов</h2>
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-100">
                {data.attemptsCount} доступно
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
              {opening
                ? "Крутим и фиксируем подарок в центре."
                : result
                  ? `${rarityLabel(result.prize.rarity)} результат сохранён.`
                  : data.canOpenReason || "Нажмите кнопку, результат появится здесь."}
            </p>
          </div>
          <div className="min-w-0">
            {openCaseCta}
            {data.canOpenReason && !subscribeCta && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{data.canOpenReason}</p>
            )}
          </div>
        </div>

        <div className="bonus-box-reel-shell relative overflow-hidden py-3 sm:py-5">
          <BonusBoxOpeningEffects />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-white via-white/75 to-transparent dark:from-surface-900 dark:via-surface-900/75 sm:w-32" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-white via-white/75 to-transparent dark:from-surface-900 dark:via-surface-900/75 sm:w-32" />
          <div className="bonus-box-portal" aria-hidden="true">
            <div className="bonus-box-portal-core" />
            <div className="bonus-box-portal-line" />
          </div>

          <div ref={viewportRef} className="bonus-box-reel-viewport overflow-hidden">
            <div
              className="bonus-box-reel-track flex will-change-transform"
              style={{
                gap: `${cardGap}px`,
                transform: `translate3d(${offset}px,0,0)`,
                transition: opening
                  ? "transform 5.7s cubic-bezier(.08,.82,.07,1)"
                  : "none",
                paddingLeft: "50%",
                paddingRight: "50%",
              }}
            >
              {reel.map((prize, index) => (
                <PrizeCard
                  key={`${prize.id}-${index}`}
                  prize={prize}
                  compact
                  cardWidth={cardWidth}
                  highlighted={Boolean(revealEffect && result?.winningIndex === index)}
                />
              ))}
            </div>
          </div>
        </div>

        {(canUseWelcomeAttempts || (!data.hasActiveSubscription && data.attemptsCount > 0)) && (
          <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 sm:px-5">
            {canUseWelcomeAttempts
              ? "Приветственные открытия доступны без подписки."
              : "Открытия сохраняются на балансе. Активируйте подписку, чтобы забрать подарок."}
          </div>
        )}
      </section>

      {result && (
        <section
          className={cn(
            "bonus-box-result relative order-2 overflow-hidden rounded-lg border bg-white shadow-sm shadow-slate-200/60 dark:bg-surface-900 dark:shadow-black/20",
            result.prize.type === "NO_PRIZE"
              ? "border-red-200 dark:border-red-500/40"
              : "border-emerald-200 dark:border-emerald-500/30",
            bonusBoxResultClass(result.prize),
          )}
        >
          <div className="relative grid gap-4 p-4 sm:p-5 md:grid-cols-[auto_1fr_auto] md:items-center">
            <div
              className={cn(
                "grid h-14 w-14 place-items-center rounded-lg border shadow-inner",
                result.prize.type === "NO_PRIZE"
                  ? "border-red-200 bg-red-50 text-red-500 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                  : "border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
              )}
            >
              {result.prize.type === "NO_PRIZE" ? (
                <CircleSlash className="h-7 w-7" />
              ) : (
                <Sparkles className="h-7 w-7" />
              )}
            </div>

            <div className="min-w-0">
              <div
                className={cn(
                  "text-sm font-semibold uppercase tracking-wide",
                  result.prize.type === "NO_PRIZE"
                    ? "text-slate-500 dark:text-slate-400"
                    : "text-emerald-600 dark:text-emerald-300",
                )}
              >
                {result.prize.type === "NO_PRIZE" ? "Открытие завершено" : "Подарок начислен"}
              </div>
              <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {result.prize.title}
              </div>
              {(result.prize.description ||
                result.prize.type === "NO_PRIZE") && (
                <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {result.prize.description || "В этот раз без начисления. Следующее открытие может быть удачнее."}
                </div>
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

            <div className="flex flex-col gap-2 md:justify-self-end">
              {result.promoCode && (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => copyPromoCode(result.promoCode!)}
                  >
                    <Copy className="h-4 w-4" />
                    Скопировать
                  </button>
                  <a className="btn-secondary" href={`/dashboard/plans?promo=${encodeURIComponent(result.promoCode)}`}>
                    <TicketPercent className="h-4 w-4" />
                    Применить к тарифу
                  </a>
                </>
              )}
              {!data.hasActiveSubscription && prizeRequiresSubscription(result.prize) && (
                <a className="btn-primary" href="/dashboard/plans">
                  <ShoppingCart className="h-4 w-4" />
                  Оформить подписку
                </a>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setRevealEffect(false);
                  setResult(null);
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </section>
      )}

      {data.activePromoRewards.length > 0 && (
        <ActivePromoRewards
          rewards={data.activePromoRewards}
          onCopy={copyPromoCode}
        />
      )}

      {data.config.showBestRecentOpening && data.bestRecentOpening && (
        <BestRecentOpening opening={data.bestRecentOpening} />
      )}

      <section className="order-4 space-y-4">
        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20">
          <BonusTabButton
            active={activeTab === "outcomes"}
            onClick={() => setActiveTab("outcomes")}
            label="Что можно выиграть"
            meta={`${data.prizes.length}`}
          />
          <BonusTabButton
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            label="История"
            meta={`${data.openings.length}`}
          />
          <BonusTabButton
            active={activeTab === "rules"}
            onClick={() => setActiveTab("rules")}
            label="Как получить"
            meta={data.hasActiveSubscription ? "активно" : "подписка"}
          />
        </div>

        {activeTab === "outcomes" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Возможные исходы</h2>
              <div className="text-sm text-slate-500">
                {Math.round(totalChance * 100)}%
              </div>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-2.5">
              {data.prizes.map((prize) => (
                <OutcomeRow key={prize.id} prize={prize} />
              ))}
              {data.prizes.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-surface-900">
                  Подарки скоро появятся.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Ваши результаты</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.openings.map((opening) => (
                <OpeningRow key={opening.id} opening={opening} />
              ))}
              {data.openings.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-surface-900">
                  История пока пустая.
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "rules" && (
          <BonusBoxRules
            config={data.config}
            hasActiveSubscription={data.hasActiveSubscription}
          />
        )}
      </section>
    </div>
  );
}

function BonusBoxOpeningEffects() {
  return (
    <div className="bonus-box-fx-layer" aria-hidden="true">
      <div className="bonus-box-fx-aurora" />
      <div className="bonus-box-fx-scanner" />
      <div className="bonus-box-fx-ring bonus-box-fx-ring-one" />
      <div className="bonus-box-fx-ring bonus-box-fx-ring-two" />
      <div className="bonus-box-fx-flash" />
      <div className="bonus-box-fx-particles">
        {OPENING_EFFECT_PARTICLES.map((particle) => (
          <span
            key={`${particle.x}-${particle.delay}`}
            style={
              {
                "--bonus-particle-x": `${particle.x}%`,
                "--bonus-particle-delay": `${particle.delay}ms`,
                "--bonus-particle-size": `${particle.size}px`,
                "--bonus-particle-drift": `${particle.drift}px`,
                "--bonus-particle-duration": `${particle.duration}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

function ActivePromoRewards({
  rewards,
  onCopy,
}: {
  rewards: ActivePromoRewardView[];
  onCopy: (code: string) => void;
}) {
  return (
    <section className="order-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">Ваши активные промокоды</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
            Можно скопировать или сразу применить к тарифу.
          </p>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-100">
          {rewards.length}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rewards.map((reward) => (
          <article
            key={reward.id}
            className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm font-semibold text-slate-950 dark:text-white">
                  {reward.code}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  -{reward.discountPercent}% · {reward.prizeTitle}
                </div>
              </div>
              <TicketPercent className="h-5 w-5 shrink-0 text-emerald-500" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary min-h-10 justify-center text-xs" onClick={() => onCopy(reward.code)}>
                <Copy className="h-3.5 w-3.5" />
                Копировать
              </button>
              <a className="btn-primary min-h-10 justify-center text-xs" href={`/dashboard/plans?promo=${encodeURIComponent(reward.code)}`}>
                Применить
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function BestRecentOpening({ opening }: { opening: BestRecentOpeningView }) {
  return (
    <section className="order-3 rounded-lg border border-amber-200 bg-white p-3 shadow-sm shadow-amber-950/5 dark:border-amber-400/20 dark:bg-surface-900 dark:shadow-black/20 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-200">
          <Trophy className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">Лучший выигрыш за 30 дней</h2>
            <span className={cn("rounded-full px-2 py-1 text-[11px] font-semibold", rarityClass(opening.rarity))}>
              {rarityLabel(opening.rarity)}
            </span>
          </div>
          <div className="mt-1 min-w-0 text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{opening.title}</span>
            <span> · {opening.label}</span>
            <span> · {opening.userLabel}</span>
          </div>
        </div>
        <div className="text-sm text-slate-500 sm:text-right">
          {formatDate(opening.createdAt)}
        </div>
      </div>
    </section>
  );
}

function BonusTabButton({
  active,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-10 flex-1 items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors sm:flex-none sm:min-w-40",
        active
          ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"
          : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5",
      )}
      onClick={onClick}
    >
      <span className="font-semibold">{label}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
          active
            ? "bg-white/15 text-white dark:bg-slate-950/10 dark:text-slate-700"
            : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400",
        )}
      >
        {meta}
      </span>
    </button>
  );
}

function OutcomeRow({ prize }: { prize: BonusBoxPrizeView }) {
  const chancePercent = prize.chance * 100;

  return (
    <article
      className={cn(
        "relative min-h-[5.5rem] overflow-hidden rounded-lg border bg-white/80 p-2.5 shadow-sm shadow-slate-200/50 transition-colors hover:bg-white dark:bg-white/[0.035] dark:shadow-black/10 dark:hover:bg-white/[0.055]",
        prizeBorderClass(prize),
      )}
    >
      <div
        className={cn("absolute inset-y-0 left-0 w-1", prizeTopClass(prize))}
      />
      <div className="flex h-full items-start justify-between gap-3 pl-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold leading-tight text-slate-950 dark:text-white">{prize.title}</h3>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                rarityClass(prize.rarity),
              )}
            >
              {rarityLabel(prize.rarity)}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {prize.description || prizeLabel(prize)}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className={cn("h-full rounded-full", prizeTopClass(prize))}
              style={{
                width:
                  chancePercent <= 0
                    ? "0%"
                    : `${Math.max(2, Math.min(100, chancePercent))}%`,
              }}
            />
          </div>
        </div>
        <div className="shrink-0 rounded-lg bg-slate-50 px-2 py-1.5 text-right dark:bg-white/5">
          <div className="text-sm font-semibold leading-none text-slate-950 dark:text-white">
            {chancePercent.toFixed(1)}%
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">шанс</div>
        </div>
      </div>
    </article>
  );
}

function OpeningRow({ opening }: { opening: BonusBoxOpeningView }) {
  const Icon =
    opening.prize.type === "NO_PRIZE"
      ? CircleSlash
      : opening.prize.type === "SUBSCRIPTION_DAYS"
        ? CalendarPlus
        : opening.prize.type === "TRAFFIC_GB"
          ? Zap
          : opening.prize.type === "BONUS_ATTEMPTS"
            ? Gift
            : TicketPercent;

  return (
    <article
      className={cn(
        "rounded-lg border bg-white p-3 shadow-sm shadow-slate-200/60 transition-colors hover:bg-slate-50 dark:bg-surface-900 dark:shadow-black/20 dark:hover:bg-white/[0.04]",
        prizeBorderClass(opening.prize),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-950 dark:text-white">{opening.prize.title}</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {prizeLabel(opening.prize)}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-slate-400 dark:text-slate-500">
            {formatDate(opening.createdAt)}
          </div>
          <span
            className={cn(
              "mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-semibold",
              rarityClass(opening.prize.rarity),
            )}
          >
            {rarityLabel(opening.prize.rarity)}
          </span>
        </div>
      </div>
      {opening.promoCode && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-700 dark:bg-surface-950 dark:text-slate-200">
          <TicketPercent className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="break-all font-mono">{opening.promoCode}</span>
          {opening.promoCodeExpiresAt && (
            <span className="text-slate-500 dark:text-slate-400">до {formatDateOnly(opening.promoCodeExpiresAt)}</span>
          )}
        </div>
      )}
    </article>
  );
}

function BonusBoxRules({
  config,
  hasActiveSubscription,
}: {
  config: BonusBoxConfigView;
  hasActiveSubscription: boolean;
}) {
  const paymentRange =
    config.minAttemptsPerPayment > 0
      ? `${config.minAttemptsPerPayment}-${config.maxAttemptsPerPayment}`
      : `до ${config.maxAttemptsPerPayment}`;
  const referralText =
    config.referrerAttempts > 0 || config.referredAttempts > 0
      ? `За приглашение после первой оплаты: вам +${config.referrerAttempts}, другу +${config.referredAttempts}.`
      : "Реферальные открытия сейчас не начисляются.";
  const weeklyText =
    config.weeklyEnabled && config.weeklyAttempts > 0
      ? `Раз в неделю с дня "${weekdayLabel(config.weeklyDay)}": +${config.weeklyAttempts}, если VPN-подписка активна.`
      : "Еженедельный бонус сейчас выключен.";
  const ttlText =
    config.attemptTtlDays > 0
      ? `Открытия хранятся ${config.attemptTtlDays} дн.`
      : "Открытия не сгорают.";

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
  );
}

function RuleCard({
  icon,
  title,
  text,
  muted = false,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20",
        muted &&
          "bg-slate-50/80 text-slate-500 dark:bg-surface-900/80 dark:text-slate-400",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrizeCard({
  prize,
  compact = false,
  highlighted = false,
  cardWidth,
}: {
  prize: BonusBoxPrizeView;
  compact?: boolean;
  highlighted?: boolean;
  cardWidth?: number;
}) {
  const Icon =
    prize.type === "NO_PRIZE"
      ? CircleSlash
      : prize.type === "SUBSCRIPTION_DAYS"
        ? CalendarPlus
        : prize.type === "TRAFFIC_GB"
          ? Zap
          : prize.type === "BONUS_ATTEMPTS"
            ? Gift
            : TicketPercent;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border p-3 transition-transform duration-200",
        compact
          ? "bonus-box-reel-card h-32 text-slate-950 shadow-sm shadow-slate-200/70 dark:text-white dark:shadow-black/20 sm:h-40"
          : "min-h-[132px] bg-white shadow-sm hover:-translate-y-0.5 dark:bg-surface-900",
        compact ? prizeReelClass(prize) : prizeBorderClass(prize),
        highlighted && "bonus-box-reel-card--winner",
      )}
      style={compact ? { width: cardWidth ?? DESKTOP_CARD_WIDTH } : undefined}
    >
      <div
        className={cn("absolute inset-x-0 top-0 h-1", prizeTopClass(prize))}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              "truncate font-semibold",
              compact && "text-base text-slate-950 dark:text-white sm:text-lg",
            )}
          >
            {prize.title}
          </div>
          <div
            className={cn(
              "mt-1 text-xs",
              compact ? "text-slate-500 dark:text-slate-400" : "text-slate-500",
            )}
          >
            {prizeLabel(prize)}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold",
            rarityClass(prize.rarity),
          )}
        >
          {rarityLabel(prize.rarity)}
        </span>
      </div>
      {compact && (
        <div className="relative mt-5 flex items-end justify-between sm:mt-8">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white/70 text-slate-700 shadow-inner shadow-slate-200/60 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:shadow-white/5 sm:h-12 sm:w-12">
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex items-end gap-1">
            <span
              className={cn("h-5 w-1 rounded-full", prizeTopClass(prize))}
            />
            <span
              className={cn("h-8 w-1 rounded-full", prizeTopClass(prize))}
            />
            <span
              className={cn("h-3 w-1 rounded-full", prizeTopClass(prize))}
            />
          </div>
        </div>
      )}
      {!compact && prize.description && (
        <p className="mt-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
          {prize.description}
        </p>
      )}
      {!compact && (
        <div className="mt-4 text-xs text-slate-400">
          Шанс {(prize.chance * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

function makeIdleReel(prizes: BonusBoxPrizeView[]) {
  if (prizes.length === 0) return [];
  return Array.from(
    { length: 40 },
    (_, index) => prizes[index % prizes.length],
  ).filter((prize): prize is BonusBoxPrizeView => Boolean(prize));
}

function prizeLabel(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "Без начисления";
  if (prize.type === "SUBSCRIPTION_DAYS") return `+${prize.value} дн.`;
  if (prize.type === "TRAFFIC_GB") return `+${prize.value} ГБ`;
  if (prize.type === "BONUS_ATTEMPTS") return `+${prize.value} открытий`;
  return `-${prize.value}%`;
}

function prizeRequiresSubscription(prize: BonusBoxPrizeView) {
  return prize.type === "SUBSCRIPTION_DAYS" || prize.type === "TRAFFIC_GB";
}

function getDisabledCtaLabel(reason: string) {
  if (reason.includes("подписк")) return "Оформить подписку";
  if (reason.includes("Нет доступных")) return "Нет открытий";
  if (reason.includes("настро")) return "Подарки скоро";
  return "Недоступно";
}

function rarityLabel(rarity: Rarity) {
  if (rarity === "LEGENDARY") return "Легенда";
  if (rarity === "EPIC") return "Эпик";
  if (rarity === "RARE") return "Редкий";
  return "База";
}

function rarityClass(rarity: Rarity) {
  if (rarity === "LEGENDARY")
    return "rarity-shimmer bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100";
  if (rarity === "EPIC")
    return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-100";
  if (rarity === "RARE")
    return "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-100";
  return "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200";
}

function prizeBorderClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "border-red-300 dark:border-red-500/60";
  return rarityBorderClass(prize.rarity);
}

function rarityBorderClass(rarity: Rarity) {
  if (rarity === "LEGENDARY")
    return "rarity-shimmer border-amber-200 dark:border-amber-500/40";
  if (rarity === "EPIC") return "border-fuchsia-200 dark:border-fuchsia-500/40";
  if (rarity === "RARE") return "border-cyan-200 dark:border-cyan-500/40";
  return "border-slate-200 dark:border-white/10";
}

function prizeReelClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE")
    return "border-red-200 bg-red-50/80 dark:border-red-500/35 dark:bg-red-500/10";
  return rarityReelClass(prize.rarity);
}

function rarityReelClass(rarity: Rarity) {
  if (rarity === "LEGENDARY")
    return "rarity-shimmer border-amber-200 bg-amber-50/80 dark:border-amber-500/35 dark:bg-amber-500/10";
  if (rarity === "EPIC")
    return "border-fuchsia-200 bg-fuchsia-50/80 dark:border-fuchsia-500/35 dark:bg-fuchsia-500/10";
  if (rarity === "RARE")
    return "border-cyan-200 bg-cyan-50/80 dark:border-cyan-500/35 dark:bg-cyan-500/10";
  return "border-slate-200 bg-slate-50/90 dark:border-white/10 dark:bg-white/[0.04]";
}

function bonusBoxRevealClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "bonus-box-stage--reveal-empty";
  if (prize.rarity === "LEGENDARY") return "bonus-box-stage--reveal-legendary";
  if (prize.rarity === "EPIC") return "bonus-box-stage--reveal-epic";
  if (prize.rarity === "RARE") return "bonus-box-stage--reveal-rare";
  return "bonus-box-stage--reveal-common";
}

function bonusBoxResultClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "bonus-box-result--empty";
  if (prize.rarity === "LEGENDARY") return "bonus-box-result--legendary";
  if (prize.rarity === "EPIC") return "bonus-box-result--epic";
  if (prize.rarity === "RARE") return "bonus-box-result--rare";
  return "bonus-box-result--common";
}

function prizeTopClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "bg-red-500";
  return rarityTopClass(prize.rarity);
}

function rarityTopClass(rarity: Rarity) {
  if (rarity === "LEGENDARY") return "bg-amber-400";
  if (rarity === "EPIC") return "bg-fuchsia-400";
  if (rarity === "RARE") return "bg-cyan-400";
  return "bg-slate-400";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function weekdayLabel(day: number) {
  const labels = [
    "Воскресенье",
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
  ];
  return labels[day] ?? "Пятница";
}
