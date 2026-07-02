"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { Check, CreditCard, Sparkles, Tag, X } from "lucide-react";

interface PlanCardProps {
  id: string;
  name: string;
  description: string | null;
  price: string;
  priceKopecks: number;
  durationDays: number;
  trafficLimitGb: number | null;
  deviceLimit: number;
  isPromo?: boolean;
  popular?: boolean;
  current?: boolean;
  initialPromoCode?: string;
  availablePromoCodes?: Array<{
    code: string;
    discountPercent: number;
    discountKopecks: number;
    finalAmountKopecks: number;
    source: "BONUS_BOX" | "WELCOME" | "LINK";
  }>;
}

export function PlanCard({
  id,
  name,
  description,
  price,
  priceKopecks,
  durationDays,
  trafficLimitGb,
  deviceLimit,
  isPromo = false,
  popular,
  current,
  initialPromoCode,
  availablePromoCodes = [],
}: PlanCardProps) {
  const [loading, setLoading] = useState(false);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [manualPromoOpen, setManualPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPercent: number;
    discountKopecks: number;
    finalAmountKopecks: number;
  } | null>(null);

  const isPromoPlan = isPromo || priceKopecks <= 0;
  const trimmedPromo = promoInput.trim();
  const effectivePrice = appliedPromo
    ? formatPrice(appliedPromo.finalAmountKopecks)
    : price;
  const normalizedInitialPromoCode = initialPromoCode?.trim().toUpperCase() || "";
  const suggestedPromoCodes = useMemo(() => {
    const sorted = [...availablePromoCodes].sort((a, b) => {
      if (b.discountKopecks !== a.discountKopecks) return b.discountKopecks - a.discountKopecks;
      return b.discountPercent - a.discountPercent;
    });
    const linkedPromo = normalizedInitialPromoCode
      ? sorted.find((promo) => promo.code.toUpperCase() === normalizedInitialPromoCode)
      : null;
    const visible = linkedPromo
      ? [linkedPromo, ...sorted.filter((promo) => promo.code !== linkedPromo.code)]
      : sorted;
    return visible.slice(0, 3);
  }, [availablePromoCodes, normalizedInitialPromoCode]);
  const bestPromo = suggestedPromoCodes[0] ?? null;
  const showManualPromoInput =
    promoOpen && (manualPromoOpen || suggestedPromoCodes.length === 0);

  useEffect(() => {
    if (!initialPromoCode || isPromoPlan) return;
    const awardedPromo = suggestedPromoCodes.find((promo) => promo.code.toUpperCase() === normalizedInitialPromoCode);

    setPromoOpen(true);
    if (awardedPromo) {
      setManualPromoOpen(false);
      setPromoInput(awardedPromo.code);
      setAppliedPromo({
        code: awardedPromo.code,
        discountPercent: awardedPromo.discountPercent,
        discountKopecks: awardedPromo.discountKopecks,
        finalAmountKopecks: awardedPromo.finalAmountKopecks,
      });
      return;
    }

    if (suggestedPromoCodes.length > 0) {
      setManualPromoOpen(false);
      return;
    }

    setManualPromoOpen(true);
    setPromoInput(initialPromoCode);
  }, [initialPromoCode, isPromoPlan, normalizedInitialPromoCode, suggestedPromoCodes]);

  async function buy() {
    if (isPromoPlan) {
      setLoading(true);
      try {
        const { redirectUrl } = await apiFetch<{ redirectUrl?: string }>(
          "/api/payment/create",
          {
            method: "POST",
            body: JSON.stringify({ planId: id }),
          },
        );
        window.location.href = redirectUrl || "/dashboard/subscription";
      } catch {
        // apiFetch показал toast
      } finally {
        setLoading(false);
      }
      return;
    }

    if (trimmedPromo && !appliedPromo) {
      toast("Сначала примените промокод или очистите поле");
      return;
    }

    setLoading(true);
    try {
      const { confirmationUrl, redirectUrl } = await apiFetch<{
        confirmationUrl?: string;
        redirectUrl?: string;
      }>("/api/payment/create", {
        method: "POST",
        body: JSON.stringify({
          planId: id,
          ...(appliedPromo ? { promoCode: appliedPromo.code } : {}),
        }),
      });
      if (confirmationUrl) {
        window.location.href = confirmationUrl;
      } else if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        toast("Не получили ссылку на оплату");
      }
    } catch {
      // apiFetch показал toast
    } finally {
      setLoading(false);
    }
  }

  async function applyPromo() {
    if (!trimmedPromo) {
      toast("Введите промокод");
      return;
    }

    setValidatingPromo(true);
    try {
      const discount = await apiFetch<{
        code: string;
        discountPercent: number;
        discountKopecks: number;
        finalAmountKopecks: number;
      }>("/api/promo-codes/validate", {
        method: "POST",
        body: JSON.stringify({ planId: id, promoCode: trimmedPromo }),
      });
      setAppliedPromo(discount);
      setPromoInput(discount.code);
      if (suggestedPromoCodes.length > 0) {
        setManualPromoOpen(false);
      }
      toast("Промокод применён", "success");
    } catch {
      setAppliedPromo(null);
    } finally {
      setValidatingPromo(false);
    }
  }

  function selectAwardedPromo(promo: NonNullable<PlanCardProps["availablePromoCodes"]>[number]) {
    setPromoOpen(true);
    setManualPromoOpen(false);
    setPromoInput(promo.code);
    setAppliedPromo({
      code: promo.code,
      discountPercent: promo.discountPercent,
      discountKopecks: promo.discountKopecks,
      finalAmountKopecks: promo.finalAmountKopecks,
    });
    toast("Промокод выбран", "success");
  }

  function resetPromo() {
    setPromoInput("");
    setAppliedPromo(null);
    setManualPromoOpen(true);
  }

  function openPromoBlock() {
    if (bestPromo) {
      selectAwardedPromo(bestPromo);
      return;
    }
    setManualPromoOpen(true);
    setPromoOpen(true);
  }

  return (
    <div
      className={cn(
        "card group relative flex h-full min-h-0 flex-col overflow-hidden p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-200/80 hover:shadow-xl sm:min-h-[360px] sm:p-4 lg:p-5",
        popular &&
          "border-slate-950 ring-2 ring-slate-950/10 dark:border-white dark:ring-white/15",
        current && "bg-cyan-50/70 dark:bg-cyan-500/10",
      )}
    >
      {popular && (
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-emerald-400 to-brand-500" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pr-2">
          <h3 className="break-words text-base font-semibold leading-tight tracking-tight sm:text-xl">
            {name}
          </h3>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 sm:mt-1.5 sm:text-sm">
            {durationDays} дней доступа
          </div>
          {current && (
            <span className="mt-2 block text-xs font-medium text-cyan-700 dark:text-cyan-200">
              Ваш текущий тариф
            </span>
          )}
        </div>
        {isPromo ? (
          <span className="badge shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <Sparkles className="mr-1 h-3 w-3" />
            Пробный
          </span>
        ) : (
          popular && (
            <span className="badge shrink-0 bg-slate-950 text-white dark:bg-white dark:text-slate-950">
              <Sparkles className="mr-1 h-3 w-3" />
              Популярный
            </span>
          )
        )}
      </div>
      {description && (
        <p className="mt-2 line-clamp-1 text-xs leading-5 text-slate-500 dark:text-slate-400 sm:mt-3 sm:line-clamp-2 sm:text-sm sm:leading-6">
          {description}
        </p>
      )}
      <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 dark:border-white/10 dark:bg-white/[0.035] sm:mt-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="whitespace-nowrap text-xl font-semibold tracking-tight sm:text-3xl">
            {effectivePrice}
          </div>
          {appliedPromo && (
            <div className="text-sm text-slate-400 line-through">{price}</div>
          )}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
          {isPromo ? "один раз на аккаунт" : "оплата онлайн"}
        </div>
      </div>
      <ul className="mt-3 grid gap-1.5 text-xs text-slate-600 dark:text-slate-300 sm:mt-4 sm:min-h-[86px] sm:gap-2 sm:text-sm">
        <Feature strong>
          {trafficLimitGb == null
            ? "Безлимитный трафик"
            : `${trafficLimitGb} ГБ трафика`}
        </Feature>
        <Feature className="hidden sm:flex">Доступ сразу после оплаты</Feature>
        <Feature className="hidden sm:flex">QR и ссылка подписки</Feature>
        <Feature>До {deviceLimit} устройств</Feature>
      </ul>
      {!isPromoPlan && (promoOpen || appliedPromo) ? (
        <div className="mt-auto space-y-2 pt-3">
          {suggestedPromoCodes.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 shadow-inner shadow-white/5">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-cyan-500 dark:text-cyan-300" />
                  <span className="truncate">Доступные промокоды</span>
                </span>
                {bestPromo && (
                  <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 font-semibold text-cyan-800 dark:text-cyan-100">
                    лучший -{bestPromo.discountPercent}%
                  </span>
                )}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {suggestedPromoCodes.map((promo) => (
                  <button
                    key={promo.code}
                    type="button"
                    className={cn(
                      "min-w-0 rounded-xl border px-2.5 py-2 text-left transition",
                      appliedPromo?.code === promo.code
                        ? "border-emerald-300/60 bg-emerald-400/12 text-emerald-900 shadow-sm shadow-emerald-950/10 dark:text-emerald-100"
                        : "border-white/10 bg-slate-950/[0.03] text-slate-600 hover:border-cyan-300/35 hover:bg-cyan-300/10 dark:bg-slate-950/35 dark:text-slate-300"
                    )}
                    onClick={() => selectAwardedPromo(promo)}
                  >
                    <span className="block truncate text-xs font-semibold">{promo.code}</span>
                    <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                      -{promo.discountPercent}%
                    </span>
                  </button>
                ))}
              </div>
              {!manualPromoOpen && (
                <button
                  type="button"
                  className="mt-2 text-xs font-medium text-cyan-800 transition hover:text-slate-950 dark:text-cyan-100/75 dark:hover:text-white"
                  onClick={() => setManualPromoOpen(true)}
                >
                  Ввести другой
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200">
              Введите свой промокод вручную
            </div>
          )}
          {showManualPromoInput && (
            <div className="flex min-w-0 items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-surface-900">
              <Tag className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={promoInput}
                onChange={(event) => {
                  setPromoInput(event.target.value);
                  setAppliedPromo(null);
                }}
                placeholder="Промокод"
                className="min-w-0 flex-1 bg-transparent text-sm font-medium uppercase outline-none placeholder:normal-case placeholder:text-slate-400"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
                onClick={applyPromo}
                disabled={validatingPromo}
                aria-label="Применить промокод"
              >
                <Check className="h-4 w-4" />
              </button>
              {promoInput ? (
                <button
                  type="button"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-surface-800 dark:hover:text-slate-200"
                  onClick={resetPromo}
                  aria-label="Очистить промокод"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          )}
          {appliedPromo && (
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-300">
              Скидка {appliedPromo.discountPercent}%: -
              {formatPrice(appliedPromo.discountKopecks)}
            </div>
          )}
        </div>
      ) : !isPromoPlan ? (
        <div className="mt-auto pt-4">
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] px-3 py-2 text-left text-sm font-semibold text-cyan-950 shadow-sm shadow-cyan-950/5 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.12] dark:text-cyan-100"
            onClick={openPromoBlock}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-cyan-200/80 text-cyan-950 dark:bg-cyan-300/15 dark:text-cyan-100">
              <Tag className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">
                {bestPromo ? "Выбрать промокод" : "У меня есть промокод"}
              </span>
              {bestPromo && (
                <span className="block truncate text-xs font-medium text-cyan-800/75 dark:text-cyan-100/70">
                  Доступна скидка до {bestPromo.discountPercent}%
                </span>
              )}
            </span>
            {bestPromo && (
              <span className="shrink-0 rounded-full bg-white/95 px-2 py-0.5 text-xs font-bold text-slate-950 shadow-sm dark:bg-white">
                -{bestPromo.discountPercent}%
              </span>
            )}
          </button>
        </div>
      ) : (
        <div className="mt-auto" />
      )}
      <button
        onClick={buy}
        disabled={loading}
        className="btn-primary mt-4 w-full min-h-10 sm:mt-5 sm:min-h-11"
      >
        <CreditCard className="h-4 w-4" />
        {loading
          ? isPromoPlan
            ? "Активируем..."
            : "Создаём платёж..."
          : isPromoPlan
            ? "Активировать"
            : current
              ? "Продлить текущий"
              : "Купить VPN"}
      </button>
    </div>
  );
}

function Feature({
  children,
  strong = false,
  className,
}: {
  children: React.ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <li className={cn("flex items-start gap-2 sm:gap-3", className)}>
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      <span
        className={
          strong ? "font-medium text-slate-900 dark:text-white" : undefined
        }
      >
        {children}
      </span>
    </li>
  );
}
