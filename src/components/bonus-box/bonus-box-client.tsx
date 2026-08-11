"use client";

import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  CircleSlash,
  Copy,
  CreditCard,
  Gift,
  LoaderCircle,
  Sparkles,
  ShoppingCart,
  TicketPercent,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { apiFetch, isApiFetchError } from "@/lib/api-client";
import { toast } from "@/components/ui/toaster";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import {
  bonusBoxRevealClass,
  formatDate,
  formatDateOnly,
  getDisabledCtaLabel,
  prizeBorderClass,
  prizeLabel,
  prizeRequiresSubscription,
  prizeTopClass,
  rarityClass,
  rarityLabel,
  weekdayLabel,
} from "@/components/bonus-box/bonus-box-display";
import type {
  ActivePromoRewardView,
  BonusBoxConfigView,
  BonusBoxOpeningView,
  BonusBoxOverview,
  BonusBoxMissionView,
  BonusBoxEventView,
  BonusBoxPrizeView,
  BonusBoxTab,
  OpenBoxResponse,
} from "@/components/bonus-box/bonus-box-types";

export type { BonusBoxPrizeView } from "@/components/bonus-box/bonus-box-types";

const WHEEL_DURATION_MS = 5000;
const REVEAL_EFFECT_DURATION_MS = 900;
const BONUS_TABS: BonusBoxTab[] = ["missions", "outcomes", "history"];
const WHEEL_COLORS = ["#31126f", "#5b25b3", "#792aca", "#47208e"];
const SOUND_PREFERENCE_KEY = "bonus-wheel-sound:v1";
const PENDING_OPENING_KEY = "bonus-wheel-pending:v1";
const OPENING_STARTED_KEY = "bonus-wheel-opening-started:v1";

export function BonusBoxClient({
  initialData,
}: {
  initialData: BonusBoxOverview;
}) {
  const [data, setData] = useState(initialData);
  const [wheelRotation, setWheelRotation] = useState(
    () => -180 / Math.max(1, initialData.prizes.length),
  );
  const [opening, setOpening] = useState(false);
  const [revealEffect, setRevealEffect] = useState(false);
  const [result, setResult] = useState<OpenBoxResponse | null>(null);
  const [pendingResult, setPendingResult] = useState<OpenBoxResponse | null>(null);
  const [activeTab, setActiveTab] = useState<BonusBoxTab>(
    initialData.events.length > 0 || initialData.missions.length > 0 ? "missions" : "outcomes",
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);
  const effectTimerRef = useRef<number | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const wheelPointerRef = useRef<HTMLDivElement | null>(null);
  const targetWheelRotationRef = useRef<number | null>(null);
  const finishingRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastTickSegmentRef = useRef<number | null>(null);
  const lastTickAtRef = useRef(0);
  const canUseWelcomeAttempts =
    !data.hasActiveSubscription && data.welcomeAttemptsCount > 0;
  const availableNow = data.hasActiveSubscription
    ? data.attemptsCount
    : data.welcomeAttemptsCount;
  const lockedAttempts = Math.max(0, data.attemptsCount - availableNow);
  const wheelPrizes = data.prizes;
  const segmentAngle = 360 / Math.max(1, wheelPrizes.length);
  const wheelBackground = useMemo(() => {
    if (wheelPrizes.length === 0) return WHEEL_COLORS[0];
    return `conic-gradient(from 0deg, ${wheelPrizes
      .map((prize, index) => {
        const start = index * segmentAngle;
        const end = (index + 1) * segmentAngle;
        return `${wheelSegmentColor(prize, index)} ${start}deg ${end}deg`;
      })
      .join(", ")})`;
  }, [segmentAngle, wheelPrizes]);
  const normalizedWheelRotation = ((wheelRotation % 360) + 360) % 360;

  const canOpen = !data.canOpenReason && !opening && cooldownSeconds === 0;
  const subscribeCta = Boolean(data.canOpenReason?.includes("подписк"));
  const openButtonLabel = opening
    ? "Колесо вращается"
    : cooldownSeconds > 0
      ? `Повтор через ${formatCooldown(cooldownSeconds)}`
    : data.canOpenReason
      ? getDisabledCtaLabel(data.canOpenReason)
      : canUseWelcomeAttempts
        ? "Запустить приветственный ход"
        : "Запустить рулетку";
  const totalChance = useMemo(
    () => data.prizes.reduce((sum, prize) => sum + prize.chance, 0),
    [data.prizes],
  );
  const hasRareOrBetter = data.prizes.some((prize) => prize.rarity !== "COMMON");
  const openButtonClass =
    "bonus-box-open-button group relative inline-flex min-h-12 items-center justify-center overflow-hidden rounded-lg px-5 text-sm font-semibold text-white transition duration-200 disabled:cursor-not-allowed disabled:text-slate-400 sm:min-w-44";
  const revealClass = result ? bonusBoxRevealClass(result.prize) : null;

  useEffect(() => {
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReducedMotion(motionMedia.matches);
    };

    sync();
    motionMedia.addEventListener("change", sync);
    return () => {
      motionMedia.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    try {
      const preference = window.localStorage.getItem(SOUND_PREFERENCE_KEY);
      setSoundEnabled(preference !== "off");
    } catch {
      setSoundEnabled(true);
    }

    const restored = readStoredOpening();
    if (restored) {
      setResult(restored);
      return;
    }

    const startedAt = readOpeningStartedAt();
    if (!Number.isFinite(startedAt) || startedAt <= 0) return;
    const recovered = initialData.openings.find(
      (opening) => new Date(opening.createdAt).getTime() >= startedAt - 2_000,
    );
    if (!recovered) return;

    const response: OpenBoxResponse = {
      ...recovered,
      reel: initialData.prizes,
      winningIndex: Math.max(0, initialData.prizes.findIndex((prize) => prize.id === recovered.prize.id)),
      stopOffsetRatio: 0.5,
      remainingAttempts: initialData.attemptsCount,
    };
    storeOpening(response);
    setResult(response);
  }, [initialData.attemptsCount, initialData.openings, initialData.prizes]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => () => {
    if (effectTimerRef.current !== null) window.clearTimeout(effectTimerRef.current);
    if (wheelFrameRef.current !== null) window.cancelAnimationFrame(wheelFrameRef.current);
    void audioContextRef.current?.close();
  }, []);

  function prepareSound() {
    if (!soundEnabled || audioContextRef.current) return;
    try {
      audioContextRef.current = new AudioContext();
    } catch {
      audioContextRef.current = null;
    }
  }

  function playTone(frequency: number, duration: number, volume: number, delay = 0) {
    if (!soundEnabled) return;
    const context = audioContextRef.current;
    if (!context) return;
    if (context.state === "suspended") void context.resume();

    const startsAt = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + duration + 0.02);
  }

  function playWheelTick(rotation: number, progress: number) {
    const tickSegment = Math.floor(positiveModulo(rotation, 360) / segmentAngle);
    const now = performance.now();
    if (tickSegment === lastTickSegmentRef.current || now - lastTickAtRef.current < 38) return;
    lastTickSegmentRef.current = tickSegment;
    lastTickAtRef.current = now;
    playTone(780 - progress * 260, 0.035, 0.026);
  }

  function playWinSound(response: OpenBoxResponse) {
    if (response.prize.type === "NO_PRIZE") {
      playTone(220, 0.14, 0.035);
      return;
    }
    const notes = response.prize.rarity === "LEGENDARY"
      ? [523, 659, 784, 1047]
      : response.prize.rarity === "EPIC"
        ? [440, 554, 659]
        : response.prize.rarity === "RARE"
          ? [392, 494, 587]
          : [392, 523];
    notes.forEach((frequency, index) => playTone(frequency, 0.19, 0.045, index * 0.085));
  }

  function toggleSound() {
    const nextValue = !soundEnabled;
    setSoundEnabled(nextValue);
    try {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, nextValue ? "on" : "off");
    } catch {
      // Настройка останется активной до перезагрузки страницы.
    }
    if (nextValue) {
      try {
        if (!audioContextRef.current) audioContextRef.current = new AudioContext();
      } catch {
        audioContextRef.current = null;
      }
      const context = audioContextRef.current;
      if (!context) return;
      if (context.state === "suspended") void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.setValueAtTime(520, context.currentTime);
      gain.gain.setValueAtTime(0.025, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.07);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
    }
  }

  function dismissResult() {
    setRevealEffect(false);
    setResult(null);
    clearStoredOpening();
  }

  function settleWheel(targetRotation = targetWheelRotationRef.current) {
    if (wheelFrameRef.current !== null) {
      window.cancelAnimationFrame(wheelFrameRef.current);
      wheelFrameRef.current = null;
    }
    if (targetRotation !== null) {
      setWheelRotation(targetRotation);
      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${targetRotation}deg)`;
    }
    if (wheelPointerRef.current) {
      wheelPointerRef.current.style.transform = "translateX(-50%) rotate(0deg)";
    }
  }

  function animateWheel(startRotation: number, targetRotation: number, response: OpenBoxResponse) {
    const startedAt = performance.now();
    const distance = targetRotation - startRotation;

    const frame = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / WHEEL_DURATION_MS);
      const progress = 1 - Math.pow(1 - elapsed, 2.7);
      const rotation = startRotation + distance * progress;

      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${rotation}deg)`;
      playWheelTick(rotation, progress);
      if (wheelPointerRef.current) {
        const phase = positiveModulo(rotation, segmentAngle) / segmentAngle;
        const deflection = phase < 0.72
          ? 0
          : phase < 0.92
            ? ((phase - 0.72) / 0.2) * 7
            : 7 - ((phase - 0.92) / 0.08) * 12;
        wheelPointerRef.current.style.transform = `translateX(-50%) rotate(${deflection}deg)`;
      }

      if (elapsed < 1) {
        wheelFrameRef.current = window.requestAnimationFrame(frame);
        return;
      }

      wheelFrameRef.current = null;
      settleWheel(targetRotation);
      void finishOpening(response);
    };

    wheelFrameRef.current = window.requestAnimationFrame(frame);
  }

  async function finishOpening(response: OpenBoxResponse) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    settleWheel();
    setResult(response);
    storeOpening(response);
    setPendingResult(null);
    setRevealEffect(!reducedMotion);
    playWinSound(response);
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
                remoteSynced: response.remoteSynced,
          },
          ...current.openings,
        ].slice(0, 12),
      }));
    }
    setOpening(false);
    requestInFlightRef.current = false;
    if (!reducedMotion) {
      effectTimerRef.current = window.setTimeout(() => setRevealEffect(false), REVEAL_EFFECT_DURATION_MS);
    }
  }

  async function claimMission(mission: BonusBoxMissionView) {
    setClaimingMissionId(mission.id);
    try {
      const result = await apiFetch<{ attempts: number }>(
        `/api/bonus-box/missions/${mission.id}/claim`,
        { method: "POST" },
      );
      toast(`Начислено открытий: ${result.attempts}`, "success");
      const freshData = await apiFetch<BonusBoxOverview>("/api/bonus-box");
      setData(freshData);
    } catch {
      // apiFetch уже покажет toast
    } finally {
      setClaimingMissionId(null);
    }
  }

  async function openBox() {
    if (!canOpen || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    prepareSound();
    try {
      window.sessionStorage.setItem(OPENING_STARTED_KEY, String(Date.now()));
    } catch {
      // Открытие всё равно защищено серверной транзакцией.
    }
    finishingRef.current = false;
    setOpening(true);
    setRevealEffect(false);
    setResult(null);
    setPendingResult(null);

    try {
      const response = await apiFetch<OpenBoxResponse>("/api/bonus-box", {
        method: "POST",
      });
      setCooldownSeconds(0);
      setPendingResult(response);
      storeOpening(response);

      const winnerIndex = Math.max(0, wheelPrizes.findIndex((prize) => prize.id === response.prize.id));
      const winnerCenter = (winnerIndex + 0.5) * segmentAngle;
      const targetRotation = (360 - winnerCenter) % 360;
      const normalized = positiveModulo(wheelRotation, 360);
      const correction = positiveModulo(targetRotation - normalized, 360);
      const finalRotation = wheelRotation + correction + 360 * 7;
      targetWheelRotationRef.current = finalRotation;

      if (reducedMotion) {
        settleWheel(finalRotation);
        void finishOpening(response);
      } else {
        animateWheel(wheelRotation, finalRotation, response);
      }
    } catch (error) {
      if (isApiFetchError(error) && error.status === 429) {
        const responseRetryAfter = typeof error.data?.retryAfter === "number"
          ? error.data.retryAfter
          : null;
        setCooldownSeconds(error.retryAfter ?? responseRetryAfter ?? 60);
      }
      requestInFlightRef.current = false;
      clearStoredOpening();
      setOpening(false);
      setPendingResult(null);
      setRevealEffect(false);
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = BONUS_TABS.indexOf(activeTab);
    const nextTab =
      event.key === "Home"
        ? BONUS_TABS[0]!
        : event.key === "End"
          ? BONUS_TABS[BONUS_TABS.length - 1]!
          : BONUS_TABS[
              (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + BONUS_TABS.length) %
                BONUS_TABS.length
            ]!;
    setActiveTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`bonus-tab-${nextTab}`)?.focus());
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
    <div className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300">
      <Gift className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
      <span>{openButtonLabel}</span>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <section
        aria-busy={opening}
        className={cn(
          "bonus-box-stage order-first overflow-hidden rounded-xl border border-brand-200/80 bg-white dark:border-brand-300/15 dark:bg-surface-900",
          opening && "bonus-box-stage--opening",
          revealEffect && "bonus-box-stage--reveal",
          revealEffect && result?.prize.type !== "NO_PRIZE" && "bonus-box-stage--win",
          revealEffect && result?.prize.type === "NO_PRIZE" && "bonus-box-stage--empty",
          revealEffect && revealClass,
        )}
      >
        <div className="bonus-box-stage-header flex flex-wrap items-center justify-between gap-3 border-b border-brand-200/70 px-4 py-4 dark:border-brand-300/10 sm:px-6">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">Bonus drop</span>
              <span className="h-1 w-1 rounded-full bg-fuchsia-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{availableNow} {turnWord(availableNow)}</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950 dark:text-white sm:text-xl">Колесо подарков</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className={cn("h-2 w-2 rounded-full", opening ? "animate-pulse bg-fuchsia-400" : "bg-cyan-400")} />
            <span aria-live="polite">{opening ? "Определяем подарок" : result ? `${rarityLabel(result.prize.rarity)} результат` : "Готово к запуску"}</span>
            <button
              type="button"
              className="bonus-wheel-sound-toggle"
              onClick={toggleSound}
              aria-label={soundEnabled ? "Выключить звук рулетки" : "Включить звук рулетки"}
              title={soundEnabled ? "Звук включён" : "Звук выключен"}
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
            </button>
          </div>
        </div>

        {wheelPrizes.length > 0 && (
          <div className="bonus-wheel-layout">
            <div className="bonus-wheel-area">
              <div className="bonus-wheel-frame">
                <div ref={wheelPointerRef} className="bonus-wheel-pointer" aria-hidden="true"><span /></div>
                <div
                  ref={wheelRef}
                  className={cn("bonus-wheel", wheelPrizes.length > 8 && "bonus-wheel--dense")}
                  aria-label={`Колесо с ${wheelPrizes.length} вариантами призов`}
                  style={{
                    "--bonus-segment-size": `${segmentAngle}deg`,
                    background: wheelBackground,
                    transform: `rotate(${wheelRotation}deg)`,
                  } as CSSProperties}
                >
                  {wheelPrizes.map((prize, index) => {
                    const angle = (index + 0.5) * segmentAngle;
                    return (
                      <div key={prize.id} className="bonus-wheel-segment" style={{ transform: `rotate(${angle}deg)` }}>
                        <div
                          className={cn(
                            "bonus-wheel-segment-copy",
                            prize.rarity === "EPIC" && "bonus-wheel-segment-copy--epic",
                            prize.rarity === "LEGENDARY" && "bonus-wheel-segment-copy--legendary",
                            result?.prize.id === prize.id && "bonus-wheel-segment-copy--winner",
                          )}
                          data-rarity={prize.rarity}
                          title={`${prize.title}: ${prizeLabel(prize)}`}
                          style={{ transform: `translateX(-50%) rotate(${-angle - normalizedWheelRotation}deg)` }}
                        >
                          <span>{wheelPrizeLabel(prize)}</span>
                          {wheelPrizes.length <= 8 && <small>{prize.title}</small>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="bonus-wheel-hub"
                  onClick={openBox}
                  disabled={!canOpen}
                  aria-label={`${openButtonLabel}. Доступно: ${availableNow} ${turnWord(availableNow)}`}
                >
                  <span className="bonus-wheel-hub-icon" aria-hidden="true">
                    {opening ? <LoaderCircle /> : <Sparkles />}
                  </span>
                  <strong>{availableNow}</strong>
                  <span className="bonus-wheel-hub-count-label">{turnWord(availableNow)}</span>
                  <em>{opening ? "Крутим" : cooldownSeconds > 0 ? formatCooldown(cooldownSeconds) : canOpen ? "Нажать" : "Закрыто"}</em>
                </button>
                {cooldownSeconds > 0 && (
                  <div className="bonus-wheel-cooldown" role="status" aria-live="polite">
                    <CalendarClock aria-hidden="true" />
                    <span>
                      Следующий запуск через <strong>{formatCooldown(cooldownSeconds)}</strong>
                    </span>
                  </div>
                )}
                {result && (
                  <BonusWheelResultOverlay
                    result={result}
                    revealEffect={revealEffect}
                    hasActiveSubscription={data.hasActiveSubscription}
                    onCopyPromoCode={copyPromoCode}
                    onClose={dismissResult}
                  />
                )}
              </div>
            </div>

            <div className={cn("bonus-wheel-console", !openCaseCta && "bonus-wheel-console--informational")}>
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-300">Ваш ход</div>
                <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                  {opening
                    ? "Колесо уже запущено"
                    : cooldownSeconds > 0
                      ? "Нужно немного подождать"
                      : "Нажмите на центр колеса"}
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {cooldownSeconds > 0
                    ? `Ограничение снимется автоматически через ${formatCooldown(cooldownSeconds)}.`
                    : data.canOpenReason || "Подарок определяется на сервере и сразу сохраняется в истории."}
                </p>
              </div>
              {openCaseCta && <div className="mt-5">{openCaseCta}</div>}
              {opening && pendingResult && !reducedMotion && (
                <button
                  type="button"
                  className="mt-3 w-full text-center text-xs font-medium text-brand-600 underline-offset-4 hover:text-brand-800 hover:underline dark:text-brand-300 dark:hover:text-white"
                  onClick={() => void finishOpening(pendingResult)}
                >
                  Показать результат сразу
                </button>
              )}
              <div className="bonus-wheel-console-meta">
                <span>{wheelPrizes.length} вариантов</span>
                <span>Результат сохраняется</span>
              </div>
            </div>
          </div>
        )}

        {(canUseWelcomeAttempts || lockedAttempts > 0) && (
          <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 sm:px-5">
            {canUseWelcomeAttempts
              ? `Приветственных открытий сейчас: ${data.welcomeAttemptsCount}.${lockedAttempts > 0 ? ` Ещё ${lockedAttempts} будут доступны после активации подписки.` : ""}`
              : `${lockedAttempts} открытий сохранено на балансе и станет доступно после активации подписки.`}
          </div>
        )}
      </section>

      <section className="bonus-content-deck order-4 space-y-4">
        {data.pityProgress.enabled && hasRareOrBetter && (
          <div className="flex flex-col gap-2 border-y border-slate-200 py-3 text-sm dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">
                Защита от неудач
              </span>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                {data.pityProgress.guaranteedNext
                  ? "Следующий подарок будет редким или лучше."
                  : `До гарантированного редкого подарка: ${data.pityProgress.remaining ?? 0}.`}
              </p>
            </div>
            <div className="h-1.5 w-full overflow-hidden bg-slate-200 sm:w-48 dark:bg-white/10">
              <div
                className="h-full bg-cyan-400"
                style={{
                  width: `${Math.min(100, (data.pityProgress.current / Math.max(1, data.pityProgress.threshold)) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        <div
          className="bonus-section-tabs"
          role="tablist"
          aria-label="Разделы бонусов"
          onKeyDown={handleTabKeyDown}
        >
          <BonusTabButton
            tab="missions"
            active={activeTab === "missions"}
            onClick={() => setActiveTab("missions")}
            label="Задания"
            meta={`${data.missions.length}`}
          />
          <BonusTabButton
            tab="outcomes"
            active={activeTab === "outcomes"}
            onClick={() => setActiveTab("outcomes")}
            label="Призы"
            meta={`${data.prizes.length}`}
          />
          <BonusTabButton
            tab="history"
            active={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            label="История"
            meta={`${data.openings.length}`}
          />
        </div>

        {activeTab === "missions" && (
          <div
            className="bonus-tab-panel space-y-4"
            id="bonus-panel-missions"
            role="tabpanel"
            aria-labelledby="bonus-tab-missions"
          >
            <div className="bonus-panel-heading">
              <div>
                <span>Заработать ходы</span>
                <h2>Задания и события</h2>
              </div>
              <small>{data.missions.filter((mission) => !mission.claimed).length} доступно</small>
            </div>
            {(data.events.length > 0 || data.missions.length > 0) ? (
              <BonusEngagementPanel
                events={data.events}
                missions={data.missions}
                claimingMissionId={claimingMissionId}
                onClaim={claimMission}
              />
            ) : (
              <p className="border-y border-slate-200 py-4 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                Новых заданий пока нет.
              </p>
            )}
            <details className="group border-t border-slate-200 pt-3 dark:border-white/10">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
                Как получить открытия
              </summary>
              <div className="pt-3">
                <BonusBoxRules
                  config={data.config}
                  hasActiveSubscription={data.hasActiveSubscription}
                />
              </div>
            </details>
          </div>
        )}

        {activeTab === "outcomes" && (
          <div
            className="bonus-tab-panel space-y-3"
            id="bonus-panel-outcomes"
            role="tabpanel"
            aria-labelledby="bonus-tab-outcomes"
          >
            <div className="bonus-panel-heading">
              <div>
                <span>Состав колеса</span>
                <h2>Возможные призы</h2>
              </div>
              <small>Сумма шансов {Math.round(totalChance * 100)}%</small>
            </div>
            <div className="bonus-outcome-grid">
              {data.prizes.map((prize) => (
                <OutcomeRow key={prize.id} prize={prize} />
              ))}
              {data.prizes.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-surface-900">
                  Подарки скоро появятся.
                </div>
              )}
            </div>
            {data.activePromoRewards.length > 0 && (
              <ActivePromoRewards
                rewards={data.activePromoRewards}
                onCopy={copyPromoCode}
              />
            )}
          </div>
        )}

        {activeTab === "history" && (
          <section
            className="bonus-tab-panel space-y-3"
            id="bonus-panel-history"
            role="tabpanel"
            aria-labelledby="bonus-tab-history"
          >
            <div className="bonus-panel-heading">
              <div>
                <span>Архив открытий</span>
                <h2>Ваши результаты</h2>
              </div>
              <small>{data.openings.length} сохранено</small>
            </div>
            <div className="bonus-history-grid">
              {data.openings.map((opening) => (
                <OpeningRow key={opening.id} opening={opening} />
              ))}
              {data.openings.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 dark:border-white/10 dark:bg-surface-900">
                  История пока пустая.
                </div>
              )}
            </div>
          </section>
        )}

      </section>
    </div>
  );
}

function BonusWheelResultOverlay({
  result,
  revealEffect,
  hasActiveSubscription,
  onCopyPromoCode,
  onClose,
}: {
  result: OpenBoxResponse;
  revealEffect: boolean;
  hasActiveSubscription: boolean;
  onCopyPromoCode: (code: string) => void;
  onClose: () => void;
}) {
  const isEmpty = result.prize.type === "NO_PRIZE";
  const isCelebration = !isEmpty && result.prize.rarity !== "COMMON";
  const resultClass = `bonus-wheel-result-modal--${isEmpty ? "empty" : result.prize.rarity.toLowerCase()}`;
  const title = isEmpty ? "Открытие завершено" : "Подарок получен";
  const description = isEmpty
    ? "Результат сохранён в истории открытий."
    : "Подарок уже сохранён в вашем кабинете.";

  return (
    <Modal
      open
      title={title}
      description={description}
      onClose={onClose}
      overlayClassName="bonus-wheel-result-overlay"
      panelClassName={cn("bonus-wheel-result-modal sm:max-w-md", resultClass)}
      bodyClassName="bonus-wheel-result-body"
      footer={
        <div className="bonus-wheel-result-actions">
          {result.promoCode && (
            <button type="button" className="btn-primary" onClick={() => onCopyPromoCode(result.promoCode!)}>
              <Copy />
              Скопировать
            </button>
          )}
          {result.promoCode && (
            <a className="btn-secondary" href={`/dashboard/plans?promo=${encodeURIComponent(result.promoCode)}`}>
              Применить
            </a>
          )}
          {!hasActiveSubscription && prizeRequiresSubscription(result.prize) && (
            <a className="btn-primary" href="/dashboard/plans">
              <ShoppingCart />
              Оформить подписку
            </a>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Готово
          </button>
        </div>
      }
    >
      {revealEffect && isCelebration && (
        <div className="bonus-wheel-celebration" aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <span
              key={index}
              style={{
                "--particle-index": index,
                "--particle-x": `${(index % 6) * 18 - 45}%`,
                "--particle-delay": `${(index % 5) * 45}ms`,
              } as CSSProperties}
            />
          ))}
        </div>
      )}

      <div className="bonus-wheel-result-copy" role="status" aria-live="polite">
        <div className="bonus-wheel-result-icon" aria-hidden="true">
          {isEmpty ? <CircleSlash /> : <Sparkles />}
        </div>
        <div className="bonus-wheel-result-kicker">
          {isEmpty
            ? "Открытие завершено"
            : !result.remoteSynced && prizeRequiresSubscription(result.prize)
              ? "Подарок сохранён"
              : `${rarityLabel(result.prize.rarity)} подарок`}
        </div>
        <strong>{prizeLabel(result.prize)}</strong>
        <h3>{result.prize.title}</h3>
        <p>
          {result.prize.description
            || (isEmpty
              ? "В этот раз без начисления. Следующий ход может оказаться удачнее."
              : "Подарок уже сохранён в вашем кабинете.")}
        </p>

        {result.promoCode && (
          <div className="bonus-wheel-result-promo">
            <TicketPercent />
            <span>{result.promoCode}</span>
            {result.promoCodeExpiresAt && <small>до {formatDateOnly(result.promoCodeExpiresAt)}</small>}
          </div>
        )}

        {!result.remoteSynced && prizeRequiresSubscription(result.prize) && (
          <div className="bonus-wheel-result-sync">
            Применение к VPN ещё синхронизируется. Подарок не потеряется.
          </div>
        )}
      </div>
    </Modal>
  );
}

function storeOpening(response: OpenBoxResponse) {
  try {
    window.sessionStorage.setItem(PENDING_OPENING_KEY, JSON.stringify(response));
  } catch {
    // Результат остаётся сохранён на сервере и доступен в истории.
  }
}

function readStoredOpening() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_OPENING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<OpenBoxResponse>;
    if (typeof value.id !== "string" || !value.prize || typeof value.prize.id !== "string") return null;
    return value as OpenBoxResponse;
  } catch {
    try {
      window.sessionStorage.removeItem(PENDING_OPENING_KEY);
    } catch {
      // Хранилище недоступно.
    }
    return null;
  }
}

function readOpeningStartedAt() {
  try {
    return Number(window.sessionStorage.getItem(OPENING_STARTED_KEY));
  } catch {
    return 0;
  }
}

function clearStoredOpening() {
  try {
    window.sessionStorage.removeItem(PENDING_OPENING_KEY);
    window.sessionStorage.removeItem(OPENING_STARTED_KEY);
  } catch {
    // Хранилище может быть недоступно в приватном режиме браузера.
  }
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function turnWord(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'ходов';
  if (mod10 === 1) return 'ход';
  if (mod10 >= 2 && mod10 <= 4) return 'хода';
  return 'ходов';
}

function formatCooldown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0
    ? `${minutes}:${String(remainder).padStart(2, "0")}`
    : `0:${String(remainder).padStart(2, "0")}`;
}

function wheelPrizeLabel(prize: BonusBoxPrizeView) {
  if (prize.type === 'NO_PRIZE') return 'Ещё раз';
  if (prize.type === 'SUBSCRIPTION_DAYS') return `+${prize.value} д`;
  if (prize.type === 'TRAFFIC_GB') return `+${prize.value} ГБ`;
  if (prize.type === 'BONUS_ATTEMPTS') return `+${prize.value} ход`;
  return `−${prize.value}%`;
}

function wheelSegmentColor(prize: BonusBoxPrizeView, index: number) {
  if (prize.rarity === 'LEGENDARY') return index % 2 === 0 ? '#c77b17' : '#df9b22';
  if (prize.rarity === 'EPIC') return index % 2 === 0 ? '#b122b5' : '#d032c8';
  if (prize.rarity === 'RARE') return index % 2 === 0 ? '#17627f' : '#1b7892';
  return WHEEL_COLORS[index % WHEEL_COLORS.length];
}

function BonusEngagementPanel({
  events,
  missions,
  claimingMissionId,
  onClaim,
}: {
  events: BonusBoxEventView[];
  missions: BonusBoxMissionView[];
  claimingMissionId: string | null;
  onClaim: (mission: BonusBoxMissionView) => void;
}) {
  return (
    <section className="bonus-engagement-stack">
      {events.length > 0 && (
        <div className="bonus-event-list">
          <div className="grid gap-2">
            {events.map((event) => (
              <article key={event.id} className="bonus-event-card dashboard-signal">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{event.title}</h2>
                  <span className="bonus-event-date">до {formatDateOnly(event.endsAt)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {event.description && <span>{event.description}</span>}
                  {event.attemptsGranted > 0 && <span>Получено открытий: {event.attemptsGranted}</span>}
                  {event.boostedPrizeTitles.length > 0 && (
                    <span>
                      Шанс x{event.weightMultiplier}: {event.boostedPrizeTitles.join(", ")}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {missions.length > 0 && (
        <div className="bonus-mission-list">
          <div className="grid gap-2">
            {missions.map((mission) => {
              const percent = Math.min(100, (mission.value / Math.max(1, mission.target)) * 100);
              return (
                <article
                  key={mission.id}
                  className={cn("bonus-mission-card", mission.claimed && "bonus-mission-card--claimed")}
                >
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                      <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{mission.title}</h3>
                      <p className="mt-0.5 text-xs leading-5 text-slate-500">
                        {mission.description || missionDescription(mission)}
                      </p>
                      </div>
                      <span className="bonus-mission-reward">
                        +{mission.rewardAttempts} {turnWord(mission.rewardAttempts)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="bonus-mission-progress">
                        <div style={{ width: `${percent}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{mission.value}/{mission.target}</span>
                    </div>
                  </div>
                  <div className="bonus-mission-action">
                    {mission.claimed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                        <Check className="h-3.5 w-3.5" />
                        Получено
                      </span>
                    ) : mission.completed ? (
                      <button
                        type="button"
                        className="btn-primary min-h-9 px-3 text-xs"
                        disabled={claimingMissionId === mission.id}
                        onClick={() => onClaim(mission)}
                      >
                        {claimingMissionId === mission.id ? "Начисляем..." : "Получить"}
                      </button>
                    ) : mission.endsAt ? (
                      <span className="text-[10px] text-slate-400">до {formatDateOnly(mission.endsAt)}</span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function missionDescription(mission: BonusBoxMissionView) {
  if (mission.type === "PAYMENT_COUNT") return `Совершить оплат: ${mission.target}.`;
  if (mission.type === "REFERRAL_COUNT") return `Привести друзей с первой оплатой: ${mission.target}.`;
  return `Заходить подряд дней: ${mission.target}.`;
}

function ActivePromoRewards({
  rewards,
  onCopy,
}: {
  rewards: ActivePromoRewardView[];
  onCopy: (code: string) => void;
}) {
  return (
    <section className="order-3 rounded-lg border border-slate-200 border-l-2 border-l-cyan-400 bg-white p-3 dark:border-white/10 dark:border-l-cyan-300 dark:bg-surface-900 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950 dark:text-white sm:text-lg">Ваши активные промокоды</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
            Можно скопировать или сразу применить к тарифу.
          </p>
        </div>
        <span className="border-l-2 border-cyan-400 pl-2 font-mono text-[10px] font-semibold uppercase text-cyan-700 dark:text-cyan-100">
          {rewards.length}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rewards.map((reward) => (
          <article
            key={reward.id}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.04]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm font-semibold text-slate-950 dark:text-white">
                  {reward.code}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  -{reward.discountPercent}% · {reward.prizeTitle}
                </div>
                {reward.expiresAt && (
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    Действует до {formatDateOnly(reward.expiresAt)}
                  </div>
                )}
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

function BonusTabButton({
  active,
  label,
  meta,
  onClick,
  tab,
}: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
  tab: BonusBoxTab;
}) {
  return (
    <button
      type="button"
      id={`bonus-tab-${tab}`}
      role="tab"
      aria-selected={active}
      aria-controls={`bonus-panel-${tab}`}
      tabIndex={active ? 0 : -1}
      className={cn(
        "bonus-section-tab",
        active
          ? "bonus-section-tab--active"
          : "",
      )}
      onClick={onClick}
    >
      <span className="font-semibold">{label}</span>
      <span
        className={cn(
          "bonus-section-tab-count",
          active
            ? "bonus-section-tab-count--active"
            : "",
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
        "bonus-outcome-card relative min-h-[6.5rem] overflow-hidden border",
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
                "shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase",
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
        <div className="shrink-0 border-l border-slate-200 pl-2 text-right dark:border-white/10">
          <div className="text-sm font-semibold leading-none text-slate-950 dark:text-white">
            {chancePercent.toFixed(1)}%
          </div>
          <div className="mt-0.5 text-[10px] text-slate-400">базовый шанс</div>
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
        "bonus-history-card border",
        prizeBorderClass(opening.prize),
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-700 dark:border-white/10 dark:text-slate-200">
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
              "mt-2 inline-flex rounded-sm px-2 py-1 font-mono text-[9px] font-semibold uppercase",
              rarityClass(opening.prize.rarity),
            )}
          >
            {rarityLabel(opening.prize.rarity)}
          </span>
        </div>
      </div>
      {opening.promoCode && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-xs text-slate-700 dark:bg-surface-950 dark:text-slate-200">
          <TicketPercent className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span className="break-all font-mono">{opening.promoCode}</span>
          {opening.promoCodeExpiresAt && (
            <span className="text-slate-500 dark:text-slate-400">до {formatDateOnly(opening.promoCodeExpiresAt)}</span>
          )}
        </div>
      )}
      {!opening.remoteSynced && prizeRequiresSubscription(opening.prize) && (
        <div className="mt-3 border-l-2 border-amber-400 pl-2 text-xs text-amber-700 dark:text-amber-200">
          Ожидает синхронизации с VPN
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
        "rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-900",
        muted &&
          "bg-slate-50/80 text-slate-500 dark:bg-surface-900/80 dark:text-slate-400",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-700 dark:border-white/10 dark:text-slate-200">
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
