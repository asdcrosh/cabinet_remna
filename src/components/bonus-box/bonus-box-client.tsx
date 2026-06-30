"use client";

import { type CSSProperties, type ReactNode, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarPlus,
  CircleSlash,
  CreditCard,
  Gift,
  LockKeyhole,
  Sparkles,
  TicketPercent,
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
};

type BonusBoxOverview = {
  config: BonusBoxConfigView;
  hasActiveSubscription: boolean;
  attemptsCount: number;
  welcomeAttemptsCount: number;
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

const CARD_WIDTH = 164;
const CARD_GAP = 12;
const STEP = CARD_WIDTH + CARD_GAP;
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
  const router = useRouter();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState(initialData);
  const [reel, setReel] = useState(() => makeIdleReel(initialData.prizes));
  const [offset, setOffset] = useState(0);
  const [opening, setOpening] = useState(false);
  const [revealEffect, setRevealEffect] = useState(false);
  const [result, setResult] = useState<OpenBoxResponse | null>(null);
  const [activeTab, setActiveTab] = useState<BonusBoxTab>("outcomes");
  const canUseWelcomeAttempts =
    !data.hasActiveSubscription && data.welcomeAttemptsCount > 0;

  const canOpen =
    (data.hasActiveSubscription || canUseWelcomeAttempts) &&
    data.attemptsCount > 0 &&
    data.prizes.length > 0 &&
    !opening;
  const openButtonLabel = opening
    ? "Открываем..."
    : data.attemptsCount <= 0
      ? "Нет открытий"
      : canUseWelcomeAttempts
        ? "Открыть приветственный бонус"
        : !data.hasActiveSubscription
        ? "Нужна подписка"
        : data.prizes.length === 0
          ? "Подарки не настроены"
          : "Открыть кейс";
  const totalChance = useMemo(
    () => data.prizes.reduce((sum, prize) => sum + prize.chance, 0),
    [data.prizes],
  );
  const rewardPrizesCount = useMemo(
    () => data.prizes.filter((prize) => prize.type !== "NO_PRIZE").length,
    [data.prizes],
  );

  async function refreshOverview() {
    const overview = await apiFetch<BonusBoxOverview>("/api/bonus-box");
    setData(overview);
    router.refresh();
  }

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
          const target =
            response.winningIndex * STEP +
            CARD_WIDTH * response.stopOffsetRatio;
          setOffset(-target);
        });
      });

      window.setTimeout(async () => {
        setResult(response);
        setRevealEffect(true);
        setData((current) => ({
          ...current,
          attemptsCount: response.remainingAttempts,
        }));
        if (response.prize.type === "NO_PRIZE") {
          toast("Открытие завершено: без подарка", "success");
        } else if (!response.remoteSynced) {
          toast(
            "Подарок сохранён, синхронизация с VPN будет повторена",
            "success",
          );
        } else {
          toast("Подарок начислен", "success");
        }
        await refreshOverview().catch(() => undefined);
        setOpening(false);
        window.setTimeout(() => setRevealEffect(false), 1600);
      }, 5400);
    } catch {
      setOpening(false);
      setRevealEffect(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-lg border border-cyan-200/70 bg-white/85 p-4 shadow-xl shadow-cyan-950/5 backdrop-blur dark:border-cyan-300/15 dark:bg-[linear-gradient(135deg,#101827,#0b1220_58%,#062f3a)] dark:text-white dark:shadow-black/25 sm:p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-emerald-300 to-blue-400" />
        <div className="pointer-events-none absolute -right-28 -top-28 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-300/10" />
        <div className="pointer-events-none absolute -bottom-36 left-1/3 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-300/10" />
        <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/50 bg-cyan-300/15 px-3 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-300/30 dark:text-cyan-100">
                <Sparkles className="h-3.5 w-3.5" />
                Подарочный бокс
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                  data.hasActiveSubscription
                    ? "border border-emerald-300/50 bg-emerald-300/15 text-emerald-700 dark:text-emerald-100"
                    : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-200",
                )}
              >
                {!data.hasActiveSubscription && (
                  <LockKeyhole className="h-3.5 w-3.5" />
                )}
                {data.hasActiveSubscription
                  ? "Подписка активна"
                  : canUseWelcomeAttempts
                    ? "Приветственный бонус"
                  : "Нужна подписка"}
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Открывайте бонусы
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Дни подписки, трафик, скидки и дополнительные открытия. Один клик,
              короткая прокрутка и результат сразу сохраняется в истории.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <TopMetric
                icon={<Gift className="h-4 w-4" />}
                label="Открытий"
                value={data.attemptsCount}
                hint="доступно"
              />
              <TopMetric
                icon={<Sparkles className="h-4 w-4" />}
                label="Наград"
                value={rewardPrizesCount}
                hint="вариантов"
              />
              <TopMetric
                icon={<CalendarClock className="h-4 w-4" />}
                label="История"
                value={data.openings.length}
                hint="результатов"
              />
            </div>
            {!data.hasActiveSubscription && data.attemptsCount > 0 && !canUseWelcomeAttempts && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Открытия сохраняются на балансе. Активируйте подписку, чтобы забрать подарок.</span>
              </div>
            )}
            {canUseWelcomeAttempts && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-100">
                <Gift className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Приветственные открытия доступны без подписки. Следующие бонусы откроются после покупки VPN.</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <button
              type="button"
              className="group relative min-h-14 w-full overflow-hidden rounded-lg border border-cyan-300/30 bg-[linear-gradient(135deg,#020617,#0e7490_62%,#10b981)] px-4 text-sm font-semibold text-white shadow-xl shadow-cyan-950/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-cyan-950/30 disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-none disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none dark:border-cyan-300/35 dark:shadow-black/25 dark:disabled:border-white/10 dark:disabled:bg-white/10 dark:disabled:text-slate-400"
              onClick={openBox}
              disabled={!canOpen}
            >
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.22),transparent_34%),linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent)] opacity-80" />
              <span className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-18deg] bg-white/24 blur-sm transition-transform duration-700 group-hover:translate-x-[430%]" />
              <span className="relative flex items-center justify-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/14 shadow-inner shadow-white/10">
                  <Gift className="h-5 w-5" />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block truncate">{openButtonLabel}</span>
                  <span className="block text-xs font-medium text-cyan-50/80">
                    {opening
                      ? "Идёт прокрутка"
                      : data.attemptsCount > 0
                        ? `${data.attemptsCount} попыток доступно`
                        : "Попыток пока нет"}
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>
      </section>

      <section
        className={cn(
          "bonus-box-stage overflow-hidden rounded-lg border border-slate-900 bg-slate-950 shadow-xl shadow-slate-950/20 dark:border-white/10",
          opening && "bonus-box-stage--opening",
          revealEffect && "bonus-box-stage--reveal",
          revealEffect && result?.prize.type !== "NO_PRIZE" && "bonus-box-stage--win",
          revealEffect && result?.prize.type === "NO_PRIZE" && "bonus-box-stage--empty",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div>
            <h2 className="font-semibold text-white">Лента открытия</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              {opening
                ? "Перемешиваем подарки и фиксируем результат."
                : "Выигрыш остановится по центру и сохранится в истории."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-200">
              {opening ? "Открывается" : `${data.attemptsCount} доступно`}
            </span>
            <button
              type="button"
              className="hidden rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex"
              onClick={openBox}
              disabled={!canOpen}
            >
              {opening ? "Крутим" : "Открыть"}
            </button>
          </div>
        </div>

        <div className="bonus-box-reel-shell relative overflow-hidden py-5 sm:py-7">
          <BonusBoxOpeningEffects />
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-slate-950 via-slate-950/80 to-transparent sm:w-32" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-slate-950 via-slate-950/80 to-transparent sm:w-32" />
          <div className="bonus-box-portal" aria-hidden="true">
            <div className="bonus-box-portal-core" />
            <div className="bonus-box-portal-line" />
          </div>

          <div ref={viewportRef} className="overflow-hidden">
            <div
              className="bonus-box-reel-track flex will-change-transform"
              style={{
                gap: `${CARD_GAP}px`,
                transform: `translate3d(${offset}px,0,0)`,
                transition: opening
                  ? "transform 5.2s cubic-bezier(.12,.78,.1,1)"
                  : "none",
                paddingLeft: "50%",
                paddingRight: "50%",
              }}
            >
              {reel.map((prize, index) => (
                <PrizeCard key={`${prize.id}-${index}`} prize={prize} compact />
              ))}
            </div>
          </div>
        </div>
      </section>

      {result && (
        <section
          className={cn(
            "grid gap-4 rounded-lg border bg-white p-4 shadow-sm shadow-slate-200/60 dark:bg-surface-900 dark:shadow-black/20 sm:p-5 md:grid-cols-[1fr_auto] md:items-center",
            result.prize.type === "NO_PRIZE"
              ? "border-red-200 dark:border-red-500/40"
              : "border-emerald-200 dark:border-emerald-500/30",
          )}
        >
          <div className="min-w-0">
            <div
              className={cn(
                "flex items-center gap-2 text-sm font-semibold",
                result.prize.type === "NO_PRIZE"
                  ? "text-slate-500 dark:text-slate-400"
                  : "text-emerald-600 dark:text-emerald-300",
              )}
            >
              {result.prize.type === "NO_PRIZE" ? (
                <CircleSlash className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {result.prize.type === "NO_PRIZE"
                ? "Результат открытия"
                : "Ваш подарок"}
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {result.prize.title}
            </div>
            {(result.prize.description ||
              result.prize.type === "NO_PRIZE") && (
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {result.prize.description || "В этот раз без начисления."}
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
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20">
          <BonusTabButton
            active={activeTab === "outcomes"}
            onClick={() => setActiveTab("outcomes")}
            label="Исходы"
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

function TopMetric({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/70 bg-white/60 px-2.5 py-2 shadow-sm shadow-slate-950/5 dark:border-white/10 dark:bg-white/10 sm:px-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300 sm:text-xs">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-base font-semibold text-slate-950 dark:text-white sm:text-lg">
        {value}
      </div>
      <div className="truncate text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs">{hint}</div>
    </div>
  );
}

function OutcomeRow({ prize }: { prize: BonusBoxPrizeView }) {
  const chancePercent = prize.chance * 100;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border bg-white p-3 shadow-sm shadow-slate-200/60 dark:bg-surface-900 dark:shadow-black/20",
        prizeBorderClass(prize),
      )}
    >
      <div
        className={cn("absolute inset-x-0 top-0 h-1", prizeTopClass(prize))}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{prize.title}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-1 text-[11px] font-semibold",
                rarityClass(prize.rarity),
              )}
            >
              {rarityLabel(prize.rarity)}
            </span>
          </div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {prize.description || prizeLabel(prize)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-semibold">
            {chancePercent.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-400">шанс</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
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
    </article>
  );
}

function OpeningRow({ opening }: { opening: BonusBoxOpeningView }) {
  return (
    <article
      className={cn(
        "rounded-lg border bg-white p-3 shadow-sm shadow-slate-200/60 dark:bg-surface-900 dark:shadow-black/20",
        prizeBorderClass(opening.prize),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{opening.prize.title}</div>
          <div className="mt-1 text-sm text-slate-500">
            {formatDate(opening.createdAt)}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {prizeLabel(opening.prize)}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold",
            rarityClass(opening.prize.rarity),
          )}
        >
          {rarityLabel(opening.prize.rarity)}
        </span>
      </div>
      {opening.promoCode && (
        <div className="mt-3 break-all rounded-md bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-700 dark:bg-surface-950 dark:text-slate-200">
          {opening.promoCode}
          {opening.promoCodeExpiresAt && (
            <span className="ml-2 font-sans text-slate-500">
              до {formatDateOnly(opening.promoCodeExpiresAt)}
            </span>
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
}: {
  prize: BonusBoxPrizeView;
  compact?: boolean;
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
          ? "bonus-box-reel-card h-36 text-white shadow-[0_18px_42px_rgba(0,0,0,.28)]"
          : "min-h-[132px] bg-white shadow-sm hover:-translate-y-0.5 dark:bg-surface-900",
        compact ? prizeReelClass(prize) : prizeBorderClass(prize),
      )}
      style={compact ? { width: CARD_WIDTH } : undefined}
    >
      <div
        className={cn("absolute inset-x-0 top-0 h-1", prizeTopClass(prize))}
      />
      {compact && (
        <>
          <div
            className={cn(
              "absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl",
              prizeGlowClass(prize),
            )}
          />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.14),transparent_38%),radial-gradient(circle_at_50%_115%,rgba(255,255,255,.12),transparent_48%)]" />
        </>
      )}
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              "truncate font-semibold",
              compact && "text-lg text-white",
            )}
          >
            {prize.title}
          </div>
          <div
            className={cn(
              "mt-1 text-xs",
              compact ? "text-slate-300" : "text-slate-500",
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
        <div className="relative mt-6 flex items-end justify-between">
          <div className="grid h-12 w-12 place-items-center rounded-lg border border-white/10 bg-white/10 text-white shadow-inner shadow-white/5">
            <Icon className="h-6 w-6" />
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
  );
}

function prizeLabel(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "Без начисления";
  if (prize.type === "SUBSCRIPTION_DAYS") return `+${prize.value} дн.`;
  if (prize.type === "TRAFFIC_GB") return `+${prize.value} ГБ`;
  if (prize.type === "BONUS_ATTEMPTS") return `+${prize.value} открытий`;
  return `-${prize.value}%`;
}

function rarityLabel(rarity: Rarity) {
  if (rarity === "LEGENDARY") return "Легенда";
  if (rarity === "EPIC") return "Эпик";
  if (rarity === "RARE") return "Редкий";
  return "База";
}

function rarityClass(rarity: Rarity) {
  if (rarity === "LEGENDARY")
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100";
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
    return "border-amber-200 dark:border-amber-500/40";
  if (rarity === "EPIC") return "border-fuchsia-200 dark:border-fuchsia-500/40";
  if (rarity === "RARE") return "border-cyan-200 dark:border-cyan-500/40";
  return "border-slate-200 dark:border-white/10";
}

function prizeReelClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE")
    return "border-red-400 bg-[linear-gradient(135deg,#450a0a,#7f1d1d_58%,#111827)] shadow-red-950/30";
  return rarityReelClass(prize.rarity);
}

function rarityReelClass(rarity: Rarity) {
  if (rarity === "LEGENDARY")
    return "border-amber-300 bg-[linear-gradient(135deg,#451a03,#78350f_58%,#111827)] shadow-amber-950/30";
  if (rarity === "EPIC")
    return "border-fuchsia-300 bg-[linear-gradient(135deg,#3b0764,#701a75_58%,#111827)] shadow-fuchsia-950/30";
  if (rarity === "RARE")
    return "border-cyan-300 bg-[linear-gradient(135deg,#083344,#164e63_58%,#111827)] shadow-cyan-950/30";
  return "border-slate-700 bg-[linear-gradient(135deg,#0f172a,#111827_58%,#020617)]";
}

function prizeGlowClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "bg-red-400/35";
  return rarityGlowClass(prize.rarity);
}

function rarityGlowClass(rarity: Rarity) {
  if (rarity === "LEGENDARY") return "bg-amber-300/45";
  if (rarity === "EPIC") return "bg-fuchsia-300/40";
  if (rarity === "RARE") return "bg-cyan-300/40";
  return "bg-slate-300/25";
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
