/**
 * @file src/databases/core/query-primitives.ts
 * @description Consolidated query and ID primitives for database adapters.
 * Combines enterprise RFC 9562 UUIDv7 validation, zero-allocation primary key lookup
 * parsing, and partial JSON patch markers into a high-cohesion core module.
 *
 * ### Features:
 * - RFC 9562 UUIDv7 validation via precomputed 256-entry lookup table (zero allocations)
 * - Single-pass primary key lookup detection (findOne by _id / id routing)
 * - WeakMap partial JSON `data` patch tracking for atomic SQL updates without column replacement
 * - Fail-closed JSON data blob parsing supporting double-encoded dialect payloads
 */

// ---------------------------------------------------------------------------
// 1. Enterprise ID Contract (RFC 9562 UUIDv7)
// ---------------------------------------------------------------------------

const HEX_LUT = new Uint8Array(256);
for (let i = 48; i <= 57; i++) HEX_LUT[i] = 1; // 0-9
for (let i = 65; i <= 70; i++) HEX_LUT[i] = 1; // A-F
for (let i = 97; i <= 102; i++) HEX_LUT[i] = 1; // a-f

/** Compact (32-hex) form: version nibble sits at index 12, variant at index 16. */
function isUuid32(str: string): boolean {
  if (str.charCodeAt(12) !== 55) return false; // version '7' only
  const variant = str.charCodeAt(16);
  const variantLower = variant | 32;
  if (variantLower !== 97 && variantLower !== 98 && variant !== 56 && variant !== 57) {
    return false; // RFC variant 1 only
  }
  for (let i = 0; i < 32; i++) {
    if (HEX_LUT[str.charCodeAt(i)] === 0) return false;
  }
  return true;
}

function isUuid36(str: string): boolean {
  // 1. Dash checks: fail-fast if dashes are not at 8, 13, 18, 23
  if (
    str.charCodeAt(8) !== 45 ||
    str.charCodeAt(13) !== 45 ||
    str.charCodeAt(18) !== 45 ||
    str.charCodeAt(23) !== 45
  ) {
    return false;
  }

  // 2. Version check: Strict RFC 9562 v7 (ASCII 55 = '7') at pos 14
  if (str.charCodeAt(14) !== 55) {
    return false;
  }

  // 3. Variant check: RFC 4122/9562 variant 1 (0b10xx -> [8, 9, a, b, A, B]) at pos 19
  const variant = str.charCodeAt(19);
  const variantLower = variant | 32;
  if (variantLower !== 97 && variantLower !== 98 && variant !== 56 && variant !== 57) {
    return false;
  }

  // 4. Segmented hex scans: avoids checking `i === 8 || i === 13 || i === 18 || i === 23`
  // on every iteration, and skips already-verified version (pos 14) and variant (pos 19)
  for (let i = 0; i < 8; i++) if (HEX_LUT[str.charCodeAt(i)] === 0) return false;
  for (let i = 9; i < 13; i++) if (HEX_LUT[str.charCodeAt(i)] === 0) return false;
  for (let i = 15; i < 18; i++) if (HEX_LUT[str.charCodeAt(i)] === 0) return false;
  for (let i = 20; i < 23; i++) if (HEX_LUT[str.charCodeAt(i)] === 0) return false;
  for (let i = 24; i < 36; i++) if (HEX_LUT[str.charCodeAt(i)] === 0) return false;

  return true;
}

/**
 * Validates a string against the enterprise `_id` contract:
 * RFC 9562 UUIDv7 in dashed (36 chars) or compact (32-hex) form. UUIDv4 and
 * every other legacy version are rejected — one strict contract, no fallbacks.
 */
export function validateId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const len = id.length;
  if (len === 36) return isUuid36(id);
  if (len === 32) return isUuid32(id);
  return false;
}

// ---------------------------------------------------------------------------
// 2. Primary Key Lookup Detection
// ---------------------------------------------------------------------------

export interface IdLookupResult {
  id: string;
  tenantId?: string | null;
  /** Scalar equality only (`status: "publish"`). Operator objects need full translation. */
  status?: string;
}

/**
 * Single-pass primary key lookup parser.
 * Returns `{ id, tenantId?, status? }` for `{ _id }` / `{ id }` plus optional
 * `tenantId`, scalar `status`, and `isDeleted: false`.
 * Returns `null` if the query contains other filters/operators.
 */
export function parseIdLookup(query: unknown): IdLookupResult | null {
  if (!query || typeof query !== "object" || Array.isArray(query)) return null;

  let count = 0;
  let id: string | null = null;
  let tenantId: string | null | undefined = undefined;
  let status: string | undefined;

  for (const key in query as Record<string, unknown>) {
    count++;
    if (count > 4) return null;
    if (key === "_id" || key === "id") {
      const val = (query as Record<string, unknown>)[key];
      // Reject operator objects ($in, $eq, …) — those need full translation
      if (val !== null && typeof val === "object") return null;
      if (val === undefined || val === null || val === "") return null;
      id = String(val);
    } else if (key === "tenantId") {
      const tid = (query as Record<string, unknown>).tenantId;
      if (tid === undefined) {
        tenantId = undefined;
      } else if (tid === null || tid === "") {
        tenantId = null;
      } else {
        tenantId = String(tid);
      }
    } else if (key === "status") {
      const st = (query as Record<string, unknown>).status;
      if (typeof st !== "string" || st.length === 0) return null;
      status = st;
    } else if (key === "isDeleted") {
      const del = (query as Record<string, unknown>).isDeleted;
      if (del === false || del === 0 || del === undefined) {
        continue;
      }
      return null;
    } else {
      return null;
    }
  }

  if (id === null || count === 0) return null;
  const out: IdLookupResult = { id };
  if (tenantId !== undefined) out.tenantId = tenantId;
  if (status !== undefined) out.status = status;
  return out;
}

/**
 * After a PK fetch, drop the row when a scalar status predicate does not match.
 * Used so `{ _id, status: "publish" }` stays on the findById ultra path without
 * leaking drafts to publication-clamped callers.
 */
export function applyLookupStatus<T>(row: T | null | undefined, lookup: IdLookupResult): T | null {
  if (row == null) return null;
  if (lookup.status !== undefined && (row as { status?: unknown }).status !== lookup.status) {
    return null;
  }
  return row;
}

/**
 * True when `query` is a primary-key lookup (optional tenantId / scalar status /
 * isDeleted: false).
 */
export function isIdLookupQuery(query: unknown): boolean {
  return parseIdLookup(query) !== null;
}

/** Scalar status predicate on an id-lookup query, if any. */
export function extractLookupStatus(query: unknown): string | undefined {
  return parseIdLookup(query)?.status;
}

/**
 * Extract scalar primary key from an id-lookup query, or null if not a lookup.
 */
export function extractLookupId(query: unknown): string | null {
  return parseIdLookup(query)?.id ?? null;
}

/**
 * `_id` (optional tenantId / isDeleted:false) suitable as an INSERT conflict
 * target. Queries that also pin `status` are rejected — ON CONFLICT (_id)
 * would overwrite a row the findOne+update path would miss.
 */
export function extractPkConflictId(query: unknown): string | null {
  const lookup = parseIdLookup(query);
  if (!lookup || lookup.status !== undefined) return null;
  return lookup.id;
}

/**
 * Tenant id present on the query object (if any).
 */
export function extractLookupTenantId(query: unknown): string | null | undefined {
  return parseIdLookup(query)?.tenantId;
}

// ---------------------------------------------------------------------------
// 3. JSON Data Blob Partial Patching
// ---------------------------------------------------------------------------

const jsonDataPatches = new WeakMap<object, Record<string, unknown>>();

/** Mark prepared values as a partial-update patch of the JSON `data` column. */
export function setJsonDataPatch(values: object, patch: Record<string, unknown>): void {
  jsonDataPatches.set(values, patch);
}

/** The patch to merge into `data`, or `undefined` when this is a full-document write. */
export function getJsonDataPatch(values: object): Record<string, unknown> | undefined {
  return jsonDataPatches.get(values);
}

/** Drop the marker — the caller has already produced a complete blob. */
export function clearJsonDataPatch(values: object): void {
  jsonDataPatches.delete(values);
}

/**
 * Does this patch contain values that `json_patch` / `JSON_MERGE_PATCH` express
 * differently from a shallow merge? RFC 7396 merges objects recursively and
 * removes keys patched with `null`; the contract here (MongoDB `$set` parity) is a
 * shallow merge that keeps explicit nulls. Everything else — strings, numbers,
 * booleans, dates, arrays — is replaced identically by both, so those patches can
 * use the SQL operator at zero cost.
 */
export function jsonPatchNeedsJsMerge(patch: Record<string, unknown>): boolean {
  for (const key in patch) {
    if (!Object.hasOwn(patch, key)) continue;
    const value = patch[key];
    if (value === null) return true;
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof Uint8Array)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a stored JSON `data` column into a plain object. SQLite hands JSON back as
 * TEXT; MariaDB returns TEXT or an already-decoded object depending on the column
 * type, and can double-encode (see `mariaDoubleParseJson`). NULL, empty, malformed,
 * or non-object payloads return `null`, which callers treat as fail-closed.
 */
export function parseJsonDataBlob(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  let value: unknown = raw;
  for (let pass = 0; pass < 2; pass++) {
    if (typeof value !== "string") break;
    if (value === "") return null;
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
