"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { Check, CreditCard, Sparkles, Tag, X } from "lucide-react";

export interface PlanCardProps {
  id: string;
  name: string;
  description: string | null;
  price: string;
  priceKopecks: number;
  monthlyPrice: string;
  savingsPercent: number;
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
  monthlyPrice,
  savingsPercent,
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

  const isPromoPlan = isPromo;
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
      data-testid="plan-card"
      className={cn(
        "card relative flex h-full min-h-0 flex-col overflow-hidden p-4 lg:p-5",
        popular &&
          "border-cyan-300 dark:border-cyan-400/40",
        current && "bg-cyan-50/70 dark:bg-cyan-500/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold leading-tight tracking-tight sm:text-xl">
            {name}
          </h3>
        </div>
        {current ? (
          <span className="badge-active shrink-0">Ваш тариф</span>
        ) : isPromo ? (
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
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      <div className="mt-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="whitespace-nowrap text-3xl font-semibold tracking-tight">
            {effectivePrice}
          </div>
          {appliedPromo && (
            <div className="text-sm text-slate-400 line-through">{price}</div>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {isPromo ? "один раз на аккаунт" : `${monthlyPrice} за 30 дней`}
          {savingsPercent > 0 ? <span className="font-semibold text-emerald-600 dark:text-emerald-300">Экономия {savingsPercent}%</span> : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 rounded-xl bg-slate-50 px-1 py-3 text-center dark:divide-white/10 dark:bg-white/[0.04]">
        <PlanFact label="Срок" value={`${durationDays} дн.`} />
        <PlanFact label="Трафик" value={trafficLimitGb == null ? "Безлимит" : `${trafficLimitGb} ГБ`} />
        <PlanFact label="Устройства" value={`До ${deviceLimit}`} />
      </div>

      {!isPromoPlan && (promoOpen || appliedPromo) ? (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-white/10">
          {suggestedPromoCodes.length > 0 && !manualPromoOpen ? (
            <select
              className="input"
              aria-label="Доступный промокод"
              value={appliedPromo?.code ?? ''}
              onChange={(event) => {
                const promo = suggestedPromoCodes.find((item) => item.code === event.target.value)
                if (promo) selectAwardedPromo(promo)
              }}
            >
              <option value="" disabled>Выберите промокод</option>
              {suggestedPromoCodes.map((promo) => (
                <option key={promo.code} value={promo.code}>{promo.code} · скидка {promo.discountPercent}%</option>
              ))}
            </select>
          ) : null}
          {showManualPromoInput && (
            <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-surface-900">
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
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-300">
              <span>Скидка {appliedPromo.discountPercent}% · -{formatPrice(appliedPromo.discountKopecks)}</span>
              {suggestedPromoCodes.length > 0 && !manualPromoOpen ? (
                <button type="button" className="text-slate-500 hover:text-slate-900 dark:hover:text-white" onClick={resetPromo}>Другой код</button>
              ) : null}
            </div>
          )}
        </div>
      ) : !isPromoPlan ? (
        <div className="mt-auto pt-4">
          <button
            type="button"
            className="inline-flex items-center gap-2 text-sm font-medium text-cyan-700 hover:text-cyan-900 dark:text-cyan-200 dark:hover:text-white"
            onClick={openPromoBlock}
          >
            <Tag className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
            {bestPromo ? `Применить скидку ${bestPromo.discountPercent}%` : "Ввести промокод"}
          </button>
        </div>
      ) : (
        <div className="mt-auto" />
      )}
      <button
        type="button"
        onClick={buy}
        disabled={loading}
        className="btn-primary mt-4 w-full min-h-11"
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

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2">
      <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">{value}</div>
      <div className="mt-0.5 truncate text-xs text-slate-500">{label}</div>
    </div>
  );
}
