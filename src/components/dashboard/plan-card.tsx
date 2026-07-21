"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { CheckoutPaymentProvider } from "@/lib/payment-providers";
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
  monthlyPrice,
  savingsPercent,
  durationDays,
  trafficLimitGb,
  deviceLimit,
  isPromo = false,
  promoCodesEnabled = true,
  popular,
  current,
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
  const [selectedProvider, setSelectedProvider] = useState<CheckoutPaymentProvider>(
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
        "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/[0.025] dark:border-white/[0.09] dark:bg-white/[0.035] dark:shadow-none sm:p-5",
        checkoutDisplay && "rounded-none border-0 bg-transparent p-0 shadow-none dark:border-0 dark:bg-transparent sm:p-0",
        !checkoutDisplay && popular && "border-cyan-300/80 dark:border-cyan-400/35",
        !checkoutDisplay && current && "border-cyan-300/80 bg-cyan-50/45 shadow-cyan-950/[0.04] dark:border-cyan-400/35 dark:bg-cyan-500/[0.06]",
        !checkoutDisplay && isPromoPlan && "border-emerald-200/80 dark:border-emerald-400/25",
      )}
    >
      {!checkoutDisplay && (popular || current || isPromoPlan) && (
        <span
          className={cn(
            "absolute inset-x-7 top-0 h-0.5 rounded-b-full",
            current || popular ? "bg-cyan-400" : "bg-emerald-400",
          )}
          aria-hidden="true"
        />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600 ring-1 ring-slate-200/70 dark:bg-white/[0.06] dark:text-slate-200 dark:ring-white/[0.08]",
              (current || popular) && "bg-cyan-50 text-cyan-700 ring-cyan-200/70 dark:bg-cyan-400/10 dark:text-cyan-200 dark:ring-cyan-400/15",
              isPromoPlan && "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/15",
            )}
          >
            {isPromoPlan ? <Sparkles className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <div className="min-w-0 pt-0.5">
            <h3 className="break-words text-lg font-semibold leading-tight tracking-[-0.02em] text-slate-950 dark:text-white sm:text-xl">
              {name}
            </h3>
            {description && !checkoutDisplay && (
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

      <div className={cn("rounded-[1.35rem] bg-slate-50/80 p-4 ring-1 ring-slate-200/70 dark:bg-white/[0.035] dark:ring-white/[0.08]", checkoutDisplay ? "mt-4" : "mt-5")}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <div className="whitespace-nowrap text-[2rem] font-semibold leading-none tracking-[-0.04em] tabular-nums text-slate-950 dark:text-white sm:text-4xl">
              {effectivePrice}
            </div>
            {appliedPromo && (
              <div className="text-sm text-slate-400 line-through">{price}</div>
            )}
          </div>
          {savingsPercent > 0 && !isPromoPlan ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">
              <BadgePercent className="h-3.5 w-3.5" />
              -{savingsPercent}%
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span>{isPromo ? "Один раз на аккаунт" : `${monthlyPrice} за 30 дней`}</span>
          <span>за весь срок</span>
        </div>
      </div>

      {!checkoutDisplay ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <PlanFact icon={<CalendarDays className="h-4 w-4" />} label="Срок" value={`${durationDays} дн.`} />
          <PlanFact
            icon={<Gauge className="h-4 w-4" />}
            label="Трафик"
            value={trafficLimitGb == null ? "Безлимит" : `${trafficLimitGb} ГБ`}
          />
          <PlanFact icon={<MonitorSmartphone className="h-4 w-4" />} label="Устройства" value={`До ${deviceLimit}`} />
        </div>
      ) : null}

      <div className="mt-auto pt-4">
        {!isPromoPlan && promoCodesEnabled && (promoOpen || appliedPromo) ? (
          <div className="rounded-[1.25rem] border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-cyan-600 shadow-sm ring-1 ring-slate-200/70 dark:bg-white/[0.05] dark:text-cyan-300 dark:ring-white/[0.08]">
                  <Tag className="h-3.5 w-3.5" />
                </span>
                Промокод
              </span>
              {appliedPromo ? (
                <span className="rounded-full bg-emerald-100/80 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
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
                <span>Экономия {formatPrice(appliedPromo.discountKopecks)}</span>
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
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[1.15rem] bg-slate-50/80 px-3.5 py-2.5 text-left text-sm text-slate-600 ring-1 ring-slate-200/70 transition-colors hover:bg-cyan-50 hover:text-cyan-800 hover:ring-cyan-200 dark:bg-white/[0.035] dark:text-slate-300 dark:ring-white/[0.08] dark:hover:bg-cyan-400/[0.06] dark:hover:text-cyan-100 dark:hover:ring-cyan-400/20"
            onClick={openPromoBlock}
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-cyan-600 shadow-sm ring-1 ring-slate-200/70 dark:bg-white/[0.05] dark:text-cyan-300 dark:ring-white/[0.08]">
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
            <span className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200/70 dark:bg-white/[0.05] dark:text-slate-300 dark:ring-white/[0.08]">
              {bestPromo ? "Применить" : "Добавить"}
            </span>
          </button>
        ) : null}

        {!isPromoPlan && paymentProviders.length > 1 ? (
          <fieldset className="mt-2.5 rounded-[1.15rem] border border-slate-200/80 p-3 dark:border-white/[0.08]">
            <legend className="px-1 text-xs font-medium text-slate-500 dark:text-slate-400">Способ оплаты</legend>
            <div
              className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]"
              role="radiogroup"
              aria-label="Способ оплаты"
            >
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
            <p className="mt-2 px-1 text-[11px] leading-4 text-slate-400 dark:text-slate-500">
              {paymentProviderHint(selectedProvider)}
            </p>
          </fieldset>
        ) : !isPromoPlan && paymentProviders.length === 1 ? (
          <div className="mt-2.5 flex min-h-12 items-center justify-between gap-3 rounded-[1.15rem] border border-slate-200/80 px-3.5 py-2 text-xs text-slate-500 dark:border-white/[0.08] dark:text-slate-400">
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
          <div className="mt-2.5 rounded-[1.15rem] bg-amber-50 px-3 py-2.5 text-center text-xs text-amber-700 ring-1 ring-amber-200/70 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/15">
            Оплата временно недоступна
          </div>
        ) : null}

        <button
          type="button"
          onClick={buy}
          disabled={loading || (!isPromoPlan && paymentProviders.length === 0)}
          className="btn-primary group mt-3 w-full min-h-12 justify-between px-4"
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
  );
}

function paymentProviderHint(provider: CheckoutPaymentProvider) {
  if (provider === "PLATEGA") return "Выбор метода продолжится на защищённой странице Platega";
  if (provider === "PAYANYWAY") return "Оплата продолжится на защищённой форме PayAnyWay";
  return "Оплата продолжится на защищённой странице ЮKassa";
}

function PlanFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50/80 px-2.5 py-3 ring-1 ring-slate-200/60 dark:bg-white/[0.035] dark:ring-white/[0.07]">
      <div className="mb-2 text-slate-400 dark:text-slate-500">{icon}</div>
      <div className="break-words text-sm font-semibold leading-tight tabular-nums text-slate-900 dark:text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-tight text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}
