/**
 * @file src/services/sdk/namespaces/collections/bulk-validation.ts
 * @description Per-entry validation for the bulk write lanes.
 *
 * The single-entry `update()` lane gates every write before it touches the
 * database: `prepareWritePayload` (sanitize, constraints, widget validators,
 * schema hooks, field permissions) plus the publish gates (required /
 * requiredIf fields). `bulkUpdate` skipped all of it, so a bulk publish of an
 * invalid draft was written through and reported as a success while the row
 * stayed DRAFT.
 *
 * This module holds the parts of those gates that need no database round trip,
 * so the rule is shared by both lanes instead of being re-invented, and it is
 * unit-testable on its own.
 *
 * ### Features:
 * - isPublishTransition: the exact status test `update()` uses
 * - missingRequiredForPublish: required / requiredIf plan → field names
 * - formatBulkRejections: one message that NAMES the offending entries
 * - assertBulkWriteValid: the 400 FIELD_VALIDATION_ERROR the route returns
 */

import { AppError } from "@utils/error-handling";
import { evaluateCondition } from "@src/widgets/desugar-field";
import type { SchemaHotFlags } from "./schema-store";

/** One row of a bulk write: the target id and that row's patch. */
export interface BulkEntryUpdate {
  id: string;
  data: Record<string, unknown>;
}

/** One row that failed validation: which entry, and why. */
export interface BulkRejection {
  id: string;
  message: string;
}

/** How many offending entries a rejection message names before it elides the rest. */
export const MAX_NAMED_REJECTIONS = 5;

const PUBLISH_STATUSES = new Set(["publish", "published"]);

/**
 * True when this patch moves the entry into a published state. Same test as
 * `update()` — a bulk publish and a single publish must agree on what
 * "publishing" means, or the gates cover different writes.
 */
export function isPublishTransition(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const status = (data as { status?: unknown }).status;
  return typeof status === "string" && PUBLISH_STATUSES.has(status);
}

/**
 * Value considered missing by the publish gate — mirrors the single-update rule
 * (undefined/null/empty string/empty array/empty object).
 */
export function isMissingRequiredValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === "object" && Object.keys(value as object).length === 0)
  );
}

/**
 * Names of the required (and conditionally required) fields the payload does
 * not fill, in schema order. `[]` means the publish gate is satisfied or the
 * schema declares no such fields.
 *
 * Extracted from `assertRequiredFieldsForPublish` so the batch gate cannot
 * drift from the single-write gate: both read the same pre-compiled plan
 * (`hot._requiredFields` / `hot._conditionallyRequiredFields`).
 */
export function missingRequiredForPublish(
  hot: SchemaHotFlags | undefined,
  payload: unknown,
): string[] {
  const required = hot?._requiredFields;
  const condRequired = hot?._conditionallyRequiredFields;
  if (
    (!hot?._hasRequiredFields || !required || required.length === 0) &&
    (!hot?._hasConditionallyRequiredFields || !condRequired || condRequired.length === 0)
  ) {
    return [];
  }

  const record = (payload ?? {}) as Record<string, unknown>;
  const missing: string[] = [];

  if (required) {
    for (let i = 0; i < required.length; i++) {
      const rf = required[i];
      if (rf.showIf && !evaluateCondition(rf.showIf, record)) continue;
      if (isMissingRequiredValue(record[rf.key])) missing.push(rf.name);
    }
  }

  if (condRequired) {
    for (let i = 0; i < condRequired.length; i++) {
      const crf = condRequired[i];
      if (crf.showIf && !evaluateCondition(crf.showIf, record)) continue;
      if (!evaluateCondition(crf.requiredIf, record)) continue;
      if (isMissingRequiredValue(record[crf.key])) missing.push(crf.name);
    }
  }

  return missing;
}

/**
 * One message for the whole batch: how many entries were rejected, and WHICH
 * ones with what reason. A count without ids leaves the author guessing which
 * row to fix, which is the failure mode this gate exists to remove.
 */
export function formatBulkRejections(
  rejections: readonly BulkRejection[],
  requested: number,
): string {
  if (rejections.length === 0) return "";
  const named = rejections.slice(0, MAX_NAMED_REJECTIONS).map((r) => `${r.id}: ${r.message}`);
  const elided = rejections.length - named.length;
  const head = `${rejections.length} of ${requested} ${
    requested === 1 ? "entry was" : "entries were"
  } rejected — nothing was written.`;
  return elided > 0
    ? `${head} ${named.join("; ")}; and ${elided} more.`
    : `${head} ${named.join("; ")}.`;
}

/**
 * Throws the same 400 FIELD_VALIDATION_ERROR the single-entry lane raises, so a
 * client handles one shape for both paths. All-or-nothing on purpose: a partial
 * bulk write that reports success is exactly the bug this replaces.
 */
export function assertBulkWriteValid(
  rejections: readonly BulkRejection[],
  requested: number,
): void {
  if (rejections.length === 0) return;
  throw new AppError(formatBulkRejections(rejections, requested), 400, "FIELD_VALIDATION_ERROR");
}
