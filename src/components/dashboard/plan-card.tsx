"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/components/ui/toaster";
import { Checkbox } from "@/components/ui/checkbox";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { CheckoutPaymentProvider } from "@/lib/payment-providers";
import { AUTO_RENEWAL_CONSENT_VERSION } from "@/lib/auto-renewal-consent";
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  Check,
  CreditCard,
  Gauge,
  MonitorSmartphone,
  RefreshCw,
  Minus,
  Plus,
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
  maxDeviceLimit: number;
  extraDevicePriceKopecks: number;
  initialDeviceLimit?: number;
  currentDeviceLimit?: number | null;
  isPromo?: boolean;
  promoCodesEnabled?: boolean;
  popular?: boolean;
  current?: boolean;
  autoRenewalEnabled?: boolean;
  display?: "full" | "checkout";
  initialPromoCode?: string;
  paymentProviders?: Array<{
    id: CheckoutPaymentProvider;
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
  priceKopecks,
  savingsPercent,
  durationDays,
  trafficLimitGb,
  deviceLimit,
  maxDeviceLimit,
  extraDevicePriceKopecks,
  initialDeviceLimit,
  currentDeviceLimit,
  isPromo = false,
  promoCodesEnabled = true,
  popular,
  current,
  autoRenewalEnabled = false,
  display = "full",
  initialPromoCode,
  paymentProviders = [{ id: "YOOKASSA", label: "ЮKassa" }],
  availablePromoCodes = [],
}: PlanCardProps) {
  const checkoutDisplay = display === "checkout";
  const [loading, setLoading] = useState(false);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [manualPromoOpen, setManualPromoOpen] = useState(false);
  const [checkoutConfirmOpen, setCheckoutConfirmOpen] = useState(false);
  const [autoRenewalRequested, setAutoRenewalRequested] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<CheckoutPaymentProvider>(
    paymentProviders[0]?.id ?? "YOOKASSA",
  );
  const [promoInput, setPromoInput] = useState("");
  const normalizedMaxDeviceLimit = Math.max(deviceLimit, maxDeviceLimit);
  const [selectedDeviceLimit, setSelectedDeviceLimit] = useState(() =>
    clampDeviceLimit(initialDeviceLimit ?? deviceLimit, deviceLimit, normalizedMaxDeviceLimit),
  );
  const [deviceLimitInput, setDeviceLimitInput] = useState(() =>
    String(clampDeviceLimit(initialDeviceLimit ?? deviceLimit, deviceLimit, normalizedMaxDeviceLimit)),
  );
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPercent: number;
    discountKopecks: number;
    finalAmountKopecks: number;
  } | null>(null);
  const checkoutAttemptRef = useRef<{ key: string; fingerprint: string } | null>(null);

  const isPromoPlan = isPromo;
  const trimmedPromo = promoInput.trim();
  const extraDeviceCount = selectedDeviceLimit - deviceLimit;
  const extraDeviceAmountKopecks = extraDeviceCount * extraDevicePriceKopecks;
  const purchasePriceKopecks = priceKopecks + extraDeviceAmountKopecks;
  const displayedDiscount = appliedPromo
    ? calculateDisplayedDiscount(purchasePriceKopecks, appliedPromo.discountPercent)
    : null;
  const effectivePriceKopecks = displayedDiscount?.finalAmountKopecks ?? purchasePriceKopecks;
  const effectivePrice = formatPrice(effectivePriceKopecks);
  const purchasePrice = formatPrice(purchasePriceKopecks);
  const effectiveMonthlyPrice = formatPrice(
    Math.round((effectivePriceKopecks / Math.max(1, durationDays)) * 30),
  );
  const variableDeviceLimit = !isPromoPlan && normalizedMaxDeviceLimit > deviceLimit;
  const lowersCurrentLimit = Boolean(
    currentDeviceLimit && selectedDeviceLimit < currentDeviceLimit,
  );
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
  const autoRenewalSupported = selectedProvider === "YOOKASSA";

  function selectDeviceLimit(value: number) {
    const nextValue = clampDeviceLimit(value, deviceLimit, normalizedMaxDeviceLimit);
    setSelectedDeviceLimit(nextValue);
    setDeviceLimitInput(String(nextValue));
  }

  function commitDeviceLimitInput() {
    selectDeviceLimit(Number(deviceLimitInput));
  }

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
    const checkoutFingerprint = isPromoPlan
      ? `${id}:LOCAL`
      : `${id}:${selectedDeviceLimit}:${selectedProvider}:${appliedPromo?.code ?? ""}:${autoRenewalRequested ? "AUTO" : "MANUAL"}`;
    if (checkoutAttemptRef.current?.fingerprint !== checkoutFingerprint) {
      checkoutAttemptRef.current = {
        key: crypto.randomUUID(),
        fingerprint: checkoutFingerprint,
      };
    }
    const idempotencyKey = checkoutAttemptRef.current.key;

    if (isPromoPlan) {
      setLoading(true);
      try {
        const { redirectUrl } = await apiFetch<{ redirectUrl?: string }>(
          "/api/payment/create",
          {
            method: "POST",
            body: JSON.stringify({ planId: id, idempotencyKey }),
          },
        );
        window.location.href = redirectUrl || "/dashboard/subscription";
      } catch (error) {
        resetFailedCheckoutAttempt(error);
        redirectToRequiredAction(error);
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
          deviceLimit: selectedDeviceLimit,
          provider: selectedProvider,
          idempotencyKey,
          ...(autoRenewalRequested
            ? {
                autoRenewalConsent: true,
                autoRenewalConsentVersion: AUTO_RENEWAL_CONSENT_VERSION,
              }
            : {}),
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
    } catch (error) {
      resetFailedCheckoutAttempt(error);
      redirectToRequiredAction(error);
    } finally {
      setLoading(false);
    }
  }

  function openCheckoutConfirmation() {
    if (promoCodesEnabled && trimmedPromo && !appliedPromo) {
      toast("Сначала примените промокод или очистите поле");
      return;
    }
    if (paymentProviders.length === 0) {
      toast("Оплата временно недоступна");
      return;
    }
    setAutoRenewalRequested(false);
    setCheckoutConfirmOpen(true);
  }

  function resetFailedCheckoutAttempt(error: unknown) {
    if (
      error instanceof Error
      && "data" in error
      && typeof error.data === "object"
      && error.data !== null
      && "code" in error.data
      && (
        error.data.code === "PAYMENT_PROVIDER_CREATE_FAILED"
        || error.data.code === "PAYMENT_ATTEMPT_CANCELED"
      )
    ) {
      checkoutAttemptRef.current = null;
    }
  }

  function redirectToRequiredAction(error: unknown) {
    if (
      error instanceof Error
      && "data" in error
      && typeof error.data === "object"
      && error.data !== null
      && "code" in error.data
      && error.data.code === "EMAIL_VERIFICATION_REQUIRED"
      && "actionHref" in error.data
      && typeof error.data.actionHref === "string"
    ) {
      window.location.href = error.data.actionHref;
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
        body: JSON.stringify({ planId: id, deviceLimit: selectedDeviceLimit, promoCode: trimmedPromo }),
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
    <>
    <div
      data-testid="plan-card"
      data-display={display}
      className={cn(
        "plan-checkout-card relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-4 dark:border-white/[0.09] dark:bg-white/[0.025] sm:p-5",
        checkoutDisplay && "overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none dark:border-0 dark:bg-transparent sm:p-0",
        !checkoutDisplay && popular && "border-brand-300/80 dark:border-brand-400/35",
        !checkoutDisplay && current && "border-brand-300/80 bg-brand-50/45 dark:border-brand-400/35 dark:bg-brand-500/[0.06]",
        !checkoutDisplay && isPromoPlan && "border-emerald-200/80 dark:border-emerald-400/25",
      )}
    >
      {!checkoutDisplay && (popular || current || isPromoPlan) && (
        <span
          className={cn(
            "absolute inset-x-0 top-0 h-0.5",
            current || popular ? "bg-brand-500" : "bg-emerald-400",
          )}
          aria-hidden="true"
        />
      )}

      {checkoutDisplay ? (
        <div className="plan-checkout-summary rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/[0.08] dark:bg-white/[0.035]">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Вы выбрали</span>
              <h3 className="mt-1 truncate text-lg font-semibold tracking-[-0.025em] text-slate-950 dark:text-white">
                {name}
              </h3>
            </div>
            {savingsPercent > 0 && !isPromoPlan ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                <BadgePercent className="h-3.5 w-3.5" />
                −{savingsPercent}%
              </span>
            ) : null}
          </div>
          <div className="mt-5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <div className="whitespace-nowrap text-[2rem] font-semibold leading-none tracking-[-0.04em] tabular-nums text-slate-950 dark:text-white">
                  {effectivePrice}
                </div>
                {appliedPromo && <div className="text-sm text-slate-400 line-through">{purchasePrice}</div>}
              </div>
              <span className="mt-1.5 block text-[11px] text-slate-500 dark:text-slate-400">
                {isPromo ? "Один раз на аккаунт" : "Итоговая сумма"}
              </span>
            </div>
            <div className="shrink-0 text-right">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">{durationDays} дн.</span>
              <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                {isPromo ? "бесплатно" : `${effectiveMonthlyPrice} / 30 дней`}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-slate-200",
                  (current || popular) && "border-brand-300 text-brand-700 dark:border-brand-400/35 dark:text-brand-200",
                  isPromoPlan && "border-emerald-300 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-200",
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
              <span className="badge-active shrink-0 gap-1.5 ring-1 ring-inset ring-emerald-200/70 dark:ring-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Ваш тариф
              </span>
            ) : isPromo ? (
              <span className="badge shrink-0 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/70 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
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

          <div className="plan-price-panel mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <div className="whitespace-nowrap text-[2rem] font-semibold leading-none tracking-[-0.04em] tabular-nums text-slate-950 dark:text-white sm:text-4xl">
                  {effectivePrice}
                </div>
                {appliedPromo && <div className="text-sm text-slate-400 line-through">{purchasePrice}</div>}
              </div>
              {savingsPercent > 0 && !isPromoPlan ? (
                <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-100/80 px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
                  <BadgePercent className="h-3.5 w-3.5" />
                  -{savingsPercent}%
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span>{isPromo ? "Один раз на аккаунт" : `${effectiveMonthlyPrice} за 30 дней`}</span>
              <span>за весь срок</span>
            </div>
          </div>
        </>
      )}

      {!checkoutDisplay ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <PlanFact icon={<CalendarDays className="h-4 w-4" />} label="Срок" value={`${durationDays} дн.`} />
          <PlanFact
            icon={<Gauge className="h-4 w-4" />}
            label="Трафик"
            value={trafficLimitGb == null ? "Безлимит" : `${trafficLimitGb} ГБ`}
          />
          <PlanFact
            icon={<MonitorSmartphone className="h-4 w-4" />}
            label="Устройства"
            value={variableDeviceLimit ? `${deviceLimit}–${normalizedMaxDeviceLimit}` : `До ${deviceLimit}`}
          />
        </div>
      ) : null}

      {variableDeviceLimit ? (
        <section className="mt-3 rounded-2xl border border-brand-200/80 bg-brand-50/55 p-3.5 dark:border-brand-400/20 dark:bg-brand-500/[0.07]" aria-label="Количество устройств">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Количество устройств</div>
              <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Включено {deviceLimit}, далее +{formatPrice(extraDevicePriceKopecks)} за устройство на весь срок
              </div>
            </div>
            <span className="rounded-md bg-white px-2 py-1 font-mono text-xs font-semibold tabular-nums text-brand-700 ring-1 ring-brand-200 dark:bg-white/[0.06] dark:text-brand-200 dark:ring-brand-400/20">
              {selectedDeviceLimit}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-[2.75rem_minmax(4rem,1fr)_2.75rem] items-center gap-2">
            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200"
              onClick={() => selectDeviceLimit(selectedDeviceLimit - 1)}
              disabled={selectedDeviceLimit <= deviceLimit}
              aria-label="Уменьшить количество устройств"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={deviceLimit}
              max={normalizedMaxDeviceLimit}
              value={deviceLimitInput}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const rawValue = event.target.value.replace(/\D/g, '');
                setDeviceLimitInput(rawValue);
                const value = Number(rawValue);
                if (
                  Number.isInteger(value)
                  && value >= deviceLimit
                  && value <= normalizedMaxDeviceLimit
                ) {
                  setSelectedDeviceLimit(value);
                }
              }}
              onBlur={commitDeviceLimitInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  commitDeviceLimitInput();
                  event.currentTarget.blur();
                }
              }}
              className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-center text-lg font-semibold tabular-nums text-slate-950 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200/70 dark:border-white/10 dark:bg-surface-900 dark:text-white dark:focus:ring-brand-400/20"
              aria-label={`Количество устройств, от ${deviceLimit} до ${normalizedMaxDeviceLimit}`}
            />
            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-35 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200"
              onClick={() => selectDeviceLimit(selectedDeviceLimit + 1)}
              disabled={selectedDeviceLimit >= normalizedMaxDeviceLimit}
              aria-label="Увеличить количество устройств"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 border-t border-brand-200/70 pt-2.5 text-xs dark:border-brand-400/15">
            <span className="text-slate-500 dark:text-slate-400">
              {extraDeviceCount > 0
                ? `${price} + ${formatPrice(extraDeviceAmountKopecks)} за ${extraDeviceCount} доп.`
                : 'Дополнительных устройств нет'}
            </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{purchasePrice}</span>
          </div>

          {lowersCurrentLimit ? (
            <p className="mt-2.5 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 ring-1 ring-amber-200/70 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-400/20">
              После оплаты останутся {selectedDeviceLimit} устройств с самой недавней активностью. Остальные привязки будут удалены.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className={cn("mt-auto", checkoutDisplay ? "pt-3" : "pt-4")}>
        {!isPromoPlan && promoCodesEnabled && (promoOpen || appliedPromo) ? (
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/15">
                  <Tag className="h-3.5 w-3.5" />
                </span>
                Промокод
              </span>
              {appliedPromo ? (
                <span className="rounded-sm bg-emerald-100/80 px-2 py-1 font-mono text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
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
              <div className="flex min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm dark:border-white/10 dark:bg-surface-900">
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
              <div className="mt-2.5 flex items-center justify-between gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                <span>Экономия {formatPrice(displayedDiscount?.discountKopecks ?? appliedPromo.discountKopecks)}</span>
                {suggestedPromoCodes.length > 0 && !manualPromoOpen ? (
                  <button type="button" className="rounded-lg px-2 py-1 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 dark:hover:bg-white/[0.06] dark:hover:text-white" onClick={resetPromo}>
                    Другой код
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : !isPromoPlan && promoCodesEnabled ? (
          <button
            type="button"
            className={cn(
              "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-600 transition-colors hover:text-brand-800 dark:text-slate-300 dark:hover:text-brand-100",
              checkoutDisplay
                ? "bg-slate-100/70 hover:bg-slate-100 dark:bg-white/[0.035] dark:hover:bg-white/[0.06]"
                : "border border-slate-200/80 bg-transparent hover:border-brand-300 dark:border-white/[0.08] dark:hover:border-brand-400/25",
            )}
            onClick={openPromoBlock}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/15">
                <Tag className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold text-slate-700 dark:text-slate-200">
                  {bestPromo ? `Скидка ${bestPromo.discountPercent}% доступна` : "Промокод"}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-400">
                  {bestPromo ? "Применить к этому тарифу" : "Добавить перед оплатой"}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-300">
              {bestPromo ? "Применить" : "Добавить"}
            </span>
          </button>
        ) : null}

        {!isPromoPlan && paymentProviders.length > 1 ? (
          <fieldset
            className={cn(
              "mt-3",
              checkoutDisplay ? "border-0 p-0" : "rounded-2xl border border-slate-200/80 p-3 dark:border-white/[0.08]",
            )}
          >
            <legend className={cn("text-xs font-medium text-slate-500 dark:text-slate-400", checkoutDisplay ? "mb-2 px-0" : "px-1")}>
              Способ оплаты
            </legend>
            <div
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Способ оплаты"
            >
              {paymentProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedProvider === provider.id}
                  onClick={() => {
                    setSelectedProvider(provider.id);
                    if (provider.id !== "YOOKASSA") setAutoRenewalRequested(false);
                  }}
                  className={cn(
                    "plan-payment-provider flex min-h-[3.75rem] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                    selectedProvider === provider.id
                      ? "border-brand-300 bg-brand-50/70 text-slate-950 dark:border-brand-400/35 dark:bg-brand-500/10 dark:text-white"
                      : "border-slate-200 bg-white/70 text-slate-700 hover:border-slate-300 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.025] dark:text-slate-300 dark:hover:border-white/15 dark:hover:bg-white/[0.045]",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-[10px]",
                      selectedProvider === provider.id
                        ? "bg-brand-500 text-white"
                        : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400",
                    )}
                  >
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{provider.label}</span>
                    <span className="mt-0.5 block text-[10px] font-normal text-slate-400 dark:text-slate-500">Безопасный переход</span>
                  </span>
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                      selectedProvider === provider.id
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-slate-300 text-transparent dark:border-white/15",
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 px-1 text-[10px] leading-4 text-slate-400 dark:text-slate-500">
              {paymentProviderHint(selectedProvider)}
            </p>
          </fieldset>
        ) : !isPromoPlan && paymentProviders.length === 1 ? (
          <div
            className={cn(
              "plan-payment-provider mt-3 flex min-h-[3.75rem] items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400",
              checkoutDisplay
                ? "bg-slate-100/70 dark:bg-white/[0.035]"
                : "border border-slate-200/80 dark:border-white/[0.08]",
            )}
          >
            <span className="inline-flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-slate-400" />
              <span>
                <span className="block font-medium text-slate-600 dark:text-slate-300">Способ оплаты</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">
                  {paymentProviderHint(paymentProviders[0]!.id)}
                </span>
              </span>
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">{paymentProviders[0]?.label}</span>
          </div>
        ) : null}

        {!isPromoPlan && paymentProviders.length === 0 ? (
          <div className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2.5 text-center text-xs text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/15">
            Оплата временно недоступна
          </div>
        ) : null}

        {!isPromoPlan && checkoutDisplay ? (
          <div className="mt-3">
            <AutoRenewalChoice
              enabled={autoRenewalEnabled}
              supported={autoRenewalSupported}
              requested={autoRenewalRequested}
              price={effectivePrice}
              durationDays={durationDays}
              onChange={setAutoRenewalRequested}
            />
          </div>
        ) : null}

        <div
          className={cn(
            checkoutDisplay
              ? "sticky bottom-0 z-20 -mx-4 mt-3 border-t border-slate-200/80 bg-white/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur dark:border-white/[0.08] dark:bg-surface-950/95 sm:-mx-5 sm:px-5 sm:pb-4"
              : "mt-3",
          )}
        >
          <button
            type="button"
            onClick={isPromoPlan || checkoutDisplay ? buy : openCheckoutConfirmation}
            disabled={loading || (!isPromoPlan && paymentProviders.length === 0)}
            className="plan-payment-cta btn-primary group min-h-12 w-full justify-between px-4"
          >
            <span className="inline-flex items-center gap-2">
              {isPromoPlan ? <Sparkles className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
              {loading
                ? isPromoPlan
                  ? "Активируем..."
                  : "Создаём платёж..."
                : isPromoPlan
                  ? "Активировать бесплатно"
                  : current
                    ? "Продлить тариф"
                    : "Перейти к оплате"}
            </span>
            <span className="inline-flex shrink-0 items-center gap-2">
              {!loading && !isPromoPlan ? <span className="tabular-nums">{effectivePrice}</span> : null}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>
      </div>
    </div>
    <Modal
      open={checkoutConfirmOpen}
      title="Подтвердите оплату"
      description="Проверьте заказ и выберите, нужно ли продлевать доступ автоматически"
      panelClassName="sm:max-w-[34rem]"
      onClose={() => {
        if (!loading) setCheckoutConfirmOpen(false);
      }}
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" disabled={loading} onClick={() => setCheckoutConfirmOpen(false)}>
            Назад
          </button>
          <button type="button" className="btn-primary min-w-[12rem] justify-between" disabled={loading} onClick={() => void buy()}>
            <span>{loading ? "Создаём платёж..." : "Оплатить"}</span>
            <span className="tabular-nums">{effectivePrice}</span>
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.035]">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-950 dark:text-white">{name}</div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{durationDays} дней · {paymentProviders.find((provider) => provider.id === selectedProvider)?.label}</div>
          </div>
          <div className="shrink-0 text-lg font-semibold tabular-nums text-slate-950 dark:text-white">{effectivePrice}</div>
        </div>

        <AutoRenewalChoice
          enabled={autoRenewalEnabled}
          supported={autoRenewalSupported}
          requested={autoRenewalRequested}
          price={effectivePrice}
          durationDays={durationDays}
          onChange={setAutoRenewalRequested}
        />
      </div>
    </Modal>
    </>
  );
}

function paymentProviderHint(provider: CheckoutPaymentProvider) {
  if (provider === "PLATEGA") return "Выбор метода продолжится на защищённой странице Platega";
  if (provider === "PAYANYWAY") return "Оплата продолжится на защищённой форме PayAnyWay";
  return "Оплата продолжится на защищённой странице ЮKassa";
}

function AutoRenewalChoice({
  enabled,
  supported,
  requested,
  price,
  durationDays,
  onChange,
}: {
  enabled: boolean;
  supported: boolean;
  requested: boolean;
  price: string;
  durationDays: number;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4",
      enabled
        ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06]"
        : "border-slate-200 bg-white dark:border-white/[0.09] dark:bg-white/[0.02]",
    )}>
      <div className="flex items-start gap-3">
        <span className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
          enabled || requested
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
            : "bg-brand-500/10 text-brand-600 dark:text-brand-300",
        )}>
          <RefreshCw className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-950 dark:text-white">Автопродление</div>
          {enabled ? (
            <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">
              Уже включено для этого тарифа. Следующее списание будет выполнено перед окончанием доступа.
            </p>
          ) : supported ? (
            <Checkbox
              className="mt-2"
              checked={requested}
              onChange={(event) => onChange(event.target.checked)}
              label={`Продлевать автоматически за ${price}`}
              description={`Регулярное списание раз в ${durationDays} дней. Отключить можно в любой момент.`}
            />
          ) : (
            <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
              Доступно при оплате банковской картой через ЮKassa. Выберите этот способ оплаты выше.
            </p>
          )}
        </div>
      </div>
      {!enabled && requested ? (
        <p className="mt-3 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500 dark:border-white/[0.08] dark:text-slate-400">
          Нажимая «Оплатить», вы соглашаетесь на регулярные списания по условиям
          {" "}<Link href="/offer" target="_blank" rel="noreferrer" className="font-semibold text-brand-600 hover:underline dark:text-brand-300">оферты</Link>.
        </p>
      ) : null}
    </div>
  );
}

function PlanFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="plan-fact min-w-0 rounded-xl border border-slate-200/70 bg-slate-50/70 px-2.5 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.025]">
      <div className="mb-2 text-brand-600 dark:text-brand-300">{icon}</div>
      <div className="break-words text-sm font-semibold leading-tight tabular-nums text-slate-900 dark:text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function clampDeviceLimit(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function calculateDisplayedDiscount(amountKopecks: number, discountPercent: number) {
  const rawDiscount = Math.floor((amountKopecks * discountPercent) / 100);
  const discountKopecks = Math.min(rawDiscount, Math.max(0, amountKopecks - 100));
  return {
    discountKopecks,
    finalAmountKopecks: amountKopecks - discountKopecks,
  };
}
