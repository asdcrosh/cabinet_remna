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

  function resetPromo() {
    setPromoInput("");
    setAppliedPromo(null);
  }

  return (
    <div
      className={cn(
        "card group relative flex h-full min-h-[380px] flex-col overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl sm:p-5",
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
          <h3 className="break-words text-lg font-semibold leading-tight tracking-tight sm:text-xl">
            {name}
          </h3>
          <div className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
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
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      )}
      <div className="mt-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <div className="whitespace-nowrap text-2xl font-semibold tracking-tight sm:text-3xl">
            {effectivePrice}
          </div>
          {appliedPromo && (
            <div className="text-sm text-slate-400 line-through">{price}</div>
          )}
        </div>
        <div className="text-sm text-slate-500">
          {isPromo ? "один раз на аккаунт" : "оплата онлайн"}
        </div>
      </div>
      <ul className="mt-4 min-h-[104px] space-y-2 text-sm text-slate-600 dark:text-slate-300">
        <Feature strong>
          {trafficLimitGb == null
            ? "Безлимитный трафик"
            : `${trafficLimitGb} ГБ трафика`}
        </Feature>
        <Feature>Доступ сразу после оплаты</Feature>
        <Feature>QR и ссылка подписки</Feature>
        <Feature>До {deviceLimit} устройств</Feature>
      </ul>
      {!isPromo && (promoOpen || appliedPromo) ? (
        <div className="mt-auto min-h-[74px] space-y-2 pt-3">
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-2 dark:border-slate-800 dark:bg-surface-900">
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
          className="mt-auto inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
          onClick={() => setPromoOpen(true)}
        >
          <Tag className="h-4 w-4" />
          Есть промокод?
        </button>
      ) : (
        <div className="mt-auto min-h-[74px]" />
      )}
      <button
        onClick={buy}
        disabled={loading}
        className="btn-primary mt-5 w-full"
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
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
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
