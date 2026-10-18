/**
 * @file src/widgets/desugar-field.ts
 * @description Schema desugaring layer for SveltyCMS field types.
 *
 * When a collection author writes a shortcut field type like `{ type: 'color' }`
 * or `{ type: 'seo' }`, this module expands it into a full object field while
 * **preserving all authored metadata** — access control, validation, groups,
 * and any custom properties the author set.
 *
 * ### Architecture:
 * - `desugarFieldType` is the main entry point — it tree-walks nested objects
 *   and array members, layering the authored field back over the built one.
 * - Each sugar type has a `SugarTypeBuilder` that declares only the shape it owns.
 * - `sugarKeys` names properties that exist solely on the sugar type (e.g.,
 *   `alpha` on color, which becomes `inputOptions.alpha`) so they don't survive
 *   onto the expanded field as top-level properties.
 * - A property added to `BaseField` later is carried through automatically
 *   because the authored field is spread over the built one.
 *
 * ### Features:
 * - sugar type → full field expansion
 * - deep-merge metadata preservation (access, validation, groups)
 * - nested object/array tree-walking
 * - extensible sugar type registry
 * - runtime immutability (Object.freeze on expanded schemas)
 */

import type { FieldDefinition } from "@src/content/types";

// ============================================================================
// Types
// ============================================================================

/** Properties that every field (base or sugar) can carry. */
export interface BaseField {
  name?: string;
  label?: string;
  title?: string;
  description?: string;
  group?: string | string[];
  tab?: string;
  section?: string;
  showIf?: ConditionExpression;
  requiredIf?: ConditionExpression;
  access?: FieldAccess;
  validation?: FieldValidation;
  required?: boolean;
  translated?: boolean;
  width?: number | string;
  helper?: string;
  placeholder?: string;
  default?: unknown;
  [key: string]: unknown;
}

/** Access control for a field. */
export interface FieldAccess {
  read?: string[];
  write?: string[];
  create?: string[];
  update?: string[];
}

/** Validation rules for a field. */
export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  message?: string;
  [key: string]: unknown;
}

/**
 * Comparison operators for field conditional logic.
 */
export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "empty"
  | "not_empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in";

/** A single field condition rule. */
export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

/** A conditional expression supporting nested AND/OR groups. */
export type ConditionExpression =
  | ConditionRule
  | {
      and?: (ConditionRule | ConditionExpression)[];
      or?: (ConditionRule | ConditionExpression)[];
    };

/**
 * Safely resolves a nested dot-delimited path from an object.
 */
export function getFieldValueByPath(
  data: Record<string, unknown> | null | undefined,
  path: string,
): unknown {
  if (!data || typeof data !== "object" || !path) return undefined;
  if (path in data) return data[path];

  const segments = path.split(".");
  let current: unknown = data;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Check if a value is considered "empty" in form contexts.
 */
function isValueEmpty(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === "string") return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === "object") return Object.keys(val as object).length === 0;
  return false;
}

/**
 * Evaluate a single ConditionRule against provided form data.
 */
function evaluateSingleRule(rule: ConditionRule, data: Record<string, unknown>): boolean {
  if (!rule || !rule.field) return true;
  const actualValue = getFieldValueByPath(data, rule.field);
  const targetValue = rule.value;

  switch (rule.operator) {
    case "empty":
      return isValueEmpty(actualValue);

    case "not_empty":
      return !isValueEmpty(actualValue);

    case "equals": {
      if (typeof actualValue === "boolean") {
        return (
          actualValue ===
          (targetValue === true ||
            targetValue === "true" ||
            targetValue === 1 ||
            targetValue === "1")
        );
      }
      if (typeof actualValue === "number") {
        return actualValue === Number(targetValue);
      }
      return String(actualValue ?? "").trim() === String(targetValue ?? "").trim();
    }

    case "not_equals": {
      if (typeof actualValue === "boolean") {
        return (
          actualValue !==
          (targetValue === true ||
            targetValue === "true" ||
            targetValue === 1 ||
            targetValue === "1")
        );
      }
      if (typeof actualValue === "number") {
        return actualValue !== Number(targetValue);
      }
      return String(actualValue ?? "").trim() !== String(targetValue ?? "").trim();
    }

    case "contains": {
      if (Array.isArray(actualValue)) {
        return actualValue.some((item) => String(item) === String(targetValue));
      }
      return String(actualValue ?? "")
        .toLowerCase()
        .includes(String(targetValue ?? "").toLowerCase());
    }

    case "not_contains": {
      if (Array.isArray(actualValue)) {
        return !actualValue.some((item) => String(item) === String(targetValue));
      }
      return !String(actualValue ?? "")
        .toLowerCase()
        .includes(String(targetValue ?? "").toLowerCase());
    }

    case "gt": {
      const numActual = Number(actualValue);
      const numTarget = Number(targetValue);
      return !Number.isNaN(numActual) && !Number.isNaN(numTarget) && numActual > numTarget;
    }

    case "gte": {
      const numActual = Number(actualValue);
      const numTarget = Number(targetValue);
      return !Number.isNaN(numActual) && !Number.isNaN(numTarget) && numActual >= numTarget;
    }

    case "lt": {
      const numActual = Number(actualValue);
      const numTarget = Number(targetValue);
      return !Number.isNaN(numActual) && !Number.isNaN(numTarget) && numActual < numTarget;
    }

    case "lte": {
      const numActual = Number(actualValue);
      const numTarget = Number(targetValue);
      return !Number.isNaN(numActual) && !Number.isNaN(numTarget) && numActual <= numTarget;
    }

    case "in": {
      if (Array.isArray(targetValue)) {
        return targetValue.some((item) => String(item) === String(actualValue));
      }
      if (typeof targetValue === "string") {
        const set = targetValue.split(",").map((s) => s.trim().toLowerCase());
        return set.includes(String(actualValue ?? "").toLowerCase());
      }
      return false;
    }

    case "not_in": {
      if (Array.isArray(targetValue)) {
        return !targetValue.some((item) => String(item) === String(actualValue));
      }
      if (typeof targetValue === "string") {
        const set = targetValue.split(",").map((s) => s.trim().toLowerCase());
        return !set.includes(String(actualValue ?? "").toLowerCase());
      }
      return true;
    }

    default:
      return true;
  }
}

/**
 * Evaluates whether a conditional expression is satisfied given current form / record data.
 * Returns true if condition is undefined/empty (defaults to visible/not-conditional).
 */
export function evaluateCondition(
  condition?: ConditionExpression | null,
  data?: Record<string, unknown> | null,
): boolean {
  if (!condition) return true;
  const safeData = data ?? {};

  // Check if it's an AND expression
  if ("and" in condition && Array.isArray(condition.and)) {
    if (condition.and.length === 0) return true;
    return condition.and.every((sub) => evaluateCondition(sub, safeData));
  }

  // Check if it's an OR expression
  if ("or" in condition && Array.isArray(condition.or)) {
    if (condition.or.length === 0) return true;
    return condition.or.some((sub) => evaluateCondition(sub, safeData));
  }

  // Single rule
  if ("field" in condition && "operator" in condition) {
    return evaluateSingleRule(condition as ConditionRule, safeData);
  }

  return true;
}

/**
 * Visibility for a field in an entry form. A missing/empty `showIf` means visible.
 */
export function isFieldVisible(
  field: Pick<BaseField, "showIf">,
  data: Record<string, unknown> | null | undefined,
): boolean {
  return evaluateCondition(field.showIf, data);
}

/**
 * Effective requiredness for a field: the static flag OR a satisfied `requiredIf`.
 * `evaluateCondition(undefined)` is true, so the condition is only consulted when present.
 */
export function isFieldRequired(
  field: Pick<BaseField, "required" | "requiredIf">,
  data: Record<string, unknown> | null | undefined,
): boolean {
  if (field.required === true) return true;
  return field.requiredIf ? evaluateCondition(field.requiredIf, data) : false;
}

/**
 * A sugar type builder declares only the shape it owns.
 * The authored field is layered over it, so preservation is the default.
 */
export interface SugarTypeBuilder {
  /** The sugar type name (e.g., 'color', 'seo'). */
  type: string;

  /** Properties that exist only on the sugar type and should NOT survive
   *  onto the expanded field as top-level properties. */
  sugarKeys: string[];

  /**
   * Build the expanded field shape from the sugar-type-specific properties.
   * Returns only the shape the builder owns — the authored field will be
   * layered on top automatically by the desugar engine.
   */
  build(authoredField: BaseField): Record<string, unknown>;
}

// ============================================================================
// Deep Merge Helper
// ============================================================================

/**
 * Deep-merge authored metadata over built field shape.
 * Shallow spread ({ ...built, ...stripped }) would clobber nested objects
 * like `access` or `validation`. This helpers merges objects recursively
 * so a collection author's `access.read` doesn't wipe `access.write` from
 * the built field configuration.
 */
function deepMergeMetadata(
  built: Record<string, unknown>,
  stripped: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...built };
  for (const key of Object.keys(stripped)) {
    const strippedVal = stripped[key];
    const builtVal = merged[key];
    if (
      strippedVal &&
      typeof strippedVal === "object" &&
      !Array.isArray(strippedVal) &&
      builtVal &&
      typeof builtVal === "object" &&
      !Array.isArray(builtVal)
    ) {
      // Both are plain objects — deep merge
      merged[key] = {
        ...(builtVal as Record<string, unknown>),
        ...(strippedVal as Record<string, unknown>),
      };
    } else {
      // Primitive, array, or missing on built — authored wins
      merged[key] = strippedVal;
    }
  }
  return merged;
}

const sugarTypeRegistry = new Map<string, SugarTypeBuilder>();

/** Register a sugar type builder. Plugins can call this to add their own. */
export function registerSugarType(builder: SugarTypeBuilder): void {
  sugarTypeRegistry.set(builder.type, builder);
}

/** Check if a type is a registered sugar type. */
export function isSugarType(type: string): boolean {
  return sugarTypeRegistry.has(type);
}

// ============================================================================
// Built-in Sugar Types
// ============================================================================

/** Color picker sugar type — expands to an object with hex + alpha fields. */
registerSugarType({
  type: "color",
  sugarKeys: ["alpha", "preset"],
  build(authoredField) {
    const alpha = authoredField.alpha !== undefined ? authoredField.alpha : true;
    const preset = authoredField.preset as string | undefined;
    return {
      type: "object",
      fields: [
        {
          name: "hex",
          type: "text",
          label: "Color",
          inputOptions: { type: "color" },
        },
        ...(alpha
          ? [
              {
                name: "alpha",
                type: "number",
                label: "Opacity",
                inputOptions: { min: 0, max: 1, step: 0.01 },
                default: 1,
              },
            ]
          : []),
        ...(preset
          ? [
              {
                name: "preset",
                type: "text",
                label: "Preset",
                inputOptions: { hidden: true },
                default: preset,
              },
            ]
          : []),
      ],
    };
  },
});

/** SEO sugar type — expands to meta title, description, and OG fields. */
registerSugarType({
  type: "seo",
  sugarKeys: ["ogImageField"],
  build(authoredField) {
    const ogImageField = authoredField.ogImageField as string | undefined;
    return {
      type: "object",
      fields: [
        { name: "metaTitle", type: "text", label: "Meta Title", inputOptions: { maxLength: 60 } },
        {
          name: "metaDescription",
          type: "textarea",
          label: "Meta Description",
          inputOptions: { maxLength: 160 },
        },
        { name: "ogTitle", type: "text", label: "OG Title" },
        { name: "ogDescription", type: "textarea", label: "OG Description" },
        ...(ogImageField
          ? [
              {
                name: "ogImage",
                type: ogImageField === "media" ? "media" : "text",
                label: "OG Image",
              },
            ]
          : [{ name: "ogImage", type: "media", label: "OG Image" }]),
        { name: "canonicalUrl", type: "text", label: "Canonical URL" },
        { name: "noindex", type: "boolean", label: "No Index", default: false },
        { name: "nofollow", type: "boolean", label: "No Follow", default: false },
      ],
    };
  },
});

// ============================================================================
// Desugar Engine
// ============================================================================

/**
 * Desugar a field that uses a sugar type into its expanded form.
 *
 * The authored field is **layered over** the built field, so any property
 * the author explicitly set is preserved. Properties listed in the sugar
 * type's `sugarKeys` are removed from the top level (they get folded into
 * nested fields or `inputOptions` by the builder).
 *
 * Handles nested objects and array members recursively.
 *
 * @param authoredField - The field as written by the collection author.
 * @returns The expanded field definition with all metadata preserved.
 */
export function desugarFieldType(authoredField: BaseField): Record<string, unknown> {
  const sugarType = authoredField.type as string | undefined;
  if (!sugarType) return authoredField as Record<string, unknown>;

  const builder = sugarTypeRegistry.get(sugarType);
  if (!builder) return authoredField as Record<string, unknown>;

  // Build the expanded shape from the sugar type
  const built = builder.build(authoredField);

  // Strip sugarKeys from the authored field — they get folded into the built shape
  const stripped: Record<string, unknown> = {};
  for (const key of Object.keys(authoredField)) {
    if (key === "type") {
      // Don't carry `type: 'color'` onto the expanded field — the expanded
      // field has its own type (usually 'object').
      continue;
    }
    if (builder.sugarKeys.includes(key)) {
      // Sugar-only keys — already handled by the builder
      continue;
    }
    stripped[key] = authoredField[key];
  }

  // Layer authored over built — deep merge preserves nested metadata (access, validation)
  const result = deepMergeMetadata(built, stripped);

  // Recursively expand nested fields
  result.fields = expandFields((result.fields as Array<Record<string, unknown>>) || []);

  return result;
}

/**
 * Recursively expand sugar types in a list of field definitions.
 * Used for both top-level schema fields and nested object/array members.
 */
export function expandFields(
  fields: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return fields.map((field) => {
    const type = field.type as string | undefined;
    if (type && sugarTypeRegistry.has(type)) {
      return desugarFieldType(field as BaseField);
    }

    // Recurse into nested objects
    if (field.fields && Array.isArray(field.fields)) {
      return {
        ...field,
        fields: expandFields(field.fields as Array<Record<string, unknown>>),
      };
    }

    // Recurse into array members
    if (field.of && typeof field.of === "object") {
      const memberField = field.of as Record<string, unknown>;
      const memberType = memberField.type as string | undefined;
      if (memberType && sugarTypeRegistry.has(memberType)) {
        return {
          ...field,
          of: desugarFieldType(memberField as BaseField),
        };
      }
      // Recurse into member's nested fields
      if (memberField.fields && Array.isArray(memberField.fields)) {
        return {
          ...field,
          of: {
            ...memberField,
            fields: expandFields(memberField.fields as Array<Record<string, unknown>>),
          },
        };
      }
    }

    return field;
  });
}

/**
 * Recursively freeze plain objects and arrays so plugins cannot mutate
 * access/validation rules at runtime. Skips null, primitives, and non-plain
 * objects (Date, Map, Set, class instances) which we leave untouched.
 */
function isPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value) as T;
  }

  if (isPlainObject(value)) {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      deepFreeze(record[key]);
    }
    return Object.freeze(value) as T;
  }

  // Non-plain object (Date, Map, Set, class instance) — leave untouched.
  return value;
}

/**
 * Process a full collection schema, expanding all sugar types.
 * This should be called during collection loading/sync.
 *
 * The returned array is deep-frozen to prevent runtime mutations by
 * plugin script contexts — a plugin cannot redefine access rules or
 * validation on core fields after desugaring.
 *
 * @param fields - The fields array from a Schema
 * @returns The expanded (and frozen) fields with all sugar types desugared
 */
export function desugarSchemaFields(fields: FieldDefinition[]): FieldDefinition[] {
  const processed = fields.map((field) => {
    // Handle WidgetPlaceholder (structured type with __widgetId)
    if (field && typeof field === "object" && "__widgetId" in field) {
      return field;
    }
    // Handle JoinField (structured type with collection + on)
    if (field && typeof field === "object" && "collection" in field && "on" in field) {
      return field;
    }
    // Handle index-signature fallback (future field types)
    const rawField = field as Record<string, unknown>;
    const type = rawField.type as string | undefined;
    if (type && sugarTypeRegistry.has(type)) {
      return desugarFieldType(rawField as BaseField) as FieldDefinition;
    }
    // Recurse into nested object fields
    if (rawField.fields && Array.isArray(rawField.fields)) {
      return {
        ...rawField,
        fields: expandFields(rawField.fields as Array<Record<string, unknown>>),
      } as FieldDefinition;
    }
    return field;
  });

  // Deep-freeze the expanded schema to prevent runtime mutations by plugin contexts.
  // A plugin cannot redefine access rules or validation on desugared fields.
  return deepFreeze(processed) as FieldDefinition[];
}

/**
 * Collect all sugar keys across all registered sugar types.
 * Useful for documentation and schema validation tools.
 */
export function getAllSugarKeys(): string[] {
  const keys: string[] = [];
  for (const builder of sugarTypeRegistry.values()) {
    keys.push(...builder.sugarKeys);
  }
  return [...new Set(keys)];
}

/**
 * List all registered sugar type names.
 */
export function listSugarTypes(): string[] {
  return Array.from(sugarTypeRegistry.keys());
}
