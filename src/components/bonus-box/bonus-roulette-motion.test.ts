import { describe, expect, it } from "vitest";
import {
  revealDelayMs,
  revealParticleCount,
  rouletteActiveIndex,
  rouletteMotionPhase,
  rouletteProgress,
  rouletteTargetOffset,
} from "./bonus-roulette-motion";

describe("bonus roulette motion", () => {
  it("aligns the server winner with the center gate", () => {
    const offset = rouletteTargetOffset({
      viewportWidth: 900,
      itemWidth: 140,
      gap: 12,
      winningIndex: 73,
      stopOffsetRatio: 0.62,
    });

    expect(rouletteActiveIndex({
      offset,
      viewportWidth: 900,
      itemWidth: 140,
      gap: 12,
      itemCount: 88,
    })).toBe(73);
  });

  it("clamps an unsafe stop point inside the winning card", () => {
    const before = rouletteTargetOffset({ viewportWidth: 360, itemWidth: 112, gap: 8, winningIndex: 5, stopOffsetRatio: -2 });
    const after = rouletteTargetOffset({ viewportWidth: 360, itemWidth: 112, gap: 8, winningIndex: 5, stopOffsetRatio: 2 });

    expect(before).toBeLessThan(0);
    expect(after).toBeLessThan(before);
  });

  it("moves through the suspense phases and ends exactly at one", () => {
    expect(rouletteMotionPhase(0.05)).toBe("launch");
    expect(rouletteMotionPhase(0.3)).toBe("cruise");
    expect(rouletteMotionPhase(0.8)).toBe("anticipation");
    expect(rouletteMotionPhase(0.97)).toBe("locking");
    expect(rouletteProgress(0)).toBe(0);
    expect(rouletteProgress(4600)).toBe(1);
  });

  it("scales the reveal while keeping reduced motion short", () => {
    expect(revealDelayMs("LEGENDARY", false)).toBeGreaterThan(revealDelayMs("COMMON", false));
    expect(revealDelayMs("LEGENDARY", true)).toBeLessThanOrEqual(500);
    expect(revealParticleCount("COMMON", false)).toBe(10);
    expect(revealParticleCount("LEGENDARY", false)).toBe(30);
    expect(revealParticleCount("LEGENDARY", true)).toBe(0);
  });
});
