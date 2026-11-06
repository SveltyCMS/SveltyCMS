/**
 * @file src/content/content-write-prep.server.ts
 * @description Single-pass write-path field preparation (sanitize + constraints).
 *
 * Server-only: rich text is sanitized by the parser-based allowlist in
 * `sanitize-html.server.ts`. The browser-safe `content-utils.ts` deliberately
 * does not import this module (the root layout loads that module client-side).
 *
 * Features:
 * - Pre-compiled per-schema plan (WeakMap): sanitize, array, truncate targets
 * - `prepareCollectionFields()` — one schema-agnostic pass, at most one clone
 * - `payloadTouchesCollectionFieldPreparation()` — cheap patch gate
 */

import { logger } from "@utils/logger";
import { sanitizeHtml } from "@src/utils/sanitize-html.server";
import { stripHtml } from "@src/utils/sanitize-html";

// ─────────────────────────────────────────────────────────────
// String Field MaxLength Validation
// ─────────────────────────────────────────────────────────────

/** String-like field types that should respect maxLength constraints. */
const STRING_FIELD_TYPES = new Set([
  "string",
  "text",
  "textarea",
  "slug",
  "email",
  "url",
  "password",
]);

// ─────────────────────────────────────────────────────────────
// Array / Block Null Row Stripping
// ─────────────────────────────────────────────────────────────

/** Widget types that represent array/repeating data. */
const ARRAY_WIDGET_TYPES = new Set(["array", "blocks", "group", "repeater"]);

// ─────────────────────────────────────────────────────────────
// Single-Pass Field Preparation (SDK write path)
// ─────────────────────────────────────────────────────────────

/** Granular operation mode for the single-pass field preparation core. */
interface FieldPrepMode {
  sanitize: boolean;
  stripNulls: boolean;
  truncate: boolean;
}

/** Field descriptor accepted by the single-pass field preparation core. */
interface PrepField {
  db_fieldName: string;
  type?: string;
  maxLength?: number;
  widget?: { Name?: string };
}

interface CompiledPrepPlan {
  sanitizeRich: string[];
  sanitizeText: string[];
  arrayFields: string[];
  truncateFields: Array<{ name: string; maxLen: number }>;
}

const prepPlanCache = new WeakMap<object, CompiledPrepPlan>();

export function getOrCompilePrepPlan(schema: { fields?: Array<PrepField> }): CompiledPrepPlan {
  let plan = prepPlanCache.get(schema);
  if (plan) return plan;

  const sanitizeRich: string[] = [];
  const sanitizeText: string[] = [];
  const arrayFields: string[] = [];
  const truncateFields: Array<{ name: string; maxLen: number }> = [];

  if (schema.fields) {
    for (let i = 0; i < schema.fields.length; i++) {
      const field = schema.fields[i];
      if (!field || !field.db_fieldName) continue;
      const name = field.db_fieldName;
      const type = field.type;

      const widgetName = field.widget?.Name;
      if (type === "richtext" || type === "markdown" || widgetName === "RichText") {
        sanitizeRich.push(name);
      } else if (type === "text" || type === "textarea") {
        sanitizeText.push(name);
      }

      if (
        (type && ARRAY_WIDGET_TYPES.has(type)) ||
        (field.widget?.Name && ARRAY_WIDGET_TYPES.has(field.widget.Name))
      ) {
        arrayFields.push(name);
      }

      if (type && STRING_FIELD_TYPES.has(type)) {
        truncateFields.push({ name, maxLen: field.maxLength ?? 255 });
      }
    }
  }

  plan = { sanitizeRich, sanitizeText, arrayFields, truncateFields };
  try {
    prepPlanCache.set(schema, plan);
  } catch {
    // Non-object or non-extensible fallback
  }
  return plan;
}

/**
 * Single-pass field preparation core with pre-compiled WeakMap plan.
 *
 * Replaces full schema traversal on every write with direct iteration
 * over pre-compiled target field lists (sanitize, strip nulls, truncate).
 *
 * @returns `data` by reference when nothing changed; otherwise a shallow clone
 *          with only the affected fields replaced.
 */
function prepareFieldsCore(
  data: Record<string, unknown>,
  schema: { fields?: Array<PrepField> },
  mode: FieldPrepMode,
): Record<string, unknown> {
  if (!data || !schema.fields) return data;

  const plan = getOrCompilePrepPlan(schema);
  let result: Record<string, unknown> | null = null;

  // 1. Sanitize richtext/markdown
  if (mode.sanitize) {
    for (let i = 0; i < plan.sanitizeRich.length; i++) {
      const fieldName = plan.sanitizeRich[i];
      const value = (result || data)[fieldName];
      if (typeof value === "string") {
        if (!result) result = { ...data };
        result[fieldName] = sanitizeHtml(value);
      }
    }
    // Sanitize text/textarea
    for (let i = 0; i < plan.sanitizeText.length; i++) {
      const fieldName = plan.sanitizeText[i];
      const value = (result || data)[fieldName];
      if (typeof value === "string") {
        if (!result) result = { ...data };
        result[fieldName] = stripHtml(value);
      }
    }
  }

  // 2. Strip null/undefined entries from array-like fields
  if (mode.stripNulls) {
    for (let i = 0; i < plan.arrayFields.length; i++) {
      const fieldName = plan.arrayFields[i];
      const value = (result || data)[fieldName];
      if (Array.isArray(value)) {
        const originalLength = value.length;
        const filtered = value.filter((item) => item != null);
        if (filtered.length < originalLength) {
          if (!result) result = { ...data };
          result[fieldName] = filtered;
          logger.warn(
            `[stripNullRows] Field "${fieldName}" had ${originalLength - filtered.length} null entries removed`,
          );
        }
      }
    }
  }

  // 3. Enforce maxLength on string-like fields
  if (mode.truncate) {
    for (let i = 0; i < plan.truncateFields.length; i++) {
      const { name: fieldName, maxLen } = plan.truncateFields[i];
      const value = (result || data)[fieldName];
      if (typeof value === "string" && value.length > maxLen) {
        if (!result) result = { ...data };
        result[fieldName] = value.slice(0, maxLen);
        logger.warn(
          `[validateFieldConstraints] Field "${fieldName}" truncated from ${value.length} to ${maxLen} characters`,
        );
      }
    }
  }

  return result || data;
}

/**
 * Write-path field preparation flags for `prepareCollectionFields`.
 */
export interface CollectionFieldPrepFlags {
  /** Sanitize richtext/markdown/text/textarea fields (stored-XSS prevention). */
  sanitize?: boolean;
  /** Strip null rows from array/block/group/repeater fields AND enforce maxLength. */
  constraints?: boolean;
}

/**
 * Whether a partial write names at least one field handled by the prepared
 * sanitization/constraint plan. Unknown fields are still covered by the
 * generic payload sanitizer in the write pipeline; this only avoids walking a
 * schema-specific plan when none of its fields can affect the patch.
 */
export function payloadTouchesCollectionFieldPreparation(
  data: Record<string, unknown>,
  schema: { fields?: Array<PrepField> },
  flags?: CollectionFieldPrepFlags,
): boolean {
  const sanitize = flags?.sanitize === true;
  const constraints = flags?.constraints === true;
  if ((!sanitize && !constraints) || !data) return false;

  const plan = getOrCompilePrepPlan(schema);
  const touches = (names: readonly string[]) => {
    for (let i = 0; i < names.length; i++) {
      if (Object.hasOwn(data, names[i])) return true;
    }
    return false;
  };

  if (sanitize && (touches(plan.sanitizeRich) || touches(plan.sanitizeText))) return true;
  if (constraints) {
    if (touches(plan.arrayFields)) return true;
    for (let i = 0; i < plan.truncateFields.length; i++) {
      if (Object.hasOwn(data, plan.truncateFields[i].name)) return true;
    }
  }
  return false;
}

/**
 * Single-pass field preparation for collection write paths.
 *
 * Replaces the legacy `sanitizeCollectionFields` → `stripNullRows` →
 * `validateFieldConstraints` chain (up to 3 schema walks and 3 clones) with
 * ONE loop over `schema.fields` and at most one lazy shallow clone.
 *
 * - `flags.sanitize`: mirrors `sanitizeCollectionFields` exactly.
 * - `flags.constraints`: strips null array rows (same warn message as
 *   `stripNullRows`) AND enforces maxLength truncation (same warn message as
 *   `validateFieldConstraints`).
 * - When both flags are false/undefined the input is returned untouched
 *   WITHOUT iterating fields (zero cost).
 *
 * @returns `data` by reference when nothing changed; otherwise a shallow clone
 *          with only the affected fields replaced.
 */
export function prepareCollectionFields(
  data: Record<string, unknown>,
  schema: {
    fields?: Array<{
      db_fieldName: string;
      type?: string;
      maxLength?: number;
      widget?: { Name?: string };
    }>;
  },
  flags?: CollectionFieldPrepFlags,
): Record<string, unknown> {
  const sanitize = flags?.sanitize === true;
  const constraints = flags?.constraints === true;
  if (!sanitize && !constraints) return data;

  return prepareFieldsCore(data, schema, {
    sanitize,
    stripNulls: constraints,
    truncate: constraints,
  });
}
