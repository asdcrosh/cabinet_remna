"use client";

import { useState } from "react";
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
  durationDays: number;
  trafficLimitGb: number | null;
  deviceLimit: number;
  isPromo?: boolean;
  popular?: boolean;
  current?: boolean;
  availablePromoCodes?: Array<{
    code: string;
    discountPercent: number;
    discountKopecks: number;
    finalAmountKopecks: number;
    source: "BONUS_BOX" | "WELCOME";
  }>;
}

export function PlanCard({
  id,
  name,
  description,
  price,
  durationDays,
  trafficLimitGb,
  deviceLimit,
  isPromo = false,
  popular,
  current,
  availablePromoCodes = [],
}: PlanCardProps) {
  const [loading, setLoading] = useState(false);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountPercent: number;
    discountKopecks: number;
    finalAmountKopecks: number;
  } | null>(null);

  const trimmedPromo = promoInput.trim();
  const effectivePrice = appliedPromo
    ? formatPrice(appliedPromo.finalAmountKopecks)
    : price;
  const suggestedPromoCodes = [...availablePromoCodes]
    .sort((a, b) => {
      if (b.discountKopecks !== a.discountKopecks) return b.discountKopecks - a.discountKopecks;
      return b.discountPercent - a.discountPercent;
    })
    .slice(0, 3);

  async function buy() {
    if (isPromo) {
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
      toast("Промокод применён", "success");
    } catch {
      setAppliedPromo(null);
    } finally {
      setValidatingPromo(false);
    }
  }

  function selectAwardedPromo(promo: NonNullable<PlanCardProps["availablePromoCodes"]>[number]) {
    setPromoOpen(true);
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
      {!isPromo && (promoOpen || appliedPromo) ? (
        <div className="mt-auto space-y-2 pt-3">
          {suggestedPromoCodes.length > 0 ? (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {suggestedPromoCodes.map((promo) => (
                <button
                  key={promo.code}
                  type="button"
                  className={cn(
                    "min-w-fit rounded-full border px-2.5 py-1.5 text-left text-xs font-medium transition",
                    appliedPromo?.code === promo.code
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-surface-900 dark:text-slate-300 dark:hover:bg-surface-800"
                  )}
                  onClick={() => selectAwardedPromo(promo)}
                >
                  {promo.code} · -{promo.discountPercent}%
                </button>
              ))}
            </div>
          ) : (
            <a
              href="/dashboard/bonus-box"
              className="flex items-center justify-between gap-3 rounded-lg border border-cyan-100 bg-cyan-50/70 px-3 py-2 text-sm font-medium text-cyan-800 transition hover:bg-cyan-50 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-100"
            >
              <span>Промокод можно выбить в разделе “Бонусы”</span>
              <Sparkles className="h-4 w-4 shrink-0" />
            </a>
          )}
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
          {appliedPromo && (
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-300">
              Скидка {appliedPromo.discountPercent}%: -
              {formatPrice(appliedPromo.discountKopecks)}
            </div>
          )}
        </div>
      ) : !isPromo ? (
        <button
          type="button"
          className="mt-auto inline-flex w-fit items-center gap-2 pt-3 text-sm font-medium text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
          onClick={() => setPromoOpen(true)}
        >
          <Tag className="h-4 w-4" />
          {suggestedPromoCodes.length > 0 ? "Выбрать промокод" : "Есть промокод?"}
        </button>
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
          ? isPromo
            ? "Активируем..."
            : "Создаём платёж..."
          : isPromo
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
