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
    expect(rouletteProgress(5800)).toBe(1);
  });

  it("accelerates smoothly, cruises, and decelerates to rest", () => {
    const frame = 16;
    const speedAt = (elapsedMs: number) =>
      rouletteProgress(elapsedMs + frame) - rouletteProgress(elapsedMs);

    expect(speedAt(700)).toBeGreaterThan(speedAt(100));
    expect(speedAt(1800)).toBeCloseTo(speedAt(2600), 5);
    expect(speedAt(4000)).toBeLessThan(speedAt(3200));
    expect(speedAt(5000)).toBeLessThan(speedAt(4000));
    expect(speedAt(5784)).toBeLessThan(speedAt(5000));
    expect(speedAt(5784)).toBeGreaterThanOrEqual(0);
  });

  it("keeps position and velocity continuous at motion boundaries", () => {
    const frame = 1;
    const speedBefore = (elapsedMs: number) =>
      rouletteProgress(elapsedMs) - rouletteProgress(elapsedMs - frame);
    const speedAfter = (elapsedMs: number) =>
      rouletteProgress(elapsedMs + frame) - rouletteProgress(elapsedMs);

    expect(speedBefore(1044)).toBeCloseTo(speedAfter(1044), 5);
    expect(speedBefore(3132)).toBeCloseTo(speedAfter(3132), 5);
  });

  it("scales the reveal while keeping reduced motion short", () => {
    expect(revealDelayMs("LEGENDARY", false)).toBeGreaterThan(revealDelayMs("COMMON", false));
    expect(revealDelayMs("LEGENDARY", true)).toBeLessThanOrEqual(500);
    expect(revealParticleCount("COMMON", false)).toBe(10);
    expect(revealParticleCount("LEGENDARY", false)).toBe(30);
    expect(revealParticleCount("LEGENDARY", true)).toBe(0);
  });
});
