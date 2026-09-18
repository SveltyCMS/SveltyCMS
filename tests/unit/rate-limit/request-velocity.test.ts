/**
 * @file tests/unit/rate-limit/request-velocity.test.ts
 * @description Observation-zone token tax from inter-arrival EMA.
 */

import { afterEach, describe, expect, it } from "vitest";
import { velocityCostMultiplier, _resetRequestVelocity } from "@utils/rate-limit/request-velocity";

afterEach(() => {
  _resetRequestVelocity();
});

describe("velocityCostMultiplier", () => {
  it("returns 1 on the first sample", () => {
    expect(velocityCostMultiplier("k", 1_000)).toBe(1);
  });

  it("returns 1 for an empty key", () => {
    expect(velocityCostMultiplier("", 1_000)).toBe(1);
  });

  it("stays at 1 for human-paced mutations (~2 rps)", () => {
    let t = 0;
    expect(velocityCostMultiplier("k", t)).toBe(1);
    for (let i = 0; i < 20; i++) {
      t += 500;
      expect(velocityCostMultiplier("k", t)).toBe(1);
    }
  });

  it("does not tax a short burst under the observation window", () => {
    let t = 1_000;
    velocityCostMultiplier("bot", t);
    for (let i = 0; i < 6; i++) {
      t += 10;
      expect(velocityCostMultiplier("bot", t)).toBe(1);
    }
  });

  it("raises cost after a sustained burst above 20 rps", () => {
    velocityCostMultiplier("bot", 0);
    let last = 1;
    for (let i = 0; i < 40; i++) {
      last = velocityCostMultiplier("bot", 2_000 + i * 10); // 100 rps after 2s warmup
    }
    expect(last).toBeGreaterThanOrEqual(2);
  });
});
