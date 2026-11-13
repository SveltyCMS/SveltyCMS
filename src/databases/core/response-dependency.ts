/**
 * @file src/databases/core/response-dependency.ts
 * @description Dependency model between a write and a cached collection list body
 * (`GET /api/collections/<id>?filter=…&sort=…&fields=…`), so the write path can skip
 * bodies a write provably cannot affect instead of evicting every list of the collection.
 *
 * A cached list body embeds rows, so its validity depends on three things: which rows
 * belong to the result set (the filter), in which order they appear (the sort), and which
 * fields of them are serialized (the projection). {@link parseListBodyDependency} extracts
 * exactly those three inputs from the request's query string, and
 * {@link bodyAffectedByWrite} answers the eviction question for one write.
 *
 * ### Features:
 * - zero-dependency (no imports, no I/O, no ambient state) — safe on any hot path
 * - flat equality extraction for scalar / `$eq` / `$in` clauses (incl. a top-level `$and`)
 * - dotted-path aware field reads (`meta.status` reads `row.meta?.status`)
 * - conservative by construction: anything unparseable or unrepresentable yields
 *   `precise: false` and therefore "affected"
 * - dedicated unfiltered rule (a body without a filter embeds every row by design)
 */

/** Everything about a cached list body that a write could invalidate. */
export interface ListBodyDependency {
  /** True when the request carried no filter (the body contains every row in the collection). */
  unfiltered: boolean;
  /** Top-level or dotted fields referenced by the filter (dotted paths keep their first segment). */
  filterFields: string[];
  /**
   * Flat equality map when EVERY clause is a scalar, `{ $eq: v }` or `{ $in: [...scalars] }`
   * (optionally wrapped in a top-level `$and`). `null` when any clause uses another operator,
   * is `$or`/`$nor`, or nests deeper — callers must then stay conservative.
   */
  equality: Record<string, string | string[]> | null;
  /** Sort fields in order, direction markers (`-`, `+`) stripped. */
  sortFields: string[];
  /** Projected fields when `fields=` was supplied; `null` when the body selects every field. */
  projectedFields: string[] | null;
  /** False when the dependency cannot be reasoned about (see `equality === null`). */
  precise: boolean;
}

/** The three mutating operations whose effect a list body must survive. */
export type WriteKind = "create" | "update" | "delete";

/** One write, described in the terms the dependency model compares against. */
export interface WriteChange {
  kind: WriteKind;
  /** Fields whose value changed. create/delete: every field present on the row; update: the patch keys. */
  changedFields: readonly string[];
  /** Row as it was before an update/delete (create: undefined). */
  rowBefore?: Record<string, unknown> | null;
  /** Row as it is after a create/update (delete: undefined). */
  rowAfter?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Primitive helpers (module-private; no `any`, no imports)
// ---------------------------------------------------------------------------

/** Values a flat equality map can carry: anything `String()` round-trips faithfully. */
function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/** Distinguishes a JSON object from arrays and `null` (both `typeof "object"`). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `meta.status` → `meta`; a plain field name is its own head. */
function headSegment(path: string): string {
  const dot = path.indexOf(".");
  return dot === -1 ? path : path.slice(0, dot);
}

/**
 * Read a (possibly dotted) field off a row: `a.b` reads `row.a?.b`.
 * A segment that is not a plain object ends the walk with `undefined`, which is
 * what the storage layer would yield for a missing nested field.
 */
function readFieldPath(row: Record<string, unknown>, path: string): unknown {
  if (!path.includes(".")) return row[path];
  let current: unknown = row;
  for (const segment of path.split(".")) {
    if (!isPlainObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/**
 * True when two field paths can refer to the same stored value: they are equal,
 * or one is a dotted descendant of the other (`meta` vs `meta.status`). A patch of
 * `meta` rewrites every field below it, and a filter on `meta` reads all of them.
 */
function pathsConflict(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
}

/** True when any field of `fields` overlaps any field of `changed`. */
function intersects(fields: readonly string[], changed: readonly string[]): boolean {
  for (const field of fields) {
    for (const entry of changed) {
      if (pathsConflict(field, entry)) return true;
    }
  }
  return false;
}

/** Structural equality for the two shapes a flat equality entry can hold. */
function sameEquality(left: string | string[], right: string | string[]): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

// ---------------------------------------------------------------------------
// Query-string parsing
// ---------------------------------------------------------------------------

/** Intermediate result of parsing the `filter` parameter. */
interface ParsedFilter {
  unfiltered: boolean;
  filterFields: string[];
  equality: Record<string, string | string[]> | null;
  precise: boolean;
}

/**
 * Collect the head segment of every field referenced by the filter, in encounter
 * order and without duplicates. Descends only through `$`-prefixed operator keys
 * (`$and`/`$or`/`$nor`/`$not`), never into a field's own value: `{ meta: { … } }`
 * references the field `meta`, not the keys of the compared document.
 */
function collectFilterFields(
  filter: Record<string, unknown>,
  out: string[],
  seen: Set<string>,
): void {
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith("$")) {
      const branches = Array.isArray(value) ? value : [value];
      for (const branch of branches) {
        if (isPlainObject(branch)) collectFilterFields(branch, out, seen);
      }
      continue;
    }
    const head = headSegment(key);
    if (!head || seen.has(head)) continue;
    seen.add(head);
    out.push(head);
  }
}

/**
 * Reduce one clause value to its flat equality form, or `null` when the operator
 * (or the value shape) is outside the model — `$ne`, `$gt`, `$regex`, `$exists`,
 * a nested document, an array of documents, …
 */
function resolveEqualityValue(value: unknown): string | string[] | null {
  if (isScalar(value)) return String(value);
  if (!isPlainObject(value)) return null;

  const operators = Object.keys(value);
  if (operators.length !== 1) return null;

  const operator = operators[0];
  if (operator === "$eq") {
    const operand = value[operator];
    return isScalar(operand) ? String(operand) : null;
  }
  if (operator === "$in") {
    const operand = value[operator];
    if (!Array.isArray(operand)) return null;
    const members: string[] = [];
    for (const member of operand) {
      // `$in` with a non-scalar member (null, document, nested operator) is not
      // representable as a string list, so the whole clause drops to imprecise.
      if (!isScalar(member)) return null;
      members.push(String(member));
    }
    return members;
  }
  return null;
}

/** Dependency-shaped "nothing was filtered" result, shared by every empty-filter spelling. */
function unfilteredResult(): ParsedFilter {
  return { unfiltered: true, filterFields: [], equality: {}, precise: true };
}

/** Imprecise result — the caller must evict everything for this collection. */
function impreciseResult(filterFields: string[]): ParsedFilter {
  return { unfiltered: false, filterFields, equality: null, precise: false };
}

/**
 * Parse the JSON-encoded `filter` parameter.
 *
 * - absent / empty / `{}` / `{ $and: [] }` → unfiltered (an empty conjunction matches
 *   every row, so the body really does embed the whole collection),
 * - every clause a scalar, `{ $eq }` or `{ $in: [scalars] }` (optionally inside a
 *   top-level `$and`) → flat equality map,
 * - anything else (`$or`, `$nor`, `$ne`, `$gt`, `$regex`, nested docs, malformed JSON)
 *   → `precise: false`, `equality: null`.
 */
function parseFilter(raw: string | null): ParsedFilter {
  if (raw === null || raw.trim() === "") return unfilteredResult();

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    // Malformed filter JSON: the request itself is still cached under its raw
    // query string, so we cannot reason about it — never throw, stay conservative.
    return impreciseResult([]);
  }
  if (!isPlainObject(decoded)) return impreciseResult([]);

  const filterFields: string[] = [];
  collectFilterFields(decoded, filterFields, new Set<string>());

  // Flatten a top-level `$and` into the clause list; any other operator key at
  // this level is outside the model.
  const clauses: Record<string, unknown>[] = [];
  let precise = true;
  for (const [key, value] of Object.entries(decoded)) {
    if (key === "$and") {
      if (!Array.isArray(value)) {
        precise = false;
        continue;
      }
      for (const branch of value) {
        if (!isPlainObject(branch)) {
          precise = false;
          continue;
        }
        clauses.push(branch);
      }
      continue;
    }
    if (key.startsWith("$")) {
      precise = false;
      continue;
    }
    clauses.push({ [key]: value });
  }

  if (clauses.length === 0) {
    // `{}` or `{ $and: [] }` (nothing to constrain) — but a malformed `$and`
    // already marked the dependency imprecise, so keep that verdict.
    return precise ? unfilteredResult() : impreciseResult(filterFields);
  }

  const equality: Record<string, string | string[]> = {};
  let flat = precise;
  for (const clause of clauses) {
    for (const [field, value] of Object.entries(clause)) {
      if (field.startsWith("$")) {
        // Nested logical operator inside a clause (`$and`, `$or`, `$expr`, …).
        flat = false;
        continue;
      }
      const resolved = resolveEqualityValue(value);
      if (resolved === null) {
        flat = false;
        continue;
      }
      const existing = equality[field];
      if (existing !== undefined && !sameEquality(existing, resolved)) {
        // The same field constrained twice (`$and: [{status:"a"}, {status:"b"}]`)
        // has no single flat entry; leaving either value in place would be unsafe.
        flat = false;
        continue;
      }
      if (existing === undefined) equality[field] = resolved;
    }
  }

  return flat
    ? { unfiltered: false, filterFields, equality, precise: true }
    : impreciseResult(filterFields);
}

/** `-views` / `+title` / `views:desc` → `views` / `title` / `views`. */
function normalizeSortField(entry: string): string {
  let name = entry.trim();
  if (name.startsWith("-") || name.startsWith("+")) name = name.slice(1).trim();
  const colon = name.indexOf(":");
  if (colon > 0) name = name.slice(0, colon).trim();
  return name;
}

/**
 * Parse the `sort` parameter. The API sends it JSON-encoded, but `?sort=-views,title`
 * (a raw comma list) is also accepted; only a value that opens like JSON (`[`, `{`, `"`)
 * and then fails to decode is treated as malformed.
 */
function parseSort(raw: string | null): { fields: string[]; precise: boolean } {
  if (raw === null || raw.trim() === "") return { fields: [], precise: true };

  const trimmed = raw.trim();
  const looksJson = /^[[{"]/.test(trimmed);
  let decoded: unknown = trimmed;
  if (looksJson) {
    try {
      decoded = JSON.parse(trimmed);
    } catch {
      return { fields: [], precise: false };
    }
  }

  const fields: string[] = [];
  const push = (entry: string): void => {
    const name = normalizeSortField(entry);
    if (name && !fields.includes(name)) fields.push(name);
  };

  if (typeof decoded === "string") {
    for (const part of decoded.split(",")) push(part);
    return { fields, precise: true };
  }
  if (Array.isArray(decoded)) {
    let precise = true;
    for (const entry of decoded) {
      if (typeof entry === "string") push(entry);
      else precise = false;
    }
    return { fields, precise };
  }
  if (isPlainObject(decoded)) {
    // Mongo-style `{ views: -1 }` — key order is the sort order.
    for (const key of Object.keys(decoded)) push(key);
    return { fields, precise: true };
  }
  return { fields: [], precise: false };
}

/**
 * Parse the `fields` parameter into a projection.
 *
 * `null` means "the body selects every field", which is the conservative answer for
 * absent, empty, `*` and unparseable input — an all-field body goes stale on any write.
 */
function parseProjection(raw: string | null): { fields: string[] | null; precise: boolean } {
  if (raw === null || raw.trim() === "") return { fields: null, precise: true };

  const trimmed = raw.trim();
  if (trimmed === "*") return { fields: null, precise: true };

  let names: string[];
  if (trimmed.startsWith("[")) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(trimmed);
    } catch {
      return { fields: null, precise: false };
    }
    if (!Array.isArray(decoded)) return { fields: null, precise: false };
    names = [];
    for (const entry of decoded) {
      if (typeof entry !== "string") return { fields: null, precise: false };
      names.push(entry);
    }
  } else {
    names = trimmed.split(",");
  }

  const fields = names.map((name) => name.trim()).filter((name) => name.length > 0);
  // An empty projection and an absent one are the same body: every field.
  return { fields: fields.length > 0 ? fields : null, precise: true };
}

/**
 * Parse the query string of a collection list request into a dependency.
 *
 * `filter` and `sort` are JSON-encoded in this API (`?filter={"status":"published"}&sort=-views`);
 * a parse error never throws — it yields `precise: false`, `equality: null` and whatever
 * field names could be recovered (empty arrays are fine).
 */
export function parseListBodyDependency(searchParams: URLSearchParams): ListBodyDependency {
  const filter = parseFilter(searchParams.get("filter"));
  const sort = parseSort(searchParams.get("sort"));
  const projection = parseProjection(searchParams.get("fields"));

  const precise = filter.precise && sort.precise && projection.precise;

  return {
    unfiltered: filter.unfiltered,
    filterFields: filter.filterFields,
    // Invariant: `precise` ⇔ `equality` is a flat map. A malformed sort/fields
    // parameter means the body cannot be reasoned about, so the map is withheld.
    equality: precise ? filter.equality : null,
    sortFields: sort.fields,
    projectedFields: projection.fields,
    precise,
  };
}

// ---------------------------------------------------------------------------
// Write-vs-body reasoning
// ---------------------------------------------------------------------------

/**
 * True when `row` could match the equality map. Conservative: an unknown operator or a
 * value type we cannot compare returns `true` (assume it matches, so the caller evicts).
 *
 * - every entry must match (an empty map matches every row),
 * - `string[]` entries are `$in`: any listed scalar matches,
 * - a nullish row value never matches a scalar expectation (an absent field is a
 *   definite non-match, not an unknown),
 * - a container row value (document/array) is not comparable with `String()` — it is
 *   reported as a match so the caller evicts.
 */
export function rowMatchesEquality(
  equality: Record<string, string | string[]>,
  row: Record<string, unknown>,
): boolean {
  for (const [field, expected] of Object.entries(equality)) {
    const actual = readFieldPath(row, field);

    if (actual !== null && typeof actual === "object") {
      // Unknown container shape → assume match (conservative).
      return true;
    }

    if (Array.isArray(expected)) {
      if (expected.length === 0) return false; // `$in: []` matches nothing
      let matched = false;
      for (const candidate of expected) {
        if (actual !== undefined && actual !== null && String(actual) === candidate) {
          matched = true;
          break;
        }
      }
      if (!matched) return false;
      continue;
    }

    if (actual === undefined || actual === null) return false;
    if (String(actual) !== expected) return false;
  }
  return true;
}

/**
 * Decide whether a write can affect a cached body with this dependency.
 * MUST be conservative: return `true` whenever unsure.
 *
 * The rules, in order:
 *
 * 1. **Unfiltered → always `true`.** The body embeds every row of the collection, so a
 *    create/delete changes the row set and any update changes a row's content — and the
 *    default sort (`updatedAt`) moves the row. This is deliberate; do not "optimise" it.
 * 2. **`!precise` → always `true`.** An operator/nesting we do not model (`$or`, `$ne`,
 *    `$gt`, malformed JSON) means membership cannot be computed.
 * 3. **create** → `rowMatchesEquality(equality, rowAfter)`. A body whose filter cannot
 *    match the new row cannot gain it; when it does match, the body's content *and* order
 *    changed. A missing `rowAfter` is unknown → `true`.
 * 4. **delete** → `rowMatchesEquality(equality, rowBefore)` (same reasoning, same
 *    missing-row fallback).
 * 5. **update** → affected when ANY of:
 *    - a field used by the filter changed (`filterFields ∩ changedFields`), because the
 *      row may enter or leave the result set;
 *    - a sort field changed, because the row's position in the body changes;
 *    - `projectedFields === null` (all fields selected) or a projected field changed,
 *      because the serialized body is stale;
 *    otherwise `false`.
 *
 * Field comparison is dotted-path aware: `meta` and `meta.status` conflict in either
 * direction, because patching `meta` rewrites `meta.status` and reading `meta` sees it.
 */
export function bodyAffectedByWrite(dependency: ListBodyDependency, change: WriteChange): boolean {
  // Rule 1: unfiltered bodies embed every row.
  if (dependency.unfiltered) return true;

  // Rule 2: unreasoned dependency → evict.
  if (!dependency.precise || dependency.equality === null) return true;

  switch (change.kind) {
    case "create":
      // Rule 3: membership of the new row decides both content and ordering.
      if (!change.rowAfter) return true;
      return rowMatchesEquality(dependency.equality, change.rowAfter);

    case "delete":
      // Rule 4: the body loses the row iff the filter could have matched it.
      if (!change.rowBefore) return true;
      return rowMatchesEquality(dependency.equality, change.rowBefore);

    case "update": {
      // Rule 5a: filter membership may change.
      if (intersects(dependency.filterFields, change.changedFields)) return true;
      // Rule 5b: the row's position in the body may change.
      if (intersects(dependency.sortFields, change.changedFields)) return true;
      // Rule 5c: the serialized row is stale.
      if (dependency.projectedFields === null) return true;
      if (intersects(dependency.projectedFields, change.changedFields)) return true;
      return false;
    }

    default:
      // Exhaustive for `WriteKind`; a value from an untyped caller stays safe.
      return true;
  }
}
