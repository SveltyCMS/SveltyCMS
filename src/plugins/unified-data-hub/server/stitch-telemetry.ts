/**
 * @file src/plugins/unified-data-hub/server/stitch-telemetry.ts
 * @description N+1 stitch risk telemetry for native→virtual enrichment and joins.
 *
 * Features:
 * - Soft warning threshold before hard budget cap
 * - Near-budget detection for API consumers and admin UI
 * - Shared telemetry shape for enrich + join paths
 */

import { MAX_JOIN_ROW_BUDGET } from "./virtual-join";

export const MAX_NATIVE_STITCH_KEYS = 100;

export type StitchWarningCode = "NONE" | "HIGH_KEY_COUNT" | "NEAR_BUDGET";

/** Warn when batch size may cause N+1 latency in list/table enrich paths */
export const STITCH_WARNING_THRESHOLD = 25;

export const NEAR_BUDGET_RATIO = 0.8;

export interface StitchTelemetry {
  stitchWarning: boolean;
  nearBudget: boolean;
  warningCode: StitchWarningCode;
  keyCount: number;
  budget: number;
  utilization: number;
  message?: string;
}

export function computeStitchTelemetry(
  keyCount: number,
  budget: number = MAX_NATIVE_STITCH_KEYS,
): StitchTelemetry {
  const utilization = budget > 0 ? keyCount / budget : 0;
  const nearBudget = utilization >= NEAR_BUDGET_RATIO;
  const stitchWarning = keyCount >= STITCH_WARNING_THRESHOLD || nearBudget;

  let warningCode: StitchWarningCode = "NONE";
  let message: string | undefined;

  if (nearBudget) {
    warningCode = "NEAR_BUDGET";
    message = `Stitch key count (${keyCount}) is near the budget cap (${budget}). Batch requests to avoid N+1 latency.`;
  } else if (keyCount >= STITCH_WARNING_THRESHOLD) {
    warningCode = "HIGH_KEY_COUNT";
    message = `Stitch key count (${keyCount}) exceeds recommended batch size (${STITCH_WARNING_THRESHOLD}). Consider pagination or caching.`;
  }

  return { stitchWarning, nearBudget, warningCode, keyCount, budget, utilization, message };
}

export function computeJoinTelemetry(keyCount: number): StitchTelemetry {
  return computeStitchTelemetry(keyCount, MAX_JOIN_ROW_BUDGET);
}
