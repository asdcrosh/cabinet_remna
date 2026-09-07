"use client";

import { type CSSProperties, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  CircleSlash,
  Copy,
  Crown,
  CreditCard,
  Gem,
  Gift,
  LoaderCircle,
  RotateCw,
  Sparkles,
  ShoppingCart,
  TicketPercent,
  Trophy,
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
import {
  revealDelayMs,
  revealParticleCount,
  rouletteActiveIndex,
  rouletteMotionPhase,
  rouletteProgress,
  rouletteTargetOffset,
  type RouletteMotionPhase,
} from "@/components/bonus-box/bonus-roulette-motion";

export type { BonusBoxPrizeView } from "@/components/bonus-box/bonus-box-types";

const REVEAL_EFFECT_DURATION_MS = 1600;
const BONUS_TABS: BonusBoxTab[] = ["missions", "outcomes", "history"];
const PENDING_OPENING_KEY = "bonus-wheel-pending:v1";
const OPENING_STARTED_KEY = "bonus-wheel-opening-started:v1";
const OPENING_SPIN_ID_KEY = "bonus-roulette-spin-id:v1";
const COOLDOWN_UNTIL_KEY = "bonus-roulette-cooldown-until:v1";
const SOUND_ENABLED_KEY = "bonus-roulette-sound:v1";
type RoulettePhase = "idle" | RouletteMotionPhase | "locked" | "revealing" | "error";

export function BonusBoxClient({
  initialData,
}: {
  initialData: BonusBoxOverview;
}) {
  const [data, setData] = useState(initialData);
  const [rouletteItems, setRouletteItems] = useState(() => buildIdleRoulette(initialData.prizes));
  const [roulettePhase, setRoulettePhase] = useState<RoulettePhase>("idle");
  const [spinError, setSpinError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [opening, setOpening] = useState(false);
  const [revealEffect, setRevealEffect] = useState(false);
  const [result, setResult] = useState<OpenBoxResponse | null>(null);
  const [pendingResult, setPendingResult] = useState<OpenBoxResponse | null>(null);
  const [activeTab, setActiveTab] = useState<BonusBoxTab>(
    initialData.events.length > 0 || initialData.missions.length > 0 ? "missions" : "outcomes",
  );
  const [reducedMotion, setReducedMotion] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);
  const effectTimerRef = useRef<number | null>(null);
  const revealTimerRef = useRef<number | null>(null);
  const rouletteFrameRef = useRef<number | null>(null);
  const rouletteTrackRef = useRef<HTMLDivElement | null>(null);
  const rouletteViewportRef = useRef<HTMLDivElement | null>(null);
  const rouletteReadoutRef = useRef<HTMLSpanElement | null>(null);
  const currentRouletteOffsetRef = useRef(0);
  const activeCardIndexRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastTickAtRef = useRef(0);
  const finishingRef = useRef(false);
  const requestInFlightRef = useRef(false);
  const canUseWelcomeAttempts =
    !data.hasActiveSubscription && data.welcomeAttemptsCount > 0;
  const availableNow = data.hasActiveSubscription
    ? data.attemptsCount
    : data.welcomeAttemptsCount;
  const lockedAttempts = Math.max(0, data.attemptsCount - availableNow);
  const spotlightPrizes = useMemo(
    () => [...data.prizes]
      .sort((left, right) => rarityRank(right.rarity) - rarityRank(left.rarity))
      .slice(0, 3),
    [data.prizes],
  );

  const canOpen = !data.canOpenReason && !opening && cooldownSeconds === 0;
  const subscribeCta = Boolean(data.canOpenReason?.includes("подписк"));
  const openButtonLabel = opening
    ? "Определяем подарок"
    : cooldownSeconds > 0
      ? `Повтор через ${formatCooldown(cooldownSeconds)}`
    : data.canOpenReason
      ? getDisabledCtaLabel(data.canOpenReason)
      : canUseWelcomeAttempts
        ? "Получить приветственный подарок"
        : "Получить подарок";
  const totalChance = useMemo(
    () => data.prizes.reduce((sum, prize) => sum + prize.chance, 0),
    [data.prizes],
  );
  const hasRareOrBetter = data.prizes.some((prize) => prize.rarity !== "COMMON");
  const openButtonClass =
    "bonus-box-open-button group relative inline-flex min-h-12 items-center justify-center overflow-hidden rounded-lg px-5 text-sm font-semibold text-white transition duration-200 disabled:cursor-not-allowed disabled:text-slate-400 sm:min-w-44";
  const revealedOpening = result ?? pendingResult;
  const revealClass = revealedOpening ? bonusBoxRevealClass(revealedOpening.prize) : null;

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
      setSoundEnabled(window.localStorage.getItem(SOUND_ENABLED_KEY) !== "off");
      const retryAt = Number(window.sessionStorage.getItem(COOLDOWN_UNTIL_KEY));
      if (Number.isFinite(retryAt) && retryAt > Date.now()) {
        setCooldownSeconds(Math.ceil((retryAt - Date.now()) / 1000));
      }
    } catch {
      // Настройки эффектов остаются доступными только на текущей странице.
    }
  }, []);

  useEffect(() => {
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
      let remaining = 0;
      try {
        const retryAt = Number(window.sessionStorage.getItem(COOLDOWN_UNTIL_KEY));
        remaining = Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)) : 0;
        if (remaining === 0) window.sessionStorage.removeItem(COOLDOWN_UNTIL_KEY);
      } catch {
        remaining = Math.max(0, cooldownSeconds - 1);
      }
      setCooldownSeconds(remaining);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => () => {
    if (effectTimerRef.current !== null) window.clearTimeout(effectTimerRef.current);
    if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
    if (rouletteFrameRef.current !== null) window.cancelAnimationFrame(rouletteFrameRef.current);
    void audioContextRef.current?.close();
  }, []);

  function dismissResult() {
    const idleItems = buildIdleRoulette(data.prizes);
    setRevealEffect(false);
    setResult(null);
    setPendingResult(null);
    setRouletteItems(idleItems);
    setRoulettePhase("idle");
    setSpinError("");
    activeCardIndexRef.current = null;
    currentRouletteOffsetRef.current = 0;
    window.requestAnimationFrame(() => {
      if (rouletteTrackRef.current) {
        rouletteTrackRef.current.style.transform = "translate3d(0, 0, 0)";
      }
      if (rouletteViewportRef.current) {
        rouletteViewportRef.current.dataset.activeRarity = "common";
      }
      if (rouletteReadoutRef.current) {
        rouletteReadoutRef.current.textContent = "Система готова · выберите запуск";
      }
    });
    clearStoredOpening();
  }

  function cancelRouletteFrame() {
    if (rouletteFrameRef.current === null) return;
    window.cancelAnimationFrame(rouletteFrameRef.current);
    rouletteFrameRef.current = null;
  }

  function rouletteMetrics() {
    const viewport = rouletteViewportRef.current;
    const firstCard = rouletteTrackRef.current?.querySelector<HTMLElement>("[data-roulette-index='0']");
    if (!viewport || !firstCard) return null;
    const styles = window.getComputedStyle(rouletteTrackRef.current!);
    return {
      viewportWidth: viewport.clientWidth,
      itemWidth: firstCard.offsetWidth,
      gap: Number.parseFloat(styles.columnGap || styles.gap || "0") || 0,
    };
  }

  function updateRouletteOffset(offset: number, items: BonusBoxPrizeView[], progress: number) {
    currentRouletteOffsetRef.current = offset;
    if (rouletteTrackRef.current) {
      rouletteTrackRef.current.style.transform = `translate3d(${offset}px, 0, 0)`;
    }
    const metrics = rouletteMetrics();
    if (!metrics || items.length === 0) return;
    const activeIndex = rouletteActiveIndex({
      offset,
      ...metrics,
      itemCount: items.length,
    });
    if (activeCardIndexRef.current === activeIndex) return;

    const previousCard = activeCardIndexRef.current === null
      ? null
      : rouletteTrackRef.current?.querySelector<HTMLElement>(`[data-roulette-index='${activeCardIndexRef.current}']`);
    const activeCard = rouletteTrackRef.current?.querySelector<HTMLElement>(`[data-roulette-index='${activeIndex}']`);
    previousCard?.removeAttribute("data-active");
    activeCard?.setAttribute("data-active", "true");
    activeCardIndexRef.current = activeIndex;

    const activePrize = items[activeIndex];
    if (!activePrize) return;
    if (rouletteViewportRef.current) {
      rouletteViewportRef.current.dataset.activeRarity = activePrize.type === "NO_PRIZE"
        ? "empty"
        : activePrize.rarity.toLowerCase();
    }
    if (rouletteReadoutRef.current) {
      rouletteReadoutRef.current.textContent = `${rarityLabel(activePrize.rarity)} · ${prizeLabel(activePrize)}`;
    }
    if (requestInFlightRef.current) playRouletteTick(activePrize, progress);
  }

  function beginLaunch() {
    cancelRouletteFrame();
    setRoulettePhase("launch");
    const startedAt = performance.now();
    let previousAt = startedAt;
    let offset = currentRouletteOffsetRef.current;

    const frame = (now: number) => {
      const metrics = rouletteMetrics();
      const elapsed = now - startedAt;
      const delta = Math.min(48, now - previousAt);
      previousAt = now;
      const speed = Math.min(0.72, 0.18 + elapsed * 0.00028);
      offset -= delta * speed;
      if (metrics && data.prizes.length > 0) {
        const cycle = data.prizes.length * (metrics.itemWidth + metrics.gap);
        if (offset <= -cycle) offset += cycle;
      }
      updateRouletteOffset(offset, rouletteItems, Math.min(0.5, elapsed / 2200));
      rouletteFrameRef.current = window.requestAnimationFrame(frame);
    };

    rouletteFrameRef.current = window.requestAnimationFrame(frame);
  }

  async function animateRoulette(response: OpenBoxResponse) {
    cancelRouletteFrame();
    const winningIndex = resolveWinningIndex(response);
    setRouletteItems(response.reel);
    activeCardIndexRef.current = null;
    await nextPaint();

    const metrics = rouletteMetrics();
    if (!metrics) {
      void finishOpening(response, true);
      return;
    }
    const targetOffset = rouletteTargetOffset({
      ...metrics,
      winningIndex,
      stopOffsetRatio: response.stopOffsetRatio,
    });
    const startOffset = Math.min(-2 * (metrics.itemWidth + metrics.gap), currentRouletteOffsetRef.current);
    const startedAt = performance.now();
    const distance = targetOffset - startOffset;

    const frame = (now: number) => {
      const elapsedMs = now - startedAt;
      const progress = rouletteProgress(elapsedMs);
      const offset = startOffset + distance * progress;
      const phase = rouletteMotionPhase(progress);
      setRoulettePhase((current) => current === phase ? current : phase);
      updateRouletteOffset(offset, response.reel, progress);

      if (progress < 1) {
        rouletteFrameRef.current = window.requestAnimationFrame(frame);
        return;
      }

      rouletteFrameRef.current = null;
      updateRouletteOffset(targetOffset, response.reel, 1);
      void finishOpening(response);
    };

    if (reducedMotion) {
      updateRouletteOffset(targetOffset, response.reel, 1);
      void finishOpening(response);
      return;
    }
    rouletteFrameRef.current = window.requestAnimationFrame(frame);
  }

  async function finishOpening(response: OpenBoxResponse, skipDelay = false) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    cancelRouletteFrame();
    snapRouletteToWinner(response);
    setRoulettePhase("locked");
    storeOpening(response);
    playRouletteWin(response.prize);
    vibrateForPrize(response.prize);
    const freshDataPromise = apiFetch<BonusBoxOverview>("/api/bonus-box").catch(() => null);
    if (!skipDelay) {
      await waitForReveal(revealDelayMs(response.prize.rarity, reducedMotion));
    }
    setResult(response);
    setPendingResult(null);
    setRoulettePhase("revealing");
    setRevealEffect(!reducedMotion);
    setOpening(false);
    requestInFlightRef.current = false;
    const freshData = await freshDataPromise;
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
    if (!reducedMotion) {
      effectTimerRef.current = window.setTimeout(() => setRevealEffect(false), REVEAL_EFFECT_DURATION_MS);
    }
  }

  function snapRouletteToWinner(response: OpenBoxResponse) {
    const metrics = rouletteMetrics();
    if (!metrics) return;
    const targetOffset = rouletteTargetOffset({
      ...metrics,
      winningIndex: resolveWinningIndex(response),
      stopOffsetRatio: response.stopOffsetRatio,
    });
    updateRouletteOffset(targetOffset, response.reel, 1);
  }

  function setCooldown(seconds: number) {
    const safeSeconds = Math.max(1, Math.ceil(seconds));
    setCooldownSeconds(safeSeconds);
    try {
      window.sessionStorage.setItem(COOLDOWN_UNTIL_KEY, String(Date.now() + safeSeconds * 1000));
    } catch {
      // Таймер продолжит работать до обновления страницы.
    }
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      window.localStorage.setItem(SOUND_ENABLED_KEY, next ? "on" : "off");
    } catch {
      // Настройка останется активной до закрытия страницы.
    }
    if (next) playTone(620, 0.08, 0.035, "sine");
  }

  function getAudioContext() {
    if (!soundEnabled) return null;
    if (audioContextRef.current) return audioContextRef.current;
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;
    audioContextRef.current = new AudioContextConstructor();
    return audioContextRef.current;
  }

  function playTone(frequency: number, duration: number, volume: number, type: OscillatorType) {
    const context = getAudioContext();
    if (!context) return;
    void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  function playRouletteTick(prize: BonusBoxPrizeView, progress: number) {
    const now = performance.now();
    const interval = progress > 0.84 ? 34 : 48;
    if (now - lastTickAtRef.current < interval) return;
    lastTickAtRef.current = now;
    const premiumBoost = prize.rarity === "LEGENDARY" ? 260 : prize.rarity === "EPIC" ? 150 : 0;
    playTone(250 + premiumBoost + progress * 180, 0.045, premiumBoost > 0 ? 0.045 : 0.022, "triangle");
  }

  function playRouletteWin(prize: BonusBoxPrizeView) {
    if (prize.type === "NO_PRIZE") {
      playTone(190, 0.18, 0.025, "sine");
      return;
    }
    const root = prize.rarity === "LEGENDARY" ? 520 : prize.rarity === "EPIC" ? 440 : prize.rarity === "RARE" ? 390 : 330;
    playTone(root, 0.28, 0.05, "sine");
    window.setTimeout(() => playTone(root * 1.25, 0.32, 0.045, "sine"), 110);
    if (prize.rarity === "LEGENDARY") {
      window.setTimeout(() => playTone(root * 1.5, 0.45, 0.055, "sine"), 230);
    }
  }

  function vibrateForPrize(prize: BonusBoxPrizeView) {
    if (reducedMotion || !soundEnabled || typeof navigator.vibrate !== "function") return;
    if (prize.rarity === "LEGENDARY") navigator.vibrate([35, 45, 80]);
    else if (prize.rarity === "EPIC") navigator.vibrate([30, 35, 55]);
    else if (prize.rarity === "RARE") navigator.vibrate(35);
  }

  function waitForReveal(milliseconds: number) {
    return new Promise<void>((resolve) => {
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        resolve();
      }, milliseconds);
    });
  }

  async function claimMission(mission: BonusBoxMissionView) {
    setClaimingMissionId(mission.id);
    try {
      const result = await apiFetch<{ attempts: number }>(
        `/api/bonus-box/missions/${mission.id}/claim`,
        { method: "POST" },
      );
      toast(`Начислено попыток: ${result.attempts}`, "success");
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
    const storedStartedAt = readOpeningStartedAt();
    const storedSpinId = readOpeningSpinId();
    const continuingPendingSpin = Boolean(storedSpinId && storedStartedAt > 0);
    const startedAt = continuingPendingSpin ? storedStartedAt : Date.now();
    const spinId = continuingPendingSpin ? storedSpinId! : createSpinId();
    try {
      window.sessionStorage.setItem(OPENING_STARTED_KEY, String(startedAt));
      window.sessionStorage.setItem(OPENING_SPIN_ID_KEY, spinId);
    } catch {
      // Открытие всё равно защищено серверной транзакцией.
    }
    finishingRef.current = false;
    setOpening(true);
    setSpinError("");
    setRevealEffect(false);
    setResult(null);
    setPendingResult(null);
    void getAudioContext()?.resume();
    playTone(145, 0.22, 0.035, "sine");
    beginLaunch();

    try {
      let response: OpenBoxResponse;
      try {
        response = await requestBonusSpin(spinId);
      } catch (firstError) {
        if (isApiFetchError(firstError) && firstError.status < 500) throw firstError;
        await delay(450);
        try {
          response = await requestBonusSpin(spinId);
        } catch (retryError) {
          const recovered = await recoverCommittedOpening(startedAt);
          if (!recovered) throw retryError;
          response = recovered;
        }
      }
      setCooldownSeconds(0);
      try {
        window.sessionStorage.removeItem(COOLDOWN_UNTIL_KEY);
      } catch {
        // Таймер уже сброшен в состоянии страницы.
      }
      setPendingResult(response);
      storeOpening(response);
      await animateRoulette(response);
    } catch (error) {
      if (isApiFetchError(error) && error.status === 429) {
        const responseRetryAfter = typeof error.data?.retryAfter === "number"
          ? error.data.retryAfter
          : null;
        setCooldown(error.retryAfter ?? responseRetryAfter ?? 60);
      }
      cancelRouletteFrame();
      requestInFlightRef.current = false;
      if (isApiFetchError(error) && error.status < 500) clearStoredOpening();
      setOpening(false);
      setPendingResult(null);
      setRevealEffect(false);
      setRoulettePhase("error");
      setSpinError(
        isApiFetchError(error) && error.status === 429
          ? "Рулетка защищена от частых запусков. Таймер уже запущен."
          : error instanceof Error
            ? error.message
            : "Не удалось завершить запуск. Попробуйте ещё раз.",
      );
    }
  }

  async function requestBonusSpin(spinId: string) {
    return apiFetch<OpenBoxResponse>("/api/bonus-box", {
      method: "POST",
      body: JSON.stringify({ spinId }),
    });
  }

  async function recoverCommittedOpening(startedAt: number) {
    const freshData = await apiFetch<BonusBoxOverview>("/api/bonus-box").catch(() => null);
    if (!freshData) return null;
    const recovered = freshData.openings.find(
      (opening) => new Date(opening.createdAt).getTime() >= startedAt - 2_000,
    );
    if (!recovered) return null;
    setData(freshData);
    return buildRecoveredResponse(recovered, freshData);
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
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">Программа наград</span>
              <span className="h-1 w-1 rounded-full bg-fuchsia-400" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{availableNow} {attemptWord(availableNow)}</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950 dark:text-white sm:text-xl">Получить бонус</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className={cn("h-2 w-2 rounded-full", opening ? "animate-pulse bg-fuchsia-400" : "bg-cyan-400")} />
            <span aria-live="polite">{opening ? "Определяем подарок" : result ? `${rarityLabel(result.prize.rarity)} результат` : "Готово"}</span>
          </div>
        </div>

        {rouletteItems.length > 0 && (
          <div className="bonus-roulette-layout">
            <div className="bonus-roulette-theater">
              <div className="bonus-roulette-atmosphere" aria-hidden="true">
                <span /><span /><span />
              </div>
              <div className="bonus-roulette-marquee" aria-hidden="true">
                {Array.from({ length: 18 }, (_, index) => <span key={index} />)}
              </div>
              <div
                ref={rouletteViewportRef}
                className="bonus-roulette-viewport"
                data-phase={roulettePhase}
                data-active-rarity="common"
                aria-label={`Рулетка с ${data.prizes.length} возможными подарками`}
              >
                <div className="bonus-roulette-gate" aria-hidden="true">
                  <span className="bonus-roulette-gate-label">DROP ZONE</span>
                </div>
                <div ref={rouletteTrackRef} className="bonus-roulette-track" role="list">
                  {rouletteItems.map((prize, index) => (
                    <RoulettePrizeCard
                      key={`${prize.id}-${index}`}
                      prize={prize}
                      index={index}
                    />
                  ))}
                </div>
                <div className="bonus-roulette-vignette" aria-hidden="true" />
              </div>
              <div className="bonus-roulette-live">
                <span className="bonus-roulette-live-dot" aria-hidden="true" />
                <span ref={rouletteReadoutRef}>Система готова · выберите запуск</span>
                <strong aria-live="polite">{rouletteStatusLabel(roulettePhase)}</strong>
              </div>
            </div>

            <aside className="bonus-roulette-console">
              <div className="bonus-roulette-console-head">
                <div>
                  <span>Призовой пул</span>
                  <h3>Главные дропы</h3>
                </div>
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

              <div className="bonus-roulette-spotlights">
                {spotlightPrizes.map((prize, index) => (
                  <div key={prize.id} className="bonus-roulette-spotlight" data-rarity={prize.rarity.toLowerCase()}>
                    <span>{index === 0 ? <Crown /> : <Gem />}</span>
                    <div>
                      <small>{rarityLabel(prize.rarity)}</small>
                      <strong>{prizeLabel(prize)}</strong>
                      <p>{prize.title}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bonus-roulette-stats">
                <div>
                  <span>Попытки</span>
                  <strong>{availableNow}</strong>
                </div>
                <div>
                  <span>Серия</span>
                  <strong>{data.openingStreak.current}</strong>
                </div>
                <div>
                  <span>До гарантии</span>
                  <strong>{data.pityProgress.guaranteedNext ? "сейчас" : data.pityProgress.remaining ?? "—"}</strong>
                </div>
              </div>

              {openCaseCta ? (
                <div className="mt-4">{openCaseCta}</div>
              ) : (
                <button
                  type="button"
                  className={cn(openButtonClass, "mt-4 w-full")}
                  onClick={openBox}
                  disabled={!canOpen}
                  aria-label={`${openButtonLabel}. Доступно: ${availableNow} ${attemptWord(availableNow)}`}
                >
                  <span className="bonus-roulette-cta-shine" aria-hidden="true" />
                  <span className="relative flex items-center justify-center gap-2">
                    {opening ? <LoaderCircle className="animate-spin" /> : spinError ? <RotateCw /> : <Sparkles />}
                    <span>{opening ? "Рулетка запущена" : spinError ? "Запустить снова" : "Крутить рулетку"}</span>
                  </span>
                </button>
              )}

              {opening && pendingResult && !reducedMotion && (
                <button
                  type="button"
                  className="bonus-roulette-skip"
                  onClick={() => void finishOpening(pendingResult, true)}
                >
                  Показать результат сразу
                </button>
              )}
              {cooldownSeconds > 0 && (
                <div className="bonus-roulette-cooldown" role="status" aria-live="polite">
                  <CalendarClock aria-hidden="true" />
                  <span>Следующий запуск через <strong>{formatCooldown(cooldownSeconds)}</strong></span>
                </div>
              )}
              {spinError && cooldownSeconds === 0 && (
                <div className="bonus-roulette-error" role="alert">{spinError}</div>
              )}

              <p className="bonus-roulette-fairness">
                Размер карточки не показывает шанс. Итог рассчитывается на сервере, точные проценты есть во вкладке «Призы».
              </p>
            </aside>

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
        )}

        {(canUseWelcomeAttempts || lockedAttempts > 0) && (
          <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.035] dark:text-slate-300 sm:px-5">
            {canUseWelcomeAttempts
              ? `Приветственных попыток сейчас: ${data.welcomeAttemptsCount}.${lockedAttempts > 0 ? ` Ещё ${lockedAttempts} будут доступны после активации подписки.` : ""}`
              : `${lockedAttempts} попыток сохранено на балансе и станет доступно после активации подписки.`}
          </div>
        )}
      </section>

      <section className="bonus-content-deck order-4 space-y-4">
        {data.pityProgress.enabled && hasRareOrBetter && (
          <div className="flex flex-col gap-2 border-y border-slate-200 py-3 text-sm dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">
                Гарантия подарка
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
                <span>Получить попытки</span>
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
                Как получить попытки
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
                <span>Список подарков</span>
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
                <span>История попыток</span>
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

function RoulettePrizeCard({ prize, index }: { prize: BonusBoxPrizeView; index: number }) {
  const empty = prize.type === "NO_PRIZE";
  return (
    <article
      className="bonus-roulette-card"
      data-roulette-index={index}
      data-rarity={empty ? "empty" : prize.rarity.toLowerCase()}
      role="listitem"
      aria-label={`${prize.title}: ${prizeLabel(prize)}, ${rarityLabel(prize.rarity)}`}
    >
      <div className="bonus-roulette-card-sheen" aria-hidden="true" />
      <div className="bonus-roulette-card-icon" aria-hidden="true">
        {empty
          ? <CircleSlash />
          : prize.rarity === "LEGENDARY"
            ? <Crown />
            : prize.rarity === "EPIC"
              ? <Gem />
              : <Gift />}
      </div>
      <span className="bonus-roulette-card-rarity">{rarityLabel(prize.rarity)}</span>
      <strong>{prizeLabel(prize)}</strong>
      <h4>{prize.title}</h4>
      <div className="bonus-roulette-card-line" aria-hidden="true" />
    </article>
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
  const particleCount = revealParticleCount(result.prize.rarity, isEmpty);
  const resultClass = `bonus-wheel-result-modal--${isEmpty ? "empty" : result.prize.rarity.toLowerCase()}`;
  const title = isEmpty
    ? "В этот раз без бонуса"
    : result.prize.rarity === "LEGENDARY"
      ? "Главный приз"
      : result.prize.rarity === "EPIC"
        ? "Особый дроп"
        : "Подарок получен";
  const description = isEmpty
    ? "Прогресс до гарантированного приза продолжает расти."
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
      {revealEffect && particleCount > 0 && (
        <div className="bonus-wheel-celebration" aria-hidden="true">
          {Array.from({ length: particleCount }, (_, index) => (
            <span
              key={index}
              style={{
                "--particle-index": index,
                "--particle-x": `${(index % 9) * 14 - 56}%`,
                "--particle-delay": `${(index % 7) * 38}ms`,
                "--particle-rotation": `${420 + (index % 5) * 115}deg`,
              } as CSSProperties}
            />
          ))}
        </div>
      )}

      <div className="bonus-wheel-result-copy" role="status" aria-live="polite">
        <div className="bonus-wheel-result-orbits" aria-hidden="true"><span /><span /><span /></div>
        <div className="bonus-wheel-result-icon" aria-hidden="true">
          {isEmpty
            ? <CircleSlash />
            : result.prize.rarity === "LEGENDARY"
              ? <Crown />
              : result.prize.rarity === "EPIC"
                ? <Gem />
                : <Trophy />}
        </div>
        <div className="bonus-wheel-result-kicker">
          {isEmpty
            ? "Результат готов"
            : !result.remoteSynced && prizeRequiresSubscription(result.prize)
              ? "Подарок сохранён"
              : `${rarityLabel(result.prize.rarity)} подарок`}
        </div>
        <strong>{prizeLabel(result.prize)}</strong>
        <h3>{result.prize.title}</h3>
        <p>
          {result.prize.description
            || (isEmpty
              ? "В этот раз без начисления. Следующая попытка может принести подарок."
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

function readOpeningSpinId() {
  try {
    const value = window.sessionStorage.getItem(OPENING_SPIN_ID_KEY);
    return value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

function clearStoredOpening() {
  try {
    window.sessionStorage.removeItem(PENDING_OPENING_KEY);
    window.sessionStorage.removeItem(OPENING_STARTED_KEY);
    window.sessionStorage.removeItem(OPENING_SPIN_ID_KEY);
  } catch {
    // Хранилище может быть недоступно в приватном режиме браузера.
  }
}

function attemptWord(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'попыток';
  if (mod10 === 1) return 'попытка';
  if (mod10 >= 2 && mod10 <= 4) return 'попытки';
  return 'попыток';
}

function formatCooldown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0
    ? `${minutes}:${String(remainder).padStart(2, "0")}`
    : `0:${String(remainder).padStart(2, "0")}`;
}

function buildIdleRoulette(prizes: BonusBoxPrizeView[]) {
  if (prizes.length === 0) return [];
  const length = Math.max(28, prizes.length * 5);
  return Array.from({ length }, (_, index) => prizes[index % prizes.length]!);
}

function buildRecoveredResponse(opening: BonusBoxOpeningView, data: BonusBoxOverview): OpenBoxResponse {
  const winningIndex = 42;
  const source = data.prizes.length > 0 ? data.prizes : [opening.prize];
  const reel = Array.from({ length: 52 }, (_, index) => source[index % source.length]!);
  reel[winningIndex] = opening.prize;
  return {
    ...opening,
    reel,
    winningIndex,
    stopOffsetRatio: 0.5,
    remainingAttempts: data.hasActiveSubscription ? data.attemptsCount : data.welcomeAttemptsCount,
  };
}

function resolveWinningIndex(response: OpenBoxResponse) {
  const serverWinner = response.reel[response.winningIndex];
  if (serverWinner?.id === response.prize.id) return response.winningIndex;
  const recoveredIndex = response.reel.findIndex((prize) => prize.id === response.prize.id);
  return recoveredIndex >= 0 ? recoveredIndex : 0;
}

function rouletteStatusLabel(phase: RoulettePhase) {
  if (phase === "launch") return "Разгон";
  if (phase === "cruise") return "Высокая скорость";
  if (phase === "anticipation") return "Приз уже близко";
  if (phase === "locking") return "Фиксируем дроп";
  if (phase === "locked") return "Приз выбран";
  if (phase === "revealing") return "Результат готов";
  if (phase === "error") return "Нужен повтор";
  return "Готово к запуску";
}

function rarityRank(rarity: BonusBoxPrizeView["rarity"]) {
  if (rarity === "LEGENDARY") return 3;
  if (rarity === "EPIC") return 2;
  if (rarity === "RARE") return 1;
  return 0;
}

function createSpinId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
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
                  {event.attemptsGranted > 0 && <span>Получено попыток: {event.attemptsGranted}</span>}
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
              const displayTarget = mission.claimed && mission.value < mission.target
                ? Math.max(1, mission.value)
                : mission.target
              const percent = Math.min(100, (mission.value / Math.max(1, displayTarget)) * 100)
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
                        +{mission.rewardAttempts} {attemptWord(mission.rewardAttempts)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="bonus-mission-progress">
                        <div style={{ width: `${percent}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{mission.value}/{displayTarget}</span>
                    </div>
                  </div>
                  <div className="bonus-mission-action">
                    {mission.claimed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                        <Check className="h-3.5 w-3.5" />
                        {mission.value < mission.target ? "Получено ранее" : "Получено"}
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
                      <span className="text-xs text-slate-400">до {formatDateOnly(mission.endsAt)}</span>
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
        <span className="border-l-2 border-cyan-400 pl-2 font-mono text-xs font-semibold uppercase text-cyan-700 dark:text-cyan-100">
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
                  <div className="mt-1 font-mono text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">
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
                "shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-xs font-semibold uppercase",
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
          <div className="mt-0.5 text-xs text-slate-400">базовый шанс</div>
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
              "mt-2 inline-flex rounded-sm px-2 py-1 font-mono text-xs font-semibold uppercase",
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
      : "Попытки за приглашения сейчас не начисляются.";
  const weeklyText =
    config.weeklyEnabled && config.weeklyAttempts > 0
      ? `Раз в неделю с дня "${weekdayLabel(config.weeklyDay)}": +${config.weeklyAttempts}, если VPN-подписка активна.`
      : "Еженедельный бонус сейчас выключен.";
  const ttlText =
    config.attemptTtlDays > 0
      ? `Попытки хранятся ${config.attemptTtlDays} дн.`
      : "Попытки не сгорают.";

  return (
    <section className="grid gap-3 md:grid-cols-3">
      <RuleCard
        icon={<CreditCard className="h-5 w-5" />}
        title="За оплату"
        text={`1 попытка за каждые ${config.rubPerAttempt} ₽. За платёж можно получить ${paymentRange}.`}
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
