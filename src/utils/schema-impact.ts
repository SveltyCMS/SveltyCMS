/**
 * @file src/utils/schema-impact.ts
 * @description Schema change impact scoring for delta-detecting webhooks.
 *
 * Extends the `compareSchemas()` engine in `collection-schema-warnings.ts`
 * with a numeric impact model. Instead of firing a full site rebuild on every
 * schema edit, the dispatcher routes based on the cumulative impact score:
 *
 *   score > 50  → HEAVY_REBUILD (re-deploy, regenerate static assets)
 *   score ≤ 50  → LIGHT_NOTIFY (admin dashboard alert, audit log only)
 *
 * ### Weight model:
 * - field_removed (100): structural destruction, data loss
 * - type_changed  (70):  potential data corruption
 * - required_added (40): breaking API contracts for existing entries
 * - unique_added   (30):  index-level change, may cause conflicts
 * - default        (10):  descriptive / metadata-only changes
 *
 * @see collection-schema-warnings.ts for BreakingChange types
 */

import type { BreakingChange } from "./collection-schema-warnings";

// ─── Impact weights ────────────────────────────────────────────────────────

/** Maps breaking change types to structural impact scores (higher = more severe) */
export const IMPACT_WEIGHTS: Record<string, number> = {
  field_removed: 100,
  type_changed: 70,
  required_added: 40,
  unique_added: 30,
  field_renamed: 80,
  default: 10,
} as const;

// ─── Thresholds ────────────────────────────────────────────────────────────

/** Score above which a heavy rebuild is warranted */
export const HEAVY_REBUILD_THRESHOLD = 50;

/** Score below which only a notification is sent */
export const LIGHT_NOTIFY_THRESHOLD = 25;

// ─── Types ─────────────────────────────────────────────────────────────────

export type WebhookAction = "rebuild" | "notify" | "silent";

export interface ImpactReport {
  /** Total cumulative impact score */
  score: number;
  /** Recommended webhook action based on score */
  action: WebhookAction;
  /** Whether any change causes data loss */
  hasDataLoss: boolean;
  /** Individual change scores for auditing */
  breakdown: Array<{ type: string; score: number; fieldName: string }>;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Calculates the cumulative impact of a set of breaking changes.
 * Each change type maps to a severity weight; the sum determines the action.
 */
export function calculateImpact(changes: BreakingChange[]): ImpactReport {
  let score = 0;
  const breakdown: ImpactReport["breakdown"] = [];
  let hasDataLoss = false;

  for (const change of changes) {
    const weight = IMPACT_WEIGHTS[change.type] ?? IMPACT_WEIGHTS.default;
    score += weight;
    breakdown.push({ type: change.type, score: weight, fieldName: change.fieldName });
    if (change.dataLoss) hasDataLoss = true;
  }

  // Determine action based on cumulative score
  let action: WebhookAction;
  if (score > HEAVY_REBUILD_THRESHOLD) {
    action = "rebuild";
  } else if (score >= LIGHT_NOTIFY_THRESHOLD) {
    action = "notify";
  } else {
    action = "silent";
  }

  // Data loss always forces a rebuild regardless of score
  if (hasDataLoss && action !== "rebuild") {
    action = "rebuild";
  }

  return { score, action, hasDataLoss, breakdown };
}

/**
 * Convenience wrapper: compares two schemas and returns the impact report.
 * Combines `compareSchemas()` + `calculateImpact()` in one call.
 */
export async function assessSchemaImpact(
  oldSchema: import("@src/content/types").Schema | null,
  newSchema: import("@src/content/types").Schema,
): Promise<ImpactReport> {
  const { compareSchemas } = await import("./collection-schema-warnings");
  const changes = compareSchemas(oldSchema, newSchema);
  return calculateImpact(changes);
}
