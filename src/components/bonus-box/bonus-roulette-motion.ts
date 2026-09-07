export const ROULETTE_SPIN_DURATION_MS = 4600;

export type RouletteMotionPhase = "launch" | "cruise" | "anticipation" | "locking";

export function rouletteTargetOffset({
  viewportWidth,
  itemWidth,
  gap,
  winningIndex,
  stopOffsetRatio,
}: {
  viewportWidth: number;
  itemWidth: number;
  gap: number;
  winningIndex: number;
  stopOffsetRatio: number;
}) {
  const safeOffsetRatio = Math.min(0.8, Math.max(0.2, stopOffsetRatio));
  const itemStep = itemWidth + gap;
  const stopPoint = winningIndex * itemStep + itemWidth * safeOffsetRatio;
  return viewportWidth / 2 - stopPoint;
}

export function rouletteActiveIndex({
  offset,
  viewportWidth,
  itemWidth,
  gap,
  itemCount,
}: {
  offset: number;
  viewportWidth: number;
  itemWidth: number;
  gap: number;
  itemCount: number;
}) {
  if (itemCount <= 0) return 0;
  const itemStep = itemWidth + gap;
  const index = Math.round((viewportWidth / 2 - offset - itemWidth / 2) / itemStep);
  return Math.min(itemCount - 1, Math.max(0, index));
}

export function rouletteProgress(elapsedMs: number) {
  const progress = Math.min(1, Math.max(0, elapsedMs / ROULETTE_SPIN_DURATION_MS));
  return 1 - Math.pow(1 - progress, 3.35);
}

export function rouletteMotionPhase(progress: number): RouletteMotionPhase {
  if (progress < 0.12) return "launch";
  if (progress < 0.62) return "cruise";
  if (progress < 0.92) return "anticipation";
  return "locking";
}

export function revealDelayMs(rarity: string, reducedMotion: boolean) {
  if (reducedMotion) return 180;
  if (rarity === "LEGENDARY") return 1150;
  if (rarity === "EPIC") return 850;
  if (rarity === "RARE") return 650;
  return 420;
}

export function revealParticleCount(rarity: string, isEmpty: boolean) {
  if (isEmpty) return 0;
  if (rarity === "LEGENDARY") return 30;
  if (rarity === "EPIC") return 24;
  if (rarity === "RARE") return 18;
  return 10;
}
