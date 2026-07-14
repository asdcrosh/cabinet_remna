import type { BonusBoxPrizeView, Rarity } from "@/components/bonus-box/bonus-box-types";

export const DESKTOP_CARD_WIDTH = 184;
export const MOBILE_CARD_WIDTH = 138;
export const DESKTOP_CARD_GAP = 14;
export const MOBILE_CARD_GAP = 12;

export const OPENING_EFFECT_PARTICLES = [
  { x: 7, delay: 0, size: 3, drift: -22, duration: 1700 },
  { x: 13, delay: 180, size: 5, drift: 30, duration: 1900 },
  { x: 19, delay: 320, size: 2, drift: -16, duration: 1600 },
  { x: 26, delay: 80, size: 4, drift: 18, duration: 2100 },
  { x: 32, delay: 430, size: 3, drift: -34, duration: 1800 },
  { x: 39, delay: 220, size: 6, drift: 26, duration: 2300 },
  { x: 45, delay: 540, size: 3, drift: -20, duration: 1700 },
  { x: 50, delay: 120, size: 7, drift: 0, duration: 2200 },
  { x: 56, delay: 360, size: 3, drift: 24, duration: 1650 },
  { x: 62, delay: 60, size: 5, drift: -28, duration: 2050 },
  { x: 69, delay: 480, size: 2, drift: 18, duration: 1750 },
  { x: 75, delay: 260, size: 4, drift: -18, duration: 2000 },
  { x: 82, delay: 640, size: 3, drift: 32, duration: 1850 },
  { x: 88, delay: 140, size: 5, drift: -26, duration: 2150 },
  { x: 94, delay: 520, size: 2, drift: 16, duration: 1600 },
] as const;

export function makeIdleReel(prizes: BonusBoxPrizeView[]) {
  if (prizes.length === 0) return [];
  return Array.from(
    { length: 40 },
    (_, index) => prizes[index % prizes.length],
  ).filter((prize): prize is BonusBoxPrizeView => Boolean(prize));
}

export function prizeLabel(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "Без начисления";
  if (prize.type === "SUBSCRIPTION_DAYS") return `+${prize.value} дн.`;
  if (prize.type === "TRAFFIC_GB") return `+${prize.value} ГБ`;
  if (prize.type === "BONUS_ATTEMPTS") return `+${prize.value} открытий`;
  return `-${prize.value}%`;
}

export function prizeRequiresSubscription(prize: BonusBoxPrizeView) {
  return prize.type === "SUBSCRIPTION_DAYS" || prize.type === "TRAFFIC_GB";
}

export function getDisabledCtaLabel(reason: string) {
  if (reason.includes("подписк")) return "Оформить подписку";
  if (reason.includes("Нет доступных")) return "Нет открытий";
  if (reason.includes("настро")) return "Подарки скоро";
  return "Недоступно";
}

export function rarityLabel(rarity: Rarity) {
  if (rarity === "LEGENDARY") return "Легенда";
  if (rarity === "EPIC") return "Эпик";
  if (rarity === "RARE") return "Редкий";
  return "База";
}

export function rarityClass(rarity: Rarity) {
  if (rarity === "LEGENDARY")
    return "rarity-shimmer bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-100";
  if (rarity === "EPIC")
    return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-100";
  if (rarity === "RARE")
    return "bg-cyan-100 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-100";
  return "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200";
}

export function prizeBorderClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "border-red-300 dark:border-red-500/60";
  return rarityBorderClass(prize.rarity);
}

function rarityBorderClass(rarity: Rarity) {
  if (rarity === "LEGENDARY")
    return "rarity-shimmer border-amber-200 dark:border-amber-500/40";
  if (rarity === "EPIC") return "border-fuchsia-200 dark:border-fuchsia-500/40";
  if (rarity === "RARE") return "border-cyan-200 dark:border-cyan-500/40";
  return "border-slate-200 dark:border-white/10";
}

export function prizeReelClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE")
    return "border-red-200 bg-red-50/80 dark:border-red-500/35 dark:bg-red-500/10";
  return rarityReelClass(prize.rarity);
}

function rarityReelClass(rarity: Rarity) {
  if (rarity === "LEGENDARY")
    return "rarity-shimmer border-amber-200 bg-amber-50/80 dark:border-amber-500/35 dark:bg-amber-500/10";
  if (rarity === "EPIC")
    return "border-fuchsia-200 bg-fuchsia-50/80 dark:border-fuchsia-500/35 dark:bg-fuchsia-500/10";
  if (rarity === "RARE")
    return "border-cyan-200 bg-cyan-50/80 dark:border-cyan-500/35 dark:bg-cyan-500/10";
  return "border-slate-200 bg-slate-50/90 dark:border-white/10 dark:bg-white/[0.04]";
}

export function bonusBoxRevealClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "bonus-box-stage--reveal-empty";
  if (prize.rarity === "LEGENDARY") return "bonus-box-stage--reveal-legendary";
  if (prize.rarity === "EPIC") return "bonus-box-stage--reveal-epic";
  if (prize.rarity === "RARE") return "bonus-box-stage--reveal-rare";
  return "bonus-box-stage--reveal-common";
}

export function bonusBoxResultClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "bonus-box-result--empty";
  if (prize.rarity === "LEGENDARY") return "bonus-box-result--legendary";
  if (prize.rarity === "EPIC") return "bonus-box-result--epic";
  if (prize.rarity === "RARE") return "bonus-box-result--rare";
  return "bonus-box-result--common";
}

export function prizeTopClass(prize: BonusBoxPrizeView) {
  if (prize.type === "NO_PRIZE") return "bg-red-500";
  return rarityTopClass(prize.rarity);
}

function rarityTopClass(rarity: Rarity) {
  if (rarity === "LEGENDARY") return "bg-amber-400";
  if (rarity === "EPIC") return "bg-fuchsia-400";
  if (rarity === "RARE") return "bg-cyan-400";
  return "bg-slate-400";
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateOnly(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function weekdayLabel(day: number) {
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
