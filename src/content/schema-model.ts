/**
 * @file src/content/schema-model.ts
 * @description Lean collection schema contract helpers shared by the API surface.
 *
 * The GraphQL list args (`where` / `orderBy` / `take`) and field `cacheHint`s are
 * resolved here so the resolver stays a thin adapter. `where` is one JSON
 * argument in a small operator language (`equals`, `not`, `in`, `gt`, `gte`,
 * `lt`, `lte`, `contains`, `AND` / `OR` / `NOT`, and relation
 * `some` / `none` / `every`), evaluated in memory for inverse relations and
 * passed through to the database for native lists.
 *
 * ### Features:
 * - `SchemaModelError` — typed model failure with a stable code
 * - `parseOrderBy` — `orderBy` string → `{ field, direction }` with `isOrderable` checks
 * - `documentMatches` — in-memory `where` evaluation with shape caps (8000 chars / depth 6 / 64 nodes)
 * - `cacheControlFor` / `mergeCacheControl` — field `cacheHint` → `Cache-Control`
 *   (tightest `maxAge`, private wins; nothing is emitted without a hint)
 * - Per-schema field indexes are memoized in a `WeakMap` — no per-row allocations
 */

export class SchemaModelError extends Error {
  readonly code: string;

  constructor(message: string, code = "SCHEMA_MODEL_ERROR") {
    super(message);
    this.name = "SchemaModelError";
    this.code = code;
  }
}

/** Shape caps for a `where` argument — a full page is rejected, never truncated. */
export const WHERE_LIMITS = {
  maxLength: 8000,
  maxDepth: 6,
  maxNodes: 64,
} as const;

type WhereRecord = Record<string, unknown>;

const FIELD_INDEX_CACHE = new WeakMap<readonly unknown[], Map<string, WhereRecord>>();

function asRecord(value: unknown): WhereRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as WhereRecord;
}

/** Storage/GraphQL name of a field (`db_fieldName`, then `name`, then `label`). */
function storageNameOf(field: WhereRecord): string {
  const candidates = [field.db_fieldName, field.name, field.label];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return "";
}

function getFieldIndex(fields: readonly unknown[]): Map<string, WhereRecord> {
  const cached = FIELD_INDEX_CACHE.get(fields);
  if (cached) return cached;
  const index = new Map<string, WhereRecord>();
  for (const field of fields) {
    const record = asRecord(field);
    if (!record) continue;
    const name = storageNameOf(record);
    if (name) index.set(name.toLowerCase(), record);
  }
  FIELD_INDEX_CACHE.set(fields, index);
  return index;
}

// ---------------------------------------------------------------------------
// where
// ---------------------------------------------------------------------------

/** Field-level operators, accepting both plain and `$`-prefixed spellings. */
const OPERATOR_ALIASES: Record<string, string> = {
  equals: "$eq",
  $eq: "$eq",
  eq: "$eq",
  not: "$ne",
  $ne: "$ne",
  ne: "$ne",
  in: "$in",
  $in: "$in",
  nin: "$nin",
  $nin: "$nin",
  gt: "$gt",
  $gt: "$gt",
  gte: "$gte",
  $gte: "$gte",
  lt: "$lt",
  $lt: "$lt",
  lte: "$lte",
  $lte: "$lte",
  contains: "$contains",
  $contains: "$contains",
  some: "$some",
  $some: "$some",
  none: "$none",
  $none: "$none",
  every: "$every",
  $every: "$every",
};

/**
 * Logical combinators. Uppercase `AND` / `OR` / `NOT` are the documented
 * spelling; `not` lowercase stays the field-level "not equals" operator.
 */
const LOGICAL_OPERATORS = new Set(["AND", "OR", "NOT", "$and", "$or", "$not"]);

function coerceWhere(where: unknown): WhereRecord | null {
  if (where === undefined || where === null) return null;
  if (typeof where === "string") {
    const trimmed = where.trim();
    if (!trimmed) return null;
    try {
      return asRecord(JSON.parse(trimmed));
    } catch {
      throw new SchemaModelError("where must be valid JSON", "WHERE_INVALID");
    }
  }
  const record = asRecord(where);
  if (!record) throw new SchemaModelError("where must be a JSON object", "WHERE_INVALID");
  return record;
}

/** Enforce the `where` shape caps (length, depth, node count) in one pass. */
export function assertWhereShape(where: WhereRecord): void {
  let encodedLength = 0;
  try {
    encodedLength = JSON.stringify(where).length;
  } catch {
    throw new SchemaModelError("where must be JSON-serializable", "WHERE_INVALID");
  }
  if (encodedLength > WHERE_LIMITS.maxLength) {
    throw new SchemaModelError(
      `where exceeds ${WHERE_LIMITS.maxLength} characters`,
      "WHERE_TOO_LARGE",
    );
  }

  let nodes = 0;
  const stack: Array<{ value: unknown; depth: number }> = [{ value: where, depth: 1 }];
  while (stack.length > 0) {
    const entry = stack.pop()!;
    const value = entry.value;
    if (entry.depth > WHERE_LIMITS.maxDepth) {
      throw new SchemaModelError(`where exceeds depth ${WHERE_LIMITS.maxDepth}`, "WHERE_TOO_DEEP");
    }
    nodes++;
    if (nodes > WHERE_LIMITS.maxNodes) {
      throw new SchemaModelError(
        `where exceeds ${WHERE_LIMITS.maxNodes} nodes`,
        "WHERE_TOO_COMPLEX",
      );
    }
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) {
        stack.push({ value: value[i], depth: entry.depth + 1 });
      }
    } else {
      const record = asRecord(value);
      if (record) {
        for (const key in record) {
          if (Object.hasOwn(record, key)) {
            stack.push({ value: record[key], depth: entry.depth + 1 });
          }
        }
      }
    }
  }
}

function lookupPath(doc: WhereRecord, path: string): unknown {
  if (!path.includes(".")) return doc[path];
  let current: unknown = doc;
  for (const part of path.split(".")) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[part];
  }
  return current;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date) {
    if (b instanceof Date) return a.getTime() === b.getTime();
    if (typeof b === "string") return a.toISOString() === b;
    return false;
  }
  if (b instanceof Date && typeof a === "string") return b.toISOString() === a;
  return false;
}

/** Ordering comparison for `gt`/`gte`/`lt`/`lte`; null when not comparable. */
function orderCompare(a: unknown, b: unknown): number | null {
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === "boolean" && typeof b === "boolean") {
    return a === b ? 0 : a ? 1 : -1;
  }
  return null;
}

function relationList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function matchCondition(actual: unknown, condition: unknown): boolean {
  const record = asRecord(condition);
  if (record) {
    const keys = Object.keys(record);
    if (keys.length > 0 && keys.every((key) => OPERATOR_ALIASES[key])) {
      for (const key of keys) {
        if (!applyOperator(OPERATOR_ALIASES[key], actual, record[key])) return false;
      }
      return true;
    }
  }
  return looseEquals(actual, condition);
}

function applyOperator(operator: string, actual: unknown, expected: unknown): boolean {
  switch (operator) {
    case "$eq":
      return looseEquals(actual, expected);
    case "$ne":
      return !looseEquals(actual, expected);
    case "$in":
      return Array.isArray(expected) && expected.some((value) => looseEquals(actual, value));
    case "$nin":
      return Array.isArray(expected) ? !expected.some((value) => looseEquals(actual, value)) : true;
    case "$gt": {
      const order = orderCompare(actual, expected);
      return order !== null && order > 0;
    }
    case "$gte": {
      const order = orderCompare(actual, expected);
      return order !== null && order >= 0;
    }
    case "$lt": {
      const order = orderCompare(actual, expected);
      return order !== null && order < 0;
    }
    case "$lte": {
      const order = orderCompare(actual, expected);
      return order !== null && order <= 0;
    }
    case "$contains": {
      if (typeof actual === "string" && typeof expected === "string") {
        return expected.length > 0 && actual.includes(expected);
      }
      if (Array.isArray(actual)) return actual.some((value) => looseEquals(value, expected));
      return false;
    }
    case "$some":
      return relationList(actual).some((value) => matchCondition(value, expected));
    case "$none":
      return !relationList(actual).some((value) => matchCondition(value, expected));
    case "$every": {
      const list = relationList(actual);
      // `Array#every` is true for an empty list — an absent relation matches vacuously.
      return list.every((value) => matchCondition(value, expected));
    }
    default:
      return false;
  }
}

function assertFilterable(
  path: string,
  fieldIndex: Map<string, WhereRecord> | null,
  user: unknown,
): void {
  if (!fieldIndex) return;
  const root = path.split(".")[0]?.toLowerCase() ?? "";
  const field = fieldIndex.get(root);
  if (!field) return;
  const filterable = field.isFilterable;
  if (filterable === false) {
    throw new SchemaModelError(`Field '${path}' is not filterable`, "WHERE_FIELD_NOT_FILTERABLE");
  }
  if (typeof filterable === "function") {
    let allowed = false;
    try {
      allowed = Boolean((filterable as (ctx: { user?: unknown }) => boolean)({ user }));
    } catch {
      allowed = false;
    }
    if (!allowed) {
      throw new SchemaModelError(`Field '${path}' is not filterable`, "WHERE_FIELD_NOT_FILTERABLE");
    }
  }
}

function matchObject(
  doc: WhereRecord,
  where: WhereRecord,
  fieldIndex: Map<string, WhereRecord> | null,
  user: unknown,
): boolean {
  for (const key in where) {
    if (!Object.hasOwn(where, key)) continue;
    const value = where[key];

    if (LOGICAL_OPERATORS.has(key)) {
      if (key === "AND" || key === "$and") {
        if (
          !Array.isArray(value) ||
          !value.every((entry) => matchNested(doc, entry, fieldIndex, user))
        ) {
          return false;
        }
        continue;
      }
      if (key === "OR" || key === "$or") {
        if (
          !Array.isArray(value) ||
          !value.some((entry) => matchNested(doc, entry, fieldIndex, user))
        ) {
          return false;
        }
        continue;
      }
      // NOT / $not — a single nested where.
      if (!matchNested(doc, value, fieldIndex, user)) continue;
      return false;
    }

    assertFilterable(key, fieldIndex, user);
    if (!matchField(lookupPath(doc, key), value)) return false;
  }
  return true;
}

function matchNested(
  doc: WhereRecord,
  where: unknown,
  fieldIndex: Map<string, WhereRecord> | null,
  user: unknown,
): boolean {
  const record = asRecord(where);
  if (!record) return false;
  return matchObject(doc, record, fieldIndex, user);
}

function matchField(actual: unknown, condition: unknown): boolean {
  return matchCondition(actual, condition);
}

/**
 * Evaluate a `where` argument against an already-loaded document.
 *
 * Used by inverse-relation resolvers (filtering loaded rows in memory) — the
 * same operator language as native list filters. Throws `SchemaModelError` for
 * an invalid or over-cap `where`.
 */
export function documentMatches(
  doc: unknown,
  where: unknown,
  fields?: readonly unknown[],
  user?: unknown,
): boolean {
  const record = asRecord(doc);
  if (!record) return false;
  const filter = coerceWhere(where);
  if (!filter) return true;
  assertWhereShape(filter);
  const fieldIndex = fields && fields.length > 0 ? getFieldIndex(fields) : null;
  return matchObject(record, filter, fieldIndex, user);
}

// ---------------------------------------------------------------------------
// orderBy
// ---------------------------------------------------------------------------

export interface ParsedOrderBy {
  /** Storage field name (what the database sort expects). */
  field: string;
  direction: "asc" | "desc";
}

/**
 * Parse one `orderBy` string into a sort term.
 *
 * Accepted forms (one term, like the REST `sort` argument): `field`,
 * `+field`, `-field` (desc), `field:asc`, `field:desc`, `field asc`,
 * `field desc`. `isOrderable: false` (or a function returning false) and
 * unknown fields are rejected — a silently ignored sort is worse than an error.
 */
export function parseOrderBy(
  orderBy: unknown,
  fields: readonly unknown[],
  ctx: { user?: unknown } = {},
): ParsedOrderBy {
  if (typeof orderBy !== "string" || !orderBy.trim()) {
    throw new SchemaModelError("orderBy must be a non-empty string", "ORDERBY_INVALID");
  }
  let name = orderBy.trim();
  let direction: "asc" | "desc" = "asc";
  if (name.startsWith("-")) {
    direction = "desc";
    name = name.slice(1).trim();
  } else if (name.startsWith("+")) {
    name = name.slice(1).trim();
  }
  const explicit = /^(.+?)[:\s]+(asc|desc)$/i.exec(name);
  if (explicit) {
    name = explicit[1]!.trim();
    direction = explicit[2]!.toLowerCase() === "desc" ? "desc" : "asc";
  }
  if (!name) throw new SchemaModelError("orderBy must name a field", "ORDERBY_INVALID");

  const fieldIndex = getFieldIndex(fields);
  const field = fieldIndex.get(name.toLowerCase());
  if (!field) {
    throw new SchemaModelError(`Unknown orderBy field '${name}'`, "ORDERBY_UNKNOWN_FIELD");
  }
  const orderable = field.isOrderable;
  if (orderable === false) {
    throw new SchemaModelError(`Field '${name}' is not orderable`, "ORDERBY_FIELD_NOT_ORDERABLE");
  }
  if (typeof orderable === "function") {
    let allowed = false;
    try {
      allowed = Boolean(
        (orderable as (context: { user?: unknown }) => boolean)({ user: ctx.user }),
      );
    } catch {
      allowed = false;
    }
    if (!allowed) {
      throw new SchemaModelError(`Field '${name}' is not orderable`, "ORDERBY_FIELD_NOT_ORDERABLE");
    }
  }

  return { field: storageNameOf(field) || name, direction };
}

// ---------------------------------------------------------------------------
// cacheHint → Cache-Control
// ---------------------------------------------------------------------------

interface CacheHint {
  maxAge: number;
  scope: "public" | "private";
}

function hintOf(field: WhereRecord): CacheHint | null {
  const hint = asRecord(field.cacheHint);
  if (!hint) return null;
  const maxAge = Number(hint.maxAge);
  if (!Number.isFinite(maxAge) || maxAge < 0) return null;
  // Fail safe: only an explicit `public` may be stored in a shared cache.
  const scope = String(hint.scope ?? "").toLowerCase() === "public" ? "public" : "private";
  return { maxAge: Math.floor(maxAge), scope };
}

function namesOf(field: WhereRecord): string[] {
  const names: string[] = [];
  for (const candidate of [field.db_fieldName, field.name, field.label]) {
    if (typeof candidate === "string" && candidate) names.push(candidate.toLowerCase());
  }
  return names;
}

/**
 * Build the `Cache-Control` header for a response, from the `cacheHint`s of the
 * requested fields. Tightest `maxAge` wins; any private hint makes the whole
 * response private. Returns null when no requested field declares a hint.
 */
export function cacheControlFor(
  fields: readonly unknown[],
  requestedFields?: readonly string[] | undefined,
): string | null {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const wanted =
    requestedFields && requestedFields.length > 0
      ? new Set(requestedFields.map((name) => name.toLowerCase()))
      : null;

  let maxAge: number | null = null;
  let isPrivate = false;
  let found = false;
  for (const field of fields) {
    const record = asRecord(field);
    if (!record) continue;
    const hint = hintOf(record);
    if (!hint) continue;
    if (wanted) {
      const names = namesOf(record);
      if (names.length > 0 && !names.some((name) => wanted.has(name))) continue;
    }
    found = true;
    maxAge = maxAge === null ? hint.maxAge : Math.min(maxAge, hint.maxAge);
    if (hint.scope === "private") isPrivate = true;
  }
  if (!found || maxAge === null) return null;
  return `${isPrivate ? "private" : "public"}, max-age=${maxAge}`;
}

interface ParsedCacheControl {
  isPrivate: boolean;
  isPublic: boolean;
  maxAge: number | null;
}

function parseCacheControl(value: string): ParsedCacheControl {
  const lower = value.toLowerCase();
  const maxAgeMatch = /max-age\s*=\s*(\d+)/.exec(lower);
  return {
    isPrivate: /\bprivate\b/.test(lower),
    isPublic: /\bpublic\b/.test(lower),
    maxAge: maxAgeMatch ? Number(maxAgeMatch[1]) : null,
  };
}

/**
 * Merge two `Cache-Control` values: private wins, `maxAge` is the minimum.
 * Returns null only when both inputs are absent.
 */
export function mergeCacheControl(
  current: string | null | undefined,
  next: string | null | undefined,
): string | null {
  if (!current) return next ?? null;
  if (!next) return current;
  const a = parseCacheControl(current);
  const b = parseCacheControl(next);
  const isPrivate = a.isPrivate || b.isPrivate;
  const isPublic = !isPrivate && (a.isPublic || b.isPublic);
  const maxAges = [a.maxAge, b.maxAge].filter((value): value is number => value !== null);
  const maxAge = maxAges.length > 0 ? Math.min(...maxAges) : null;
  const scope = isPrivate ? "private" : isPublic ? "public" : null;
  if (scope && maxAge !== null) return `${scope}, max-age=${maxAge}`;
  if (scope) return scope;
  if (maxAge !== null) return `max-age=${maxAge}`;
  return null;
}
