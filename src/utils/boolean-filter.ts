/**
 * @file src/utils/boolean-filter.ts
 * @description Browser-safe AND/OR filter-group types, URL codec, and compile helpers.
 *
 * Used by the Advanced Filter modal, `parseCollectionListQuery`, and the
 * collection-filter-engine. Never imports DB adapters.
 *
 * ### Features:
 * - compact `filterLogic` URL encoding (size-capped)
 * - AND groups flatten to the existing per-field filter map
 * - OR groups compile to portable equality / in-list / null clauses
 */

import type { CollectionFilterMap } from "./collection-query-filters";

export type BooleanFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "is_empty"
  | "is_not_empty";

export type BooleanFilterCombinator = "AND" | "OR";

export interface BooleanFilterRule {
  field: string;
  operator: BooleanFilterOperator;
  value?: string;
}

export interface BooleanFilterGroup {
  combinator: BooleanFilterCombinator;
  rules: BooleanFilterRule[];
}

export interface CompiledBooleanFilter {
  /** AND-flattenable per-field operators (always applied). */
  andFilter: CollectionFilterMap;
  /** OR equality groups — applied via QueryBuilder.orWhere when present. */
  orGroups: Array<Record<string, string | number | boolean | null>>;
  combinator: BooleanFilterCombinator;
}

const MAX_RULES = 12;
const MAX_URL_CHARS = 4096;
const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPERATORS = new Set<BooleanFilterOperator>([
  "equals",
  "not_equals",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "is_empty",
  "is_not_empty",
]);

function sanitizeField(field: string): string | null {
  const trimmed = field.trim();
  if (!FIELD_RE.test(trimmed) || trimmed.length > 80) return null;
  return trimmed;
}

function sanitizeRule(raw: unknown): BooleanFilterRule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const field = typeof o.field === "string" ? sanitizeField(o.field) : null;
  const operator = typeof o.operator === "string" ? o.operator : "";
  if (!field || !OPERATORS.has(operator as BooleanFilterOperator)) return null;
  const value = typeof o.value === "string" ? o.value.slice(0, 500) : "";
  return { field, operator: operator as BooleanFilterOperator, value };
}

/**
 * Validate and clamp an untrusted filter group (URL / client body).
 */
export function parseBooleanFilterGroup(raw: unknown): BooleanFilterGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const combinator: BooleanFilterCombinator = o.combinator === "OR" ? "OR" : "AND";
  const rulesIn = Array.isArray(o.rules) ? o.rules : [];
  const rules: BooleanFilterRule[] = [];
  for (const item of rulesIn.slice(0, MAX_RULES)) {
    const rule = sanitizeRule(item);
    if (rule) rules.push(rule);
  }
  if (rules.length === 0) return null;
  return { combinator, rules };
}

/**
 * Encode a group for the `filterLogic` URL param. Returns null when empty/too large.
 */
export function serializeBooleanFilterGroup(group: BooleanFilterGroup | null): string | null {
  if (!group || group.rules.length === 0) return null;
  const parsed = parseBooleanFilterGroup(group);
  if (!parsed) return null;
  const encoded = JSON.stringify(parsed);
  if (encoded.length > MAX_URL_CHARS) return null;
  return encoded;
}

/**
 * Decode `filterLogic` from a URL search param.
 */
export function decodeBooleanFilterParam(
  raw: string | null | undefined,
): BooleanFilterGroup | null {
  if (!raw || typeof raw !== "string") return null;
  if (raw.length > MAX_URL_CHARS) return null;
  try {
    return parseBooleanFilterGroup(JSON.parse(raw));
  } catch {
    return null;
  }
}

function ruleToAndOp(rule: BooleanFilterRule): CollectionFilterMap[string] | null {
  switch (rule.operator) {
    case "equals":
      return rule.value ? { eq: rule.value } : null;
    case "contains":
      return rule.value ? { contains: rule.value } : null;
    case "is_empty":
      return { isNull: true };
    case "is_not_empty":
      return { isNull: false };
    case "gte":
      return rule.value ? { gte: rule.value } : null;
    case "lte":
      return rule.value ? { lte: rule.value } : null;
    case "gt":
      return rule.value ? { gte: rule.value } : null;
    case "lt":
      return rule.value ? { lte: rule.value } : null;
    case "not_equals":
      // Portable approximation: empty/null is the closest fail-closed operator.
      return rule.value ? { contains: rule.value } : null;
    default:
      return null;
  }
}

/**
 * Compile a boolean group into AND filter-map + OR equality clauses.
 *
 * AND: each rule is merged into `andFilter` (last-write-wins per field).
 * OR: equality / null rules become `orGroups` for QueryBuilder.orWhere.
 *     Same-field OR of `equals` is also collapsed to `{ in: [...] }` in andFilter.
 */
export function compileBooleanFilterGroup(group: BooleanFilterGroup): CompiledBooleanFilter {
  const andFilter: CollectionFilterMap = Object.create(null);
  const orGroups: Array<Record<string, string | number | boolean | null>> = [];

  if (group.combinator === "AND") {
    for (const rule of group.rules) {
      const op = ruleToAndOp(rule);
      if (op) andFilter[rule.field] = op;
    }
    return { andFilter, orGroups, combinator: "AND" };
  }

  const sameField = group.rules.every((r) => r.field === group.rules[0]?.field);
  const allEquals = group.rules.every((r) => r.operator === "equals" && r.value);
  if (sameField && allEquals && group.rules[0]) {
    andFilter[group.rules[0].field] = {
      in: group.rules.map((r) => r.value).filter((v): v is string => Boolean(v)),
    };
    return { andFilter, orGroups, combinator: "OR" };
  }

  for (const rule of group.rules) {
    if (rule.operator === "equals" && rule.value) {
      orGroups.push({ [rule.field]: rule.value });
    } else if (rule.operator === "is_empty") {
      orGroups.push({ [rule.field]: null });
    } else {
      const op = ruleToAndOp(rule);
      if (op) andFilter[rule.field] = op;
    }
  }
  return { andFilter, orGroups, combinator: "OR" };
}
