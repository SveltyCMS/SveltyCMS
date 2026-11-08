/**
 * @file src/content/content-utils.ts
 * @description
 * Numeric field range validation for the content write path, plus the stable
 * `@src/content/content-utils` surface for the pure tree helpers that now live
 * in `content-tree.ts` (server reconciliation, seed, and unit tests import them
 * from here).
 *
 * ### Features:
 * - pre-compiled number-field plans (zero schema walk on the hot path)
 * - schema min/max range validation
 * - SQL integer-overflow guards before the value reaches an adapter
 * - re-export of the browser-safe tree helpers
 *
 * Write-path field preparation lives in `content-write-prep.server.ts` so this
 * module stays free of the server-only HTML parser.
 */
export {
  generateCategoryNodesFromPaths,
  sortContentNodes,
  hasDuplicateSiblingName,
} from "./content-tree";

// ─────────────────────────────────────────────────────────────
// Numeric Field Range Validation
// ─────────────────────────────────────────────────────────────

const MAX_SAFE_SQL_INT = 2_147_483_647; // MariaDB/PostgreSQL INT max
const MIN_SAFE_SQL_INT = -2_147_483_648;

/**
 * Validates numeric field values against schema-defined min/max ranges.
 * Prevents integer overflow errors at the database layer (500 errors)
 * by catching out-of-range values before they reach the adapter.
 *
 * @returns Array of validation error messages (empty = all valid)
 */
/** Pre-compiled number-field plan: name + optional range bounds. */
export interface NumberFieldPlan {
  db_fieldName: string;
  min?: number;
  max?: number;
}

/**
 * Validate numeric values against pre-compiled field plans — zero schema walk.
 * Kept separate from `validateNumericFields` so the hot path can pass
 * `SchemaHotFlags._numberFields` directly instead of re-walking `schema.fields`.
 */
export function validateNumberFieldPlans(
  data: Record<string, unknown>,
  fields: NumberFieldPlan[],
): string[] {
  const errors: string[] = [];
  for (const field of fields) {
    const value = data[field.db_fieldName];
    if (value === undefined || value === null) continue;

    const num = Number(value);
    if (!Number.isFinite(num)) {
      errors.push(`Field "${field.db_fieldName}": value "${value}" is not a valid number`);
      continue;
    }

    // Check schema-defined range
    if (field.min !== undefined && num < field.min) {
      errors.push(
        `Field "${field.db_fieldName}": ${num} is below minimum allowed value (${field.min})`,
      );
    }
    if (field.max !== undefined && num > field.max) {
      errors.push(
        `Field "${field.db_fieldName}": ${num} exceeds maximum allowed value (${field.max})`,
      );
    }

    // Guard against SQL integer overflow (even if no min/max defined)
    if (num > MAX_SAFE_SQL_INT || num < MIN_SAFE_SQL_INT) {
      errors.push(
        `Field "${field.db_fieldName}": ${num} is outside the safe integer range for the database (${MIN_SAFE_SQL_INT} to ${MAX_SAFE_SQL_INT})`,
      );
    }
  }
  return errors;
}

const numberFieldPlanCache = new WeakMap<object, NumberFieldPlan[]>();

export function validateNumericFields(
  data: Record<string, unknown>,
  schema: {
    fields?: Array<{
      db_fieldName: string;
      type?: string;
      min?: number;
      max?: number;
    }>;
  },
): string[] {
  if (!schema.fields) return [];
  let plans = numberFieldPlanCache.get(schema);
  if (!plans) {
    plans = [];
    for (const field of schema.fields) {
      if (field.type !== "number") continue;
      plans.push({ db_fieldName: field.db_fieldName, min: field.min, max: field.max });
    }
    try {
      numberFieldPlanCache.set(schema, plans);
    } catch {
      // Non-extensible object fallback
    }
  }
  return plans.length > 0 ? validateNumberFieldPlans(data, plans) : [];
}
