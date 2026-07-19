"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  Check,
  CreditCard,
  Gauge,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
} from "lucide-react";

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
  promoCodesEnabled?: boolean;
  popular?: boolean;
  current?: boolean;
  initialPromoCode?: string;
  paymentProviders?: Array<{
    id: "YOOKASSA" | "PAYANYWAY";
    label: string;
  }>;
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
  promoCodesEnabled = true,
  popular,
  current,
  initialPromoCode,
  paymentProviders = [{ id: "YOOKASSA", label: "ЮKassa" }],
  availablePromoCodes = [],
}: PlanCardProps) {
  const [loading, setLoading] = useState(false);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [manualPromoOpen, setManualPromoOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<"YOOKASSA" | "PAYANYWAY">(
    paymentProviders[0]?.id ?? "YOOKASSA",
  );
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
    if (!initialPromoCode || isPromoPlan || !promoCodesEnabled) return;
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
  }, [initialPromoCode, isPromoPlan, normalizedInitialPromoCode, promoCodesEnabled, suggestedPromoCodes]);

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

    if (promoCodesEnabled && trimmedPromo && !appliedPromo) {
      toast("Сначала примените промокод или очистите поле");
      return;
    }
    if (paymentProviders.length === 0) {
      toast("Оплата временно недоступна");
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
          provider: selectedProvider,
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
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-950/[0.025] dark:border-white/[0.09] dark:bg-white/[0.035] dark:shadow-none lg:p-5",
        popular && "border-cyan-300 dark:border-cyan-400/40",
        current && "border-cyan-300 bg-cyan-50/55 shadow-cyan-950/[0.04] dark:border-cyan-400/40 dark:bg-cyan-500/[0.07]",
        isPromoPlan && "border-emerald-200 dark:border-emerald-400/30",
      )}
    >
      {(popular || current || isPromoPlan) && (
        <span
          className={cn(
            "absolute inset-x-5 top-0 h-0.5 rounded-b-full",
            current || popular ? "bg-cyan-400" : "bg-emerald-400",
          )}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/[0.07] dark:text-slate-200",
              (current || popular) && "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-200",
              isPromoPlan && "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200",
            )}
          >
            {isPromoPlan ? <Sparkles className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <div className="min-w-0 pt-0.5">
            <h3 className="break-words text-lg font-semibold leading-tight tracking-[-0.02em] text-slate-950 dark:text-white sm:text-xl">
              {name}
            </h3>
            {description && (
              <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
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

      <div className="mt-5 border-b border-slate-100 pb-4 dark:border-white/[0.08]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <div className="whitespace-nowrap text-[2rem] font-semibold leading-none tracking-[-0.04em] text-slate-950 dark:text-white sm:text-4xl">
              {effectivePrice}
            </div>
            {appliedPromo && (
              <div className="text-sm text-slate-400 line-through">{price}</div>
            )}
          </div>
          {savingsPercent > 0 && !isPromoPlan ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
              <BadgePercent className="h-3.5 w-3.5" />
              -{savingsPercent}%
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {isPromo ? "один раз на аккаунт" : `${monthlyPrice} за 30 дней`}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <PlanFact icon={<CalendarDays className="h-4 w-4" />} label="Срок" value={`${durationDays} дн.`} />
        <PlanFact
          icon={<Gauge className="h-4 w-4" />}
          label="Трафик"
          value={trafficLimitGb == null ? "Безлимит" : `${trafficLimitGb} ГБ`}
        />
        <PlanFact icon={<MonitorSmartphone className="h-4 w-4" />} label="Устройства" value={`До ${deviceLimit}`} />
      </div>

      <div className="mt-auto pt-5">
        {!isPromoPlan && promoCodesEnabled && (promoOpen || appliedPromo) ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Tag className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                Промокод
              </span>
              {appliedPromo ? (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                  Скидка {appliedPromo.discountPercent}%
                </span>
              ) : null}
            </div>
            {suggestedPromoCodes.length > 0 && !manualPromoOpen ? (
              <select
                className="input"
                aria-label="Доступный промокод"
                value={appliedPromo?.code ?? ""}
                onChange={(event) => {
                  const promo = suggestedPromoCodes.find((item) => item.code === event.target.value);
                  if (promo) selectAwardedPromo(promo);
                }}
              >
                <option value="" disabled>Выберите промокод</option>
                {suggestedPromoCodes.map((promo) => (
                  <option key={promo.code} value={promo.code}>{promo.code} · скидка {promo.discountPercent}%</option>
                ))}
              </select>
            ) : null}
            {showManualPromoInput && (
              <div className="flex min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-surface-900">
                <Tag className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={promoInput}
                  onChange={(event) => {
                    setPromoInput(event.target.value);
                    setAppliedPromo(null);
                  }}
                  placeholder="Промокод"
                  className="min-w-0 flex-1 bg-transparent text-base font-medium uppercase outline-none placeholder:normal-case placeholder:text-slate-400 sm:text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-950"
                  onClick={applyPromo}
                  disabled={validatingPromo}
                  aria-label="Применить промокод"
                >
                  <Check className="h-4 w-4" />
                </button>
                {promoInput ? (
                  <button
                    type="button"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
                    onClick={resetPromo}
                    aria-label="Очистить промокод"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            )}
            {appliedPromo && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                <span>-{formatPrice(appliedPromo.discountKopecks)} от стоимости</span>
                {suggestedPromoCodes.length > 0 && !manualPromoOpen ? (
                  <button type="button" className="text-slate-500 hover:text-slate-900 dark:hover:text-white" onClick={resetPromo}>
                    Другой код
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : !isPromoPlan && promoCodesEnabled ? (
          <button
            type="button"
            className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-dashed border-slate-200 px-3 text-left text-sm font-medium text-slate-600 transition-colors hover:border-cyan-300 hover:bg-cyan-50/50 hover:text-cyan-800 dark:border-white/10 dark:text-slate-300 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-400/[0.06] dark:hover:text-cyan-100"
            onClick={openPromoBlock}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <Tag className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
              <span className="truncate">
                {bestPromo ? `Доступна скидка ${bestPromo.discountPercent}%` : "Есть промокод?"}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : null}

        {!isPromoPlan && paymentProviders.length > 1 ? (
          <fieldset className="mt-3">
            <legend className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Способ оплаты</legend>
            <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]" role="radiogroup" aria-label="Способ оплаты">
              {paymentProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedProvider === provider.id}
                  onClick={() => setSelectedProvider(provider.id)}
                  className={cn(
                    "min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors",
                    selectedProvider === provider.id
                      ? "bg-white text-slate-950 shadow-sm dark:bg-surface-800 dark:text-white"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
                  )}
                >
                  {provider.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : !isPromoPlan && paymentProviders.length === 1 ? (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>Способ оплаты</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">{paymentProviders[0]?.label}</span>
          </div>
        ) : null}

        {!isPromoPlan && paymentProviders.length === 0 ? (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-center text-xs text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
            Оплата временно недоступна
          </div>
        ) : null}

        <button
          type="button"
          onClick={buy}
          disabled={loading || (!isPromoPlan && paymentProviders.length === 0)}
          className="btn-primary group mt-4 w-full min-h-11 justify-between px-4"
        >
          <span className="inline-flex items-center gap-2">
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
          </span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

function PlanFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-2.5 py-3 dark:bg-white/[0.045]">
      <div className="mb-2 text-slate-400 dark:text-slate-500">{icon}</div>
      <div className="break-words text-sm font-semibold leading-tight text-slate-900 dark:text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-tight text-slate-500">{label}</div>
    </div>
  );
}
