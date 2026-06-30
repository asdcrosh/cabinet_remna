"use client";

import { type ReactNode, useMemo, useRef, useState } from "react";
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

const CARD_WIDTH = 176;
const CARD_GAP = 14;
const STEP = CARD_WIDTH + CARD_GAP;

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
  const [result, setResult] = useState<OpenBoxResponse | null>(null);
  const [activeTab, setActiveTab] = useState<BonusBoxTab>("outcomes");

  const canOpen =
    data.hasActiveSubscription &&
    data.attemptsCount > 0 &&
    data.prizes.length > 0 &&
    !opening;
  const openButtonLabel = opening
    ? "Открываем..."
    : data.attemptsCount <= 0
      ? "Нет открытий"
      : !data.hasActiveSubscription
        ? "Нужна подписка"
        : data.prizes.length === 0
          ? "Подарки не настроены"
          : "Открыть бокс";
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
      }, 5400);
    } catch {
      setOpening(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20 sm:p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-300 to-blue-500" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                Подарочный бокс
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                  data.hasActiveSubscription
                    ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300"
                    : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300",
                )}
              >
                {!data.hasActiveSubscription && (
                  <LockKeyhole className="h-3.5 w-3.5" />
                )}
                {data.hasActiveSubscription
                  ? "Подписка активна"
                  : "Нужна подписка"}
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Бонусы за активность
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Внутри дни подписки, трафик, персональные скидки и дополнительные
              открытия. Попытки начисляются за оплаты, рефералов и еженедельный
              бонус.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
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
            {!data.hasActiveSubscription && data.attemptsCount > 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Открытия сохраняются на балансе. Активируйте подписку, чтобы забрать подарок.</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <button
              type="button"
              className="group relative h-12 w-full overflow-hidden rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-800 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 dark:disabled:bg-white/10 dark:disabled:text-slate-500"
              onClick={openBox}
              disabled={!canOpen}
            >
              <span className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-[120%]" />
              <span className="relative flex items-center justify-center gap-2">
                <Gift className="h-5 w-5" />
                {openButtonLabel}
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm shadow-slate-200/60 dark:border-white/10 dark:bg-surface-900 dark:shadow-black/20">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10 sm:px-5">
          <div>
            <h2 className="font-semibold text-slate-950 dark:text-white">Лента открытия</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Каждое открытие расходует одну попытку, результат сохраняется в истории.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">
            {opening ? "Открывается" : `${data.attemptsCount} доступно`}
          </span>
        </div>

        <div className="bg-slate-50/70 p-3 dark:bg-surface-950/35 sm:p-4">
          <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white py-4 shadow-sm dark:border-white/10 dark:bg-surface-900 sm:py-5">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white via-white/85 to-transparent dark:from-surface-900 dark:via-surface-900/85 sm:w-24" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white via-white/85 to-transparent dark:from-surface-900 dark:via-surface-900/85 sm:w-24" />
            <div className="pointer-events-none absolute inset-y-3 left-1/2 z-30 w-px -translate-x-1/2 bg-slate-950/50 dark:bg-white/70" />
            <div className="pointer-events-none absolute left-1/2 top-2 z-30 h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[11px] border-x-transparent border-t-slate-950/70 dark:border-t-white/80" />
            <div className="pointer-events-none absolute bottom-2 left-1/2 z-30 h-0 w-0 -translate-x-1/2 border-x-[8px] border-b-[11px] border-x-transparent border-b-slate-950/70 dark:border-b-white/80" />

            <div ref={viewportRef} className="overflow-hidden">
              <div
                className="flex will-change-transform"
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
            onClick={() => setResult(null)}
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
            <div className="grid gap-3 lg:grid-cols-2">
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
            <div className="grid gap-3 lg:grid-cols-2">
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
    <div className="min-w-0 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.04] sm:px-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate text-base font-semibold text-slate-950 dark:text-white sm:text-lg">
        {value}
      </div>
      <div className="truncate text-[11px] text-slate-500 sm:text-xs">{hint}</div>
    </div>
  );
}

function OutcomeRow({ prize }: { prize: BonusBoxPrizeView }) {
  const chancePercent = prize.chance * 100;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border bg-white p-4 shadow-sm shadow-slate-200/60 dark:bg-surface-900 dark:shadow-black/20",
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
          <div className="text-lg font-semibold">
            {chancePercent.toFixed(1)}%
          </div>
          <div className="text-xs text-slate-400">шанс</div>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
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
        "rounded-lg border bg-white p-4 shadow-sm shadow-slate-200/60 dark:bg-surface-900 dark:shadow-black/20",
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
          ? "h-32 bg-white text-slate-950 shadow-sm dark:bg-surface-800 dark:text-white"
          : "min-h-[132px] bg-white shadow-sm hover:-translate-y-0.5 dark:bg-surface-900",
        compact ? prizeReelClass(prize) : prizeBorderClass(prize),
      )}
      style={compact ? { width: CARD_WIDTH } : undefined}
    >
      <div
        className={cn("absolute inset-x-0 top-0 h-1", prizeTopClass(prize))}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              "truncate font-semibold",
              compact && "text-base text-slate-950 dark:text-white",
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
        <div className="relative mt-6 flex items-end justify-between">
          <div className={cn("grid h-10 w-10 place-items-center rounded-lg border shadow-sm", prizeIconClass(prize))}>
            <Icon className="h-5 w-5" />
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
    return "border-red-200 bg-red-50/80 dark:border-red-500/35 dark:bg-red-500/10";
  return rarityReelClass(prize.rarity);
}

function rarityReelClass(rarity: Rarity) {
  if (rarity === "LEGENDARY")
    return "border-amber-200 bg-amber-50/90 dark:border-amber-500/35 dark:bg-amber-500/10";
  if (rarity === "EPIC")
    return "border-fuchsia-200 bg-fuchsia-50/80 dark:border-fuchsia-500/35 dark:bg-fuchsia-500/10";
  if (rarity === "RARE")
    return "border-cyan-200 bg-cyan-50/80 dark:border-cyan-500/35 dark:bg-cyan-500/10";
  return "border-slate-200 bg-slate-50/90 dark:border-white/10 dark:bg-white/[0.04]";
}

function prizeIconClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE")
    return "border-red-200 bg-white text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200";
  if (prize.rarity === "LEGENDARY")
    return "border-amber-200 bg-white text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100";
  if (prize.rarity === "EPIC")
    return "border-fuchsia-200 bg-white text-fuchsia-700 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-100";
  if (prize.rarity === "RARE")
    return "border-cyan-200 bg-white text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-100";
  return "border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200";
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
