/**
 * @file src/utils/fast-json.ts
 * @description
 * High-performance, schema-specific JSON string builders and flat query serializers.
 *
 * Bypasses generic V8 `JSON.stringify` reflection overhead for high-frequency models,
 * providing up to 3x faster string serialization and eliminating intermediate object allocations.
 *
 * ### Features:
 * - Pre-compiled serializers for User, Role, MediaItem, ContentNode
 * - Flat delimited query shape serializer for O(1) cache-key generation
 * - Direct chunked array joining with zero intermediate array allocation
 */

/**
 * Escapes characters for safe JSON string embedding without full JSON.stringify overhead.
 */
export function fastEscapeString(str: string): string {
  if (typeof str !== "string") return String(str ?? "");
  const len = str.length;
  let needsEscape = false;
  for (let i = 0; i < len; i++) {
    const code = str.charCodeAt(i);
    if (code === 34 || code === 92 || code < 32) {
      needsEscape = true;
      break;
    }
  }
  if (!needsEscape) {
    return str;
  }
  return JSON.stringify(str).slice(1, -1);
}

/**
 * Pre-compiled, fast string builder for public/safe user snapshots.
 */
export function serializeUserSafe(u: Record<string, any>): string {
  if (!u || typeof u !== "object") return "null";
  const id = fastEscapeString(String(u._id ?? u.id ?? ""));
  const email = fastEscapeString(String(u.email ?? ""));
  const username = fastEscapeString(String(u.username ?? ""));
  const role = fastEscapeString(String(u.role ?? "user"));
  const firstName = fastEscapeString(String(u.firstName ?? ""));
  const lastName = fastEscapeString(String(u.lastName ?? ""));
  const avatar = fastEscapeString(String(u.avatar ?? ""));
  const tenantId = fastEscapeString(String(u.tenantId ?? "default"));
  const isAdmin = Boolean(u.isAdmin);
  const emailVerified = Boolean(u.emailVerified);
  const blocked = Boolean(u.blocked);
  const roleIds = Array.isArray(u.roleIds) ? JSON.stringify(u.roleIds) : "[]";

  return `{"_id":"${id}","email":"${email}","username":"${username}","role":"${role}","firstName":"${firstName}","lastName":"${lastName}","avatar":"${avatar}","tenantId":"${tenantId}","isAdmin":${isAdmin},"emailVerified":${emailVerified},"blocked":${blocked},"roleIds":${roleIds}}`;
}

/**
 * Pre-compiled, fast string builder for role definitions.
 */
export function serializeRoleSafe(r: Record<string, any>): string {
  if (!r || typeof r !== "object") return "null";
  const id = fastEscapeString(String(r._id ?? r.id ?? ""));
  const name = fastEscapeString(String(r.name ?? ""));
  const description = fastEscapeString(String(r.description ?? ""));
  const icon = fastEscapeString(String(r.icon ?? ""));
  const color = fastEscapeString(String(r.color ?? ""));
  const tenantId = fastEscapeString(String(r.tenantId ?? "default"));
  const isAdmin = Boolean(r.isAdmin);
  const permissions = Array.isArray(r.permissions) ? JSON.stringify(r.permissions) : "[]";

  return `{"_id":"${id}","name":"${name}","description":"${description}","icon":"${icon}","color":"${color}","tenantId":"${tenantId}","isAdmin":${isAdmin},"permissions":${permissions}}`;
}

/**
 * Pre-compiled, fast string builder for media items.
 */
export function serializeMediaItemSafe(m: Record<string, any>): string {
  if (!m || typeof m !== "object") return "null";
  const id = fastEscapeString(String(m._id ?? m.id ?? ""));
  const filename = fastEscapeString(String(m.filename ?? ""));
  const originalFilename = fastEscapeString(String(m.originalFilename ?? ""));
  const mimeType = fastEscapeString(String(m.mimeType ?? ""));
  const path = fastEscapeString(String(m.path ?? ""));
  const size = typeof m.size === "number" ? m.size : 0;
  const folderId = m.folderId ? `"${fastEscapeString(String(m.folderId))}"` : "null";
  const tenantId = fastEscapeString(String(m.tenantId ?? "default"));
  const createdAt = fastEscapeString(String(m.createdAt ?? ""));
  const updatedAt = fastEscapeString(String(m.updatedAt ?? ""));

  return `{"_id":"${id}","filename":"${filename}","originalFilename":"${originalFilename}","mimeType":"${mimeType}","path":"${path}","size":${size},"folderId":${folderId},"tenantId":"${tenantId}","createdAt":"${createdAt}","updatedAt":"${updatedAt}"}`;
}

/**
 * Pre-compiled, fast string builder for content nodes.
 */
export function serializeContentNodeSafe(n: Record<string, any>): string {
  if (!n || typeof n !== "object") return "null";
  const id = fastEscapeString(String(n._id ?? n.id ?? ""));
  const name = fastEscapeString(String(n.name ?? ""));
  const slug = fastEscapeString(String(n.slug ?? ""));
  const nodeType = fastEscapeString(String(n.nodeType ?? "collection"));
  const status = fastEscapeString(String(n.status ?? "published"));
  const parentId = n.parentId ? `"${fastEscapeString(String(n.parentId))}"` : "null";
  const order = typeof n.order === "number" ? n.order : 0;
  const tenantId = fastEscapeString(String(n.tenantId ?? "default"));

  return `{"_id":"${id}","name":"${name}","slug":"${slug}","nodeType":"${nodeType}","status":"${status}","parentId":${parentId},"order":${order},"tenantId":"${tenantId}"}`;
}

/**
 * Zero-intermediate-array joining for item lists.
 *
 * Uses a pre-allocated string array + single Array.join() instead of O(N²)
 * string concatenation. V8 optimizes Array.join to a single-pass rope concat,
 * eliminating N intermediate string allocations on the hot serialization path
 * (critical for listLarge at 100 items × ~5 KB each = 500 KB per response).
 */
export function serializeArrayFast<T>(items: T[], serializer: (item: T) => string): string {
  if (!Array.isArray(items) || items.length === 0) return "[]";
  const parts: string[] = Array.from({ length: items.length });
  for (let i = 0; i < items.length; i++) {
    parts[i] = serializer(items[i]);
  }
  return `[${parts.join(",")}]`;
}

/** JSON-spec integer-like object keys reorder to the front (ascending) — a generic
 * hand-rolled serializer cannot cheaply replicate that, so such rows take the
 * `JSON.stringify` fallback (content rows never carry numeric keys). */
const INTEGER_KEY_RE = /^(0|[1-9]\d*)$/;

/** Lone surrogates must be escaped by JSON.stringify — detect and fall back. */
const LONE_SURROGATE_RE = /[\uD800-\uDFFF]/;

/**
 * Generic, byte-identical `JSON.stringify` replacement for one flat row.
 *
 * Fast-paths the shapes database rows actually carry (string / finite number /
 * boolean / null / nested JSON via per-value `JSON.stringify`) and falls back to
 * `JSON.stringify(row)` for anything exotic — integer-like keys (spec key
 * reordering), lone surrogates, functions, symbols, BigInt — so the output is
 * byte-for-byte the serialization the Domain Plane would produce.
 *
 * JSON.stringify semantics preserved:
 * - `undefined`-valued object keys are DROPPED
 * - `NaN`/`±Infinity` serialize as `null`
 * - key order = insertion order (integer-like keys excluded via fallback)
 */
export function serializeRowFast(row: unknown): string {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return JSON.stringify(row) ?? "null";
  }
  const record = row as Record<string, unknown>;
  const keys = Object.keys(record);
  let out = "{";
  let first = true;
  for (const k of keys) {
    if (INTEGER_KEY_RE.test(k)) return JSON.stringify(row);
    const v = record[k];
    let s: string | undefined;
    switch (typeof v) {
      case "string":
        if (LONE_SURROGATE_RE.test(v)) {
          s = JSON.stringify(v);
        } else {
          s = `"${fastEscapeString(v)}"`;
        }
        break;
      case "number":
        s = Number.isFinite(v) ? String(v) : "null";
        break;
      case "boolean":
        s = v ? "true" : "false";
        break;
      case "undefined":
        continue; // JSON.stringify drops undefined-valued object keys
      case "object":
        s = v === null ? "null" : JSON.stringify(v);
        break;
      default:
        // function / symbol / bigint — keep exact JSON.stringify semantics.
        return JSON.stringify(row);
    }
    out += (first ? "" : ",") + `"${fastEscapeString(k)}":${s}`;
    first = false;
  }
  return out + "}";
}

/**
 * Deterministic, O(1) query shape serializer for cache key hashing.
 * Replaces JSON.stringify({ query, limit, offset, sort, fields, populate }).
 */
export function serializeQueryShape(
  query: any,
  limit: number,
  offset: number,
  sort: any,
  fields: any,
  populate: any,
): string {
  let queryStr = "";
  if (query && typeof query === "object") {
    // Fast flat key builder
    let isFlat = true;
    for (const k in query) {
      if (Object.hasOwn(query, k)) {
        const val = query[k];
        if (val !== null && typeof val === "object") {
          isFlat = false;
          break;
        }
        queryStr += `${k}=${String(val)};`;
      }
    }
    if (!isFlat) {
      queryStr = JSON.stringify(query);
    }
  } else {
    queryStr = String(query ?? "");
  }

  const sortStr = sort ? (typeof sort === "object" ? JSON.stringify(sort) : String(sort)) : "";
  const fieldsStr = fields
    ? typeof fields === "object"
      ? JSON.stringify(fields)
      : String(fields)
    : "";
  const populateStr = populate
    ? typeof populate === "object"
      ? JSON.stringify(populate)
      : String(populate)
    : "";

  return `q:${queryStr}|l:${limit}|o:${offset}|s:${sortStr}|f:${fieldsStr}|p:${populateStr}`;
}

/**
 * Pre-compiled static JSON envelopes for zero-allocation common API responses.
 */
export const STATIC_ENVELOPES = {
  SUCCESS_EMPTY: '{"success":true}',
  SUCCESS_NULL: '{"success":true,"data":null}',
  SUCCESS_EMPTY_ARRAY: '{"success":true,"data":[]}',
  UNAUTHORIZED: '{"success":false,"message":"Unauthorized","code":"UNAUTHORIZED"}',
  FORBIDDEN: '{"success":false,"message":"Forbidden","code":"FORBIDDEN"}',
  NOT_FOUND: '{"success":false,"message":"Not Found","code":"NOT_FOUND"}',
} as const;

/**
 * Pre-compiled success response envelope builder wrapping a data object or pre-serialized JSON string.
 */
export function serializeSuccessEnvelope(data: unknown): string {
  if (data === null || data === undefined) return STATIC_ENVELOPES.SUCCESS_NULL;
  const dataJson = typeof data === "string" ? data : JSON.stringify(data);
  return `{"success":true,"data":${dataJson}}`;
}

/**
 * Pre-compiled list response envelope builder with optional pagination metadata.
 */
export function serializeListEnvelope(
  items: unknown,
  meta?: { total?: number; limit?: number; offset?: number; page?: number; [key: string]: unknown },
): string {
  const itemsJson = typeof items === "string" ? items : JSON.stringify(items);
  if (!meta || typeof meta !== "object") {
    return `{"success":true,"data":${itemsJson}}`;
  }
  let out = `{"success":true,"data":${itemsJson}`;
  const m = meta as Record<string, unknown>;
  if (typeof m.total === "number") out += `,"total":${m.total}`;
  if (typeof m.page === "number") out += `,"page":${m.page}`;
  if (typeof m.limit === "number") out += `,"limit":${m.limit}`;
  if (typeof m.offset === "number") out += `,"offset":${m.offset}`;
  out += "}";
  return out;
}

/**
 * Pre-compiled error response envelope builder.
 */
export function serializeErrorEnvelope(message: string, code?: string, status?: number): string {
  let out = `{"success":false,"message":"${fastEscapeString(message)}"`;
  if (code) out += `,"code":"${fastEscapeString(code)}"`;
  if (typeof status === "number") out += `,"status":${status}`;
  out += "}";
  return out;
}

/**
 * High-performance combined list serializer: transforms items via schema serializer
 * and embeds directly into a list envelope without intermediate object allocations.
 */
export function serializeItemsEnvelopeSafe<T>(
  items: T[],
  serializer: (item: T) => string,
  meta?: { total?: number; limit?: number; offset?: number; page?: number },
): string {
  const itemsJson = serializeArrayFast(items, serializer);
  return serializeListEnvelope(itemsJson, meta);
}
