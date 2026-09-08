export const ROULETTE_SPIN_DURATION_MS = 5800;

const ACCELERATION_END = 0.18;
const CRUISE_END = 0.54;
const START_VELOCITY = 0.46;
const CRUISE_VELOCITY = 1.55;
const END_VELOCITY = 0;

const ACCELERATION_DISTANCE = smoothVelocityDistance(
  ACCELERATION_END,
  START_VELOCITY,
  CRUISE_VELOCITY,
);
const CRUISE_DISTANCE = (CRUISE_END - ACCELERATION_END) * CRUISE_VELOCITY;
const DECELERATION_DISTANCE = smoothVelocityDistance(
  1 - CRUISE_END,
  CRUISE_VELOCITY,
  END_VELOCITY,
);
const TOTAL_MOTION_DISTANCE = ACCELERATION_DISTANCE + CRUISE_DISTANCE + DECELERATION_DISTANCE;

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
  const time = Math.min(1, Math.max(0, elapsedMs / ROULETTE_SPIN_DURATION_MS));

  if (time <= ACCELERATION_END) {
    const segmentProgress = time / ACCELERATION_END;
    return smoothVelocityDistance(
      ACCELERATION_END,
      START_VELOCITY,
      CRUISE_VELOCITY,
      segmentProgress,
    ) / TOTAL_MOTION_DISTANCE;
  }

  if (time <= CRUISE_END) {
    const cruiseElapsed = time - ACCELERATION_END;
    return (ACCELERATION_DISTANCE + cruiseElapsed * CRUISE_VELOCITY) / TOTAL_MOTION_DISTANCE;
  }

  const segmentProgress = (time - CRUISE_END) / (1 - CRUISE_END);
  return (
    ACCELERATION_DISTANCE
    + CRUISE_DISTANCE
    + smoothVelocityDistance(
      1 - CRUISE_END,
      CRUISE_VELOCITY,
      END_VELOCITY,
      segmentProgress,
    )
  ) / TOTAL_MOTION_DISTANCE;
}

export function rouletteMotionPhase(progress: number): RouletteMotionPhase {
  if (progress < 0.17) return "launch";
  if (progress < 0.68) return "cruise";
  if (progress < 0.95) return "anticipation";
  return "locking";
}

function smoothVelocityDistance(
  duration: number,
  fromVelocity: number,
  toVelocity: number,
  progress = 1,
) {
  const safeProgress = Math.min(1, Math.max(0, progress));
  const integratedSmoothstep = safeProgress ** 3 - 0.5 * safeProgress ** 4;
  return duration * (
    fromVelocity * safeProgress
    + (toVelocity - fromVelocity) * integratedSmoothstep
  );
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
