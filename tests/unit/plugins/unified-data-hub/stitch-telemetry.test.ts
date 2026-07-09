/**
 * @file tests/unit/plugins/unified-data-hub/stitch-telemetry.test.ts
 * @description N+1 stitch telemetry threshold tests.
 */

import { describe, expect, it } from "vitest";
import {
  computeJoinTelemetry,
  computeStitchTelemetry,
  STITCH_WARNING_THRESHOLD,
} from "@plugins/unified-data-hub/server/stitch-telemetry";
import { MAX_NATIVE_STITCH_KEYS } from "@plugins/unified-data-hub/server/stitch-telemetry";
import { MAX_JOIN_ROW_BUDGET } from "@plugins/unified-data-hub/server/virtual-join";

describe("stitch telemetry", () => {
  it("does not warn for small single-key enrich (entry preview)", () => {
    const t = computeStitchTelemetry(1);
    expect(t.stitchWarning).toBe(false);
    expect(t.warningCode).toBe("NONE");
  });

  it("warns at high key count threshold", () => {
    const t = computeStitchTelemetry(STITCH_WARNING_THRESHOLD);
    expect(t.stitchWarning).toBe(true);
    expect(t.warningCode).toBe("HIGH_KEY_COUNT");
    expect(t.message).toContain(String(STITCH_WARNING_THRESHOLD));
  });

  it("flags near-budget before hard cap", () => {
    const t = computeStitchTelemetry(Math.floor(MAX_NATIVE_STITCH_KEYS * 0.85));
    expect(t.nearBudget).toBe(true);
    expect(t.warningCode).toBe("NEAR_BUDGET");
  });

  it("join telemetry uses join budget", () => {
    const t = computeJoinTelemetry(Math.floor(MAX_JOIN_ROW_BUDGET * 0.85));
    expect(t.budget).toBe(MAX_JOIN_ROW_BUDGET);
    expect(t.nearBudget).toBe(true);
  });
});
