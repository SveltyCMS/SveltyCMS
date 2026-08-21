/**
 * @file src/services/security/field-permission-service.ts
 * @description
 * Field-level read permissions — cached, DB-driven via system settings.
 *
 * Adds a field-granularity layer on top of endpoint-level RBAC: a role may be
 * allowed to call `/api/collections/posts` (endpoint permission) but only read
 * `title`/`body` — never `internal_notes` or `revenue`.
 *
 * ### Configuration (private setting `FIELD_PERMISSIONS`, JSON object)
 * ```json
 * {
 *   "posts": {
 *     "editor": ["title", "body", "slug"],
 *     "writer": ["title"]
 *   }
 * }
 * ```
 * Meaning: for collection `posts`, role `editor` may READ only the listed
 * fields; `writer` only `title`. Admins and roles without an entry keep full
 * access. An absent / empty config disables filtering entirely (zero cost).
 *
 * ### Features:
 * - module-level memo with TTL (60s) + explicit invalidation on settings change
 * - sync fast-path (`getPrivateSettingSync`) — no async hop on the hot path
 * - admin fast-path — admins always see every field
 * - recursive stripping of nested objects inside list/entry payloads
 * - best-effort: config parse failure degrades to "no filtering"
 */

import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { logger } from "@utils/logger";
import { enforceFieldAccess } from "@utils/field-access";
import type { FieldInstance } from "@src/content/types";
import type { User } from "@src/databases/auth/types";

/** Shape of the FIELD_PERMISSIONS setting. */
export type FieldPermissionConfig = Record<string, Record<string, string[]>>;

const CONFIG_TTL_MS = 60_000;
let cachedConfig: FieldPermissionConfig | null = null;
let cachedAt = 0;
let hasConfig = false;
const cachedAllowedSets = new Map<string, Set<string> | null>();

/**
 * Returns the parsed field-permission config (memoized, 60s TTL).
 * Returns `null` when the feature is disabled or unparseable.
 */
export function getFieldPermissionConfig(): FieldPermissionConfig | null {
  const now = Date.now();
  if (cachedConfig !== null && now - cachedAt < CONFIG_TTL_MS) return cachedConfig;
  if (cachedConfig === null && hasConfig && now - cachedAt < CONFIG_TTL_MS) return null;

  let parsed: FieldPermissionConfig | null = null;
  try {
    const raw = getPrivateSettingSync("FIELD_PERMISSIONS") as unknown;
    if (raw && typeof raw === "object") {
      parsed = raw as FieldPermissionConfig;
    } else if (typeof raw === "string" && raw.trim()) {
      const maybe = JSON.parse(raw);
      if (maybe && typeof maybe === "object") parsed = maybe as FieldPermissionConfig;
    }
  } catch (err) {
    logger.warn("[FieldPermissions] Invalid FIELD_PERMISSIONS config:", err);
    parsed = null;
  }

  hasConfig = parsed !== null && Object.keys(parsed).length > 0;
  cachedConfig = parsed;
  cachedAt = now;
  cachedAllowedSets.clear();
  return hasConfig ? parsed : null;
}

/** Drop the memo so the next request re-reads the setting (settings save). */
export function invalidateFieldPermissionCache(): void {
  cachedConfig = null;
  hasConfig = false;
  cachedAt = 0;
  cachedAllowedSets.clear();
}

/**
 * Returns the pre-compiled allowed field Set for a (collection, role) pair.
 * Returns `null` when there is no restrictive policy for this role (full access).
 */
export function getAllowedFieldSet(
  collection: string,
  role: string | undefined,
): Set<string> | null {
  if (!role || !collection) return null;
  const config = getFieldPermissionConfig();
  if (!config) return null;

  const key = `${collection}:${role}`;
  if (cachedAllowedSets.has(key)) {
    return cachedAllowedSets.get(key) ?? null;
  }

  const allowed = config[collection]?.[role];
  if (!allowed || allowed.length === 0) {
    cachedAllowedSets.set(key, null);
    return null;
  }

  const set = new Set<string>(allowed);
  set.add("_id"); // `_id` is the record identity — never strip it.
  cachedAllowedSets.set(key, set);
  return set;
}

/**
 * Strips fields the role may not read from a single entry object.
 * Mutates a shallow copy — the input object is left untouched.
 * Roles without an explicit policy keep full access.
 */
export function filterEntryFields<T extends Record<string, unknown>>(
  entry: T,
  collection: string,
  role: string | undefined,
  isAdmin = false,
  precomputedAllowedSet?: Set<string> | null,
): T {
  if (isAdmin || !entry || typeof entry !== "object") return entry;
  if (!role) return entry;

  const allowedSet =
    precomputedAllowedSet !== undefined
      ? precomputedAllowedSet
      : getAllowedFieldSet(collection, role);

  if (!allowedSet) return entry; // no policy → full access

  const result: Record<string, unknown> = {};
  for (const key in entry) {
    if (Object.hasOwn(entry, key) && allowedSet.has(key)) {
      result[key] = entry[key];
    }
  }
  return result as T;
}

/**
 * Applies field-level filtering to an API response body. Handles the common
 * shapes produced by collection handlers: `{ data: T[] }`, `{ data: T }`,
 * a bare array, or a bare object. Unknown shapes pass through untouched.
 */
export function applyFieldPermissionsToBody(
  body: unknown,
  collection: string | null,
  role: string | undefined,
  isAdmin = false,
): unknown {
  if (isAdmin || !collection || !body || !role) return body;

  // Pre-resolve the allowed Set once per response (avoid per-item resolution)
  const allowedSet = getAllowedFieldSet(collection, role);
  if (!allowedSet) return body;

  const filterEntry = <T extends Record<string, unknown>>(item: T): T =>
    filterEntryFields(item, collection, role, isAdmin, allowedSet);

  if (Array.isArray(body)) {
    const arr = body as unknown[];
    const res: unknown[] = [];
    for (let i = 0; i < arr.length; i++) {
      const item = arr[i];
      res.push(
        item && typeof item === "object" && !Array.isArray(item)
          ? filterEntry(item as Record<string, unknown>)
          : item,
      );
    }
    return res;
  }

  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      const arr = record.data as unknown[];
      const filteredData: unknown[] = [];
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        filteredData.push(
          item && typeof item === "object" && !Array.isArray(item)
            ? filterEntry(item as Record<string, unknown>)
            : item,
        );
      }
      return {
        ...record,
        data: filteredData,
      };
    }
    if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
      return {
        ...record,
        data: filterEntry(record.data as Record<string, unknown>),
      };
    }
    // Bare object (e.g. a single entry or a stats payload) — filter it.
    return filterEntry(record);
  }

  return body;
}

/**
 * Extracts the collection name from an API path, or `null` when the path is
 * not a collection-data route. Handles `/api/collections/{name}...` and
 * `/api/content/{name}...` plus the LocalSDK `/api/local/...` prefix.
 */
export function getCollectionFromPath(pathname: string): string | null {
  if (!pathname || !pathname.startsWith("/api/")) return null;
  const parts = pathname.split("/").filter(Boolean); // ["api", ...]
  // /api/local/collections/{name}
  if (parts[1] === "local") return parts[3] ?? null;
  // /api/collections/{name}
  if (parts[1] === "collections") return parts[2] ?? null;
  // /api/content/{name}
  if (parts[1] === "content") return parts[2] ?? null;
  return null;
}

/**
 * True when any field in the schema declares per-field restrictions
 * (`readRoles` / `writeRoles` / `requiredAuth` / hidden / private visibility).
 * Collections without guarded fields skip the write guard entirely (zero cost).
 */
export function hasGuardedFields(fields: FieldInstance[]): boolean {
  for (const field of fields) {
    const p = field.permissions;
    if (p) {
      if (Array.isArray(p.readRoles) && p.readRoles.length > 0) return true;
      if (Array.isArray(p.writeRoles) && p.writeRoles.length > 0) return true;
      if (p.requiredAuth) return true;
    }
    const extra = field as { hidden?: boolean; visibility?: string };
    if (extra.hidden || extra.visibility === "hidden" || extra.visibility === "private") {
      return true;
    }
  }
  return false;
}

// Schema-field memo: schema changes are rare (collection-builder save /
// refresh), so a short TTL keeps the mutation path DB-free while never
// enforcing against a stale schema for more than 30s.
const fieldSchemaCache = new Map<string, { fields: FieldInstance[]; at: number }>();
const FIELD_SCHEMA_CACHE_TTL_MS = 30_000;
const FIELD_SCHEMA_CACHE_MAX = 64;

/**
 * Returns the field list for a collection (memoized, 30s TTL), or `null` when
 * the collection is unknown or schema loading fails.
 */
export async function getCollectionFields(
  collection: string,
  tenantId: string | null,
): Promise<FieldInstance[] | null> {
  const key = `${tenantId || "global"}:${collection}`;
  const hit = fieldSchemaCache.get(key);
  if (hit && Date.now() - hit.at < FIELD_SCHEMA_CACHE_TTL_MS) return hit.fields;

  try {
    try {
      const { contentStore } = await import("@src/stores/content-registry.svelte");
      const inMemory = contentStore.getCollection(collection, tenantId);
      if (inMemory?.fields && inMemory.fields.length > 0) {
        const fields = inMemory.fields as FieldInstance[];
        if (fieldSchemaCache.size >= FIELD_SCHEMA_CACHE_MAX) {
          const oldest = fieldSchemaCache.keys().next().value;
          if (oldest) fieldSchemaCache.delete(oldest);
        }
        fieldSchemaCache.set(key, { fields, at: Date.now() });
        return fields;
      }
    } catch {
      /* content store may not be initialized yet — fall through to adapter */
    }

    const { dbAdapter } = await import("@src/databases/db");
    const res = await dbAdapter.collection.listSchemas(tenantId as any);
    let fields: FieldInstance[] | null = null;
    if (res?.success && res.data) {
      const schema = res.data.find((c) => c.name === collection);
      fields = (schema?.fields as FieldInstance[]) || null;
    }
    if (fields && fields.length > 0) {
      // Bound the map — evict the oldest entry when over budget.
      if (fieldSchemaCache.size >= FIELD_SCHEMA_CACHE_MAX) {
        const oldest = fieldSchemaCache.keys().next().value;
        if (oldest) fieldSchemaCache.delete(oldest);
      }
      fieldSchemaCache.set(key, { fields, at: Date.now() });
    }
    return fields;
  } catch (err) {
    logger.warn(`[FieldWriteGuard] Schema load failed for ${collection}:`, err);
    return null;
  }
}

/**
 * Enforces the schema-level write guard for a mutation payload. Throws
 * `AppError(403, "FORBIDDEN")` + `UNAUTHORIZED_ACCESS` audit event when the
 * caller's role lacks `writeRoles` on any present guarded field. Admin /
 * system callers and collections without guarded fields are skipped (zero
 * cost) — `enforceFieldAccess` also fast-paths admin internally.
 */
export async function assertWriteAllowed(
  fields: FieldInstance[],
  body: Record<string, unknown>,
  user: User | { _id: string; role: string } | null | undefined,
  context?: { collectionName?: string; entryId?: string; tenantId?: string },
): Promise<void> {
  if (!fields || fields.length === 0) return;
  if (!hasGuardedFields(fields)) return;
  await enforceFieldAccess(fields, body, user, "write", context);
}
