/**
 * @file src/hooks/handle-collection-read-lane.ts
 * @description Warm-session GET /api/collections list or :entryId — turbo HIT or one LocalCMS read.
 *
 * A turbo miss used to `resolve()` through ~9 async hooks + SvelteKit routing
 * before the same `crud.findById` / `find` the write lane already reaches directly.
 * After turbo-auth is warm this lane serves L1 or LocalCMS and skips the rest.
 * After a write, list turbo bodies are marked stale (not deleted). This lane
 * serves the previous bytes immediately. A background `find()` refill on the
 * same thread stalled the next TURBO-HIT (~60ms) and pinned mixed/soak ~80 RPS.
 * Fresh bytes come from a true miss, `?refresh=true`, or TTL — not from GET.
 *
 * ### Features:
 * - GET/HEAD `/api/collections/:collection` (list) or `/:collection/:entryId`
 * - Requires a warm turbo-auth session (cold requests fall through)
 * - Runs the same path/query/header threat scan as `handleSecurity` before
 *   any cache or database read. Heap shedding and the Redis WAF limiter stay
 *   on the full hook.
 * - Non-admins whose schema declares a field guard fall through; the SDK
 *   redacts that response. Admins and unguarded schemas stay on this lane.
 * - Stashes turbo L1 on first set (point-reads use a dedicated FIFO)
 * - Serve-stale lists after write; single-flight only on true miss
 * - Trims the point-read payload through the shared `trimPointReadEnvelope`
 *   helper (byte-identity with the `handleCollectionEntry` dispatcher fallback)
 * - Labels every owned response: `X-Cache: TURBO-HIT` on hit, `MISS`/`BYPASS`
 *   on the rebuild, so lane attribution is never ambiguous
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { AppError, handleApiError } from "@utils/error-handling";
import { wafGuard } from "./handle-waf-guard";
import { isAiOrScannerBot, isHoneypotPath } from "@src/services/security/threat-scan";
import { isSecureCookieContext, readSessionCookie, isAdmin } from "@src/databases/auth/constants";
import {
  hasPermissionBitmask,
  isPermissionBitsetStale,
} from "@src/databases/auth/permission-bitmask";
import {
  getAllowedFieldSet,
  hasGuardedFields,
} from "@src/services/security/field-permission-service";
import { getTurboAuthContext, serveTurboCacheEntry } from "./handle-turbo-get";
import {
  STASH_MAX_BYTES,
  STASH_MIN_BYTES,
  scheduleTurboVariantStash,
} from "./response-compression-stash";
import {
  compressAsync,
  compressSync,
  hasNativeCompression,
  negotiateEncoding,
  SYNC_MAX_SIZE,
} from "./handle-compression";
import { isLaneServingAllowed } from "./lane-state-gate";
import { resolveRequestTenant } from "./request-tenant";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { applyAdapterTenantContext } from "@src/databases/tenant-adapter";

import {
  responseCache,
  buildUserResponseCacheKey,
  generateContentEtag,
  collectionResponseCacheTags,
  COLLECTION_ACTION_SEGMENTS,
} from "@src/services/cache/response-cache";
import { contentStore } from "@src/stores/content-registry.svelte";
import type { DatabaseId, Schema } from "@src/content/types";
import { parseCollectionQueryParams, MAX_PAGE_SIZE } from "@utils/api-params";
import { trimPointReadEnvelope } from "@utils/point-read-payload";
import { resolvePublicationFilter } from "@utils/security/publication-policy";
import {
  serializeSuccessEnvelope,
  serializeArrayFast,
  serializeRowFast,
  STATIC_ENVELOPES,
} from "@utils/fast-json";

interface CoalescedCollectionRead {
  body: string;
  etag: string;
  /** Leader of a miss. Waiters omit this and are served as turbo hits. */
  miss?: boolean;
  response?: Response;
  /** Negotiated variant the leader already computed (also seeded into the cache). */
  compressed?: Record<string, Uint8Array>;
}

const inflightCollectionReads = new Map<string, Promise<CoalescedCollectionRead | null>>();
const MAX_INFLIGHT_COLLECTION_READS = 64;

/**
 * Stateless SDK bridge — one instance per process. `LocalCMS.getLocals()`
 * allocates a fresh facade per request (a lazy facade now — one object plus
 * five CRUD closures, namespaces resolved on read); the lane only ever reads
 * `collections.findById`/`find` with explicit user/tenant options, so a cached
 * instance serves identical results without the per-request allocation on the
 * hot miss path.
 */
let laneCms: LocalCMS | null = null;
function getLaneCms(): LocalCMS | null {
  if (!dbAdapter) return null;
  if (!laneCms) laneCms = new LocalCMS(dbAdapter);
  return laneCms;
}

/**
 * FLAC exemption for the lane (fail closed).
 *
 * The lane emits its own `Response` and therefore never runs
 * `handleTokenResolution`, which is where the read path applies
 * `applyFieldPermissionsToBody`. The lane may serve a caller only when their
 * field view is provably the stored one:
 *
 * 1. no `FIELD_PERMISSIONS` policy for this collection + role, and
 * 2. the compiled schema declares no guarded field (`readRoles`, `writeRoles`,
 *    `requiredAuth`, hidden, or `permissions.visibility: "private"`).
 *
 * Both are cached lookups (policy config TTL + `WeakMap` on the field array), so
 * the check costs nothing measurable on the hot path. Anything else falls
 * through to the pipeline, which redacts.
 */
function isLaneFlacExempt(
  collectionId: string,
  tenantId: string | null,
  role: string | undefined,
): boolean {
  try {
    if (getAllowedFieldSet(collectionId, role)) return false;
    const schema = contentStore.getCollection(collectionId, tenantId as string) as
      | { fields?: unknown[] }
      | undefined;
    const fields = schema?.fields;
    return !Array.isArray(fields) || !hasGuardedFields(fields as never);
  } catch {
    // Fail closed: any doubt about the field policy sends the request to the
    // pipeline, which owns redaction.
    return false;
  }
}

/**
 * `pathname.split("/").filter(Boolean)` as a single-pass compaction — identical
 * segments, one array allocation instead of two. The lane runs this on every
 * request, so the extra `filter` array was pure garbage on the hot path.
 */
function splitPathSegments(pathname: string): string[] {
  const raw = pathname.split("/");
  let n = 0;
  for (let i = 0; i < raw.length; i++) {
    const segment = raw[i];
    if (segment) raw[n++] = segment;
  }
  raw.length = n;
  return raw;
}

/** True for GET/HEAD of a collection list or single entry. */
export function isSimpleCollectionRead(event: RequestEvent): boolean {
  const method = event.request.method;
  if (method !== "GET" && method !== "HEAD") return false;
  const pathname = event.url.pathname;
  if (!pathname.startsWith("/api/collections/")) return false;
  const parts = splitPathSegments(pathname);
  // ["api", "collections", collectionId] or ["api", "collections", collectionId, entryId]
  if (parts.length !== 3 && parts.length !== 4) return false;
  const collectionId = parts[2];
  if (!collectionId || COLLECTION_ACTION_SEGMENTS.has(collectionId)) {
    return false;
  }
  if (parts.length === 4) {
    const entryId = parts[3];
    if (
      COLLECTION_ACTION_SEGMENTS.has(entryId) ||
      entryId === "revisions" ||
      entryId === "export"
    ) {
      return false;
    }
  } else if (parts.length === 3) {
    // Exclude export, count-only, and explicit streaming
    const search = event.url.searchParams;
    if (search.has("export") || search.get("stream") === "true") {
      return false;
    }
  }
  return true;
}

export interface CollectionWireMeta {
  collectionId: string;
  /** Compiled default locale for this collection or tenant (e.g. "en", "de") */
  defaultLocale?: string;
  /** Set of field names in the compiled published projection */
  publishedFields: Set<string>;
  /** True if schema defines lifecycle hooks that alter document read state */
  hasAfterReadHooks: boolean;
  /** Compiled default sort field & direction (e.g. "createdAt:desc") */
  defaultSort?: string;
  /** Compiled default limit (e.g. 25) */
  defaultLimit?: number;
}

/**
 * Compiled wire-plane meta, memoized per schema object. `computeCollectionWireMeta`
 * builds a published-field Set per call; the lane compiles it once per schema
 * and reuses the result for every point read against that collection.
 */
const wireMetaCache = new WeakMap<object, CollectionWireMeta | null>();

/**
 * Computes Wire Plane compilation metadata from a loaded collection Schema.
 * Fails closed (`null`) if schema is missing or invalid.
 */
export function computeCollectionWireMeta(
  schema: Schema | undefined | null,
  tenantDefaultLocale: string = "en",
): CollectionWireMeta | null {
  if (!schema) return null;

  const collectionId = String(schema._id || schema.name || "");
  if (!collectionId) return null;

  // Compute mutating afterRead / afterFind hooks presence from schema definition
  const rawHooks = schema.hooks as Record<string, unknown> | undefined;
  const hasAfterReadHooks = Boolean(
    rawHooks?.afterRead ||
    rawHooks?.afterFind ||
    (schema as { afterRead?: unknown }).afterRead ||
    (schema as { afterFind?: unknown }).afterFind,
  );

  // Compile published fields from schema definition
  const publishedFields = new Set<string>(["_id", "createdAt", "updatedAt", "status"]);

  if (Array.isArray(schema.fields)) {
    for (const f of schema.fields as Array<{
      db_fieldName?: string;
      name?: string;
      permissions?: { visibility?: string };
    }>) {
      const fieldName = f.db_fieldName || f.name;
      // Editor-visible projection only: fields marked `visibility: "private"` are
      // excluded. This set feeds the `fields=` equality admission below; FLAC
      // redaction itself is enforced by the lane's `isLaneFlacExempt` gate
      // (readRoles / requiredAuth / hidden decline the lane entirely).
      if (fieldName && f.permissions?.visibility !== "private") {
        publishedFields.add(fieldName);
      }
    }
  }

  // Derive default locale from schema translations or tenant setting
  let defaultLocale = tenantDefaultLocale;
  if (Array.isArray(schema.translations)) {
    const defTrans = schema.translations.find((t) => t.isDefault);
    if (defTrans?.languageTag) defaultLocale = defTrans.languageTag;
  }

  return {
    collectionId,
    defaultLocale,
    publishedFields,
    hasAfterReadHooks,
    // No compiled default ORDER BY exists: an unsorted `findMany` emits none, so the
    // predicate refuses any `sort=` until a compiled list statement pins one (see
    // `normalizeSortParam`). `defaultLimit` mirrors the query parser's fallback (50) —
    // the only limit a compiled statement could claim.
    defaultLimit: 50,
  };
}

/**
 * Query parameters the Wire Plane admission rules reason about. A parameter outside
 * this set (plus the `filter[...]` / `filter.` prefixes, checked separately) fails the
 * predicate: the compiled wire body cannot honour what admission did not validate, so
 * the request must divert to the Domain Plane instead of being served while a
 * parameter is silently ignored.
 */
const WIRE_KNOWN_PARAMS = new Set([
  "fields",
  "locale",
  "status",
  "preview",
  "draft",
  "populate",
  "filter",
  "where",
  "sort",
  "limit",
  "page",
]);

/**
 * Normalizes the two spellings of an order into one comparable form:
 * `-field` → `field:desc`, `field:asc`/`field:desc` unchanged, `field` → `field:asc`.
 * The predicate compares a request's `sort=` against the collection's compiled default
 * through this, so `sort=-createdAt` and `sort=createdAt:desc` are the same request.
 */
function normalizeSortParam(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^\+/, "");
  if (!value) return null;
  if (value.startsWith("-")) return `${value.slice(1)}:desc`;
  const [field, direction] = value.split(":");
  if (field && direction) return `${field}:${direction.toLowerCase()}`;
  return `${value}:asc`;
}

/**
 * Strict Wire Plane Admission Predicate:
 * Evaluates whether a read request qualifies for the high-speed Wire Plane
 * (bypassing V8 entity hydration and streaming pre-compiled SQL projections).
 *
 * Admissible only when all hold:
 * 1. Published status: Target document/list must be published (no draft=true / preview=true / status=review).
 *    Cookies (`preview_mode`) and caller authorization are clamped via `resolvePublicationFilter`.
 * 2. Public / Full Projection Equivalence: Unauthenticated public request, or client requesting exactly
 *    the compiled published projection (`fields` parameter matches compiled projection).
 * 3. No dynamic expansions: No `populate` query param.
 * 4. Locale alignment: Either no locale parameter or locale strictly equals the collection's compiled default.
 * 5. No mutating collection hooks: The target collection defines no `afterRead`/`afterFind` hooks.
 * 6. Point vs List Predicate: Point-reads reject custom filters; list-reads reject custom filters and admit
 *    only the compiled default sort (fail closed when none is compiled) + fixed limit until Cell 3
 *    dynamic list SQL is compiled.
 *
 * Fail Closed: If `collectionMeta` is omitted or null, returns `false` (Domain Plane default).
 */
export function isWirePlaneAdmissible(
  event: RequestEvent,
  collectionMeta?: CollectionWireMeta | null,
): boolean {
  // Fail closed: Missing collection metadata defaults strictly to Domain Plane
  if (!collectionMeta) return false;

  if (!isSimpleCollectionRead(event)) return false;

  const search = event.url.searchParams;

  // 1. Published status only: query flags
  if (
    search.get("draft") === "true" ||
    search.get("status") === "draft" ||
    search.get("status") === "review" ||
    search.has("preview") ||
    search.get("preview") === "true"
  ) {
    return false;
  }

  // 1b. Published status only: preview cookies
  if (
    event.cookies.get("preview") === "true" ||
    event.cookies.get("preview_mode") === "true" ||
    event.cookies.get("svelty_preview") === "true"
  ) {
    return false;
  }

  // 1c. Publication clamp check:
  // If the client explicitly requested a status, verify that it resolves strictly to "published".
  // Note: Privileged users (admins) default to resolvePublicationFilter="all" when no status param is set,
  // but for wire point reads of published documents where draft/preview query/cookies are absent (checked in 1 & 1b),
  // serving the compiled published projection is safe and intended.
  if (search.has("status")) {
    const effectivePubFilter = resolvePublicationFilter(event.locals, search.get("status"));
    if (effectivePubFilter !== "published") {
      return false;
    }
  }

  // 2. Dynamic expansions forbidden
  if (search.has("populate")) {
    return false;
  }

  // 3. Locale alignment: Admit only no locale or collection compiled default locale
  if (search.has("locale")) {
    const requestedLocale = search.get("locale")?.trim().toLowerCase();
    const compiledDefault = (collectionMeta.defaultLocale || "en").trim().toLowerCase();
    if (requestedLocale !== compiledDefault) {
      return false;
    }
  }

  // 4. No mutating collection hooks
  if (collectionMeta.hasAfterReadHooks) {
    return false;
  }

  // 5. Projection equality check:
  // If `fields` param is provided, it must equal the compiled published projection
  if (search.has("fields")) {
    // Single-pass trim + compact: the same values as the previous
    // `.split(",").map(trim).filter(Boolean)` chain, one array instead of three.
    const requested = search.get("fields")!.split(",");
    let n = 0;
    for (const field of requested) {
      const trimmed = field.trim();
      if (trimmed) requested[n++] = trimmed;
    }
    requested.length = n;

    if (requested.length !== collectionMeta.publishedFields.size) {
      return false;
    }
    for (const f of requested) {
      if (!collectionMeta.publishedFields.has(f)) {
        return false;
      }
    }
  }

  // 6. Any filter or where parameter diverts to Domain Plane
  for (const key of search.keys()) {
    if (
      key === "filter" ||
      key.startsWith("filter[") ||
      key.startsWith("filter.") ||
      key === "where"
    ) {
      return false;
    }
  }

  // 7. Point vs List reading constraints:
  const parts = splitPathSegments(event.url.pathname);
  const isList = parts.length === 3;

  if (isList) {
    // List wire admits only the compiled default sort + fixed limit. Fail closed when no
    // default order is compiled — the statement would have to invent one — and compare the
    // two spellings of the same order (`-createdAt` / `createdAt:desc`) as equal.
    if (search.has("sort")) {
      const requestedSort = normalizeSortParam(search.get("sort"));
      const compiledSort = collectionMeta.defaultSort
        ? normalizeSortParam(collectionMeta.defaultSort)
        : null;
      if (!compiledSort || requestedSort !== compiledSort) return false;
    }
    if (
      search.has("limit") &&
      collectionMeta.defaultLimit !== undefined &&
      Number(search.get("limit")) !== collectionMeta.defaultLimit
    ) {
      return false;
    }
    if (search.has("page") && search.get("page") !== "1") {
      return false;
    }
  }

  // 8. Fail closed on any parameter the compiled wire projection cannot honour.
  for (const key of search.keys()) {
    if (WIRE_KNOWN_PARAMS.has(key)) continue;
    if (key.startsWith("filter[") || key.startsWith("filter.")) continue;
    return false;
  }

  return true;
}

/** `SVELTY_SRV_DUR=1` records server time for inspect-mixed-cycle. Off on the replica. */
const STAMP_SRV_DUR = process.env.SVELTY_SRV_DUR === "1";
/**
 * `SVELTY_SRV_SPLIT=1` decomposes a MISS rebuild into its phases and stamps
 * them on the response (`x-srv-split`): lookup (cache get), db (findById),
 * build (stringify + etag), cachewrite (responseCache.set), serve (Response
 * build). Zero cost when off; the map is only allocated on misses while on.
 */
const STAMP_SRV_SPLIT = process.env.SVELTY_SRV_SPLIT === "1";

function stampSrvSplit(headers: Headers, marks: ReadonlyMap<string, number>): void {
  if (!STAMP_SRV_SPLIT || marks.size === 0) return;
  const parts: string[] = [];
  marks.forEach((ms, label) => parts.push(`${label}=${ms.toFixed(2)}`));
  headers.set("x-srv-split", parts.join(";"));
}

/**
 * Session id from classifyRequest when the hook already parsed the cookie.
 * Direct lane calls (unit tests) still parse once here.
 */
function sessionIdOf(event: RequestEvent): string | undefined {
  const stuffed = (event.locals as { turboSessionId?: string | null }).turboSessionId;
  if (stuffed !== undefined) return stuffed ?? undefined;
  const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
  return readSessionCookie(event.cookies, isSecure);
}

function stampSrvDur(headers: Headers, started: number): void {
  if (!STAMP_SRV_DUR) return;
  headers.set("x-srv-dur", (performance.now() - started).toFixed(2));
}

/** Role name for the FLAC policy lookup — read from the resolved session user, never the client. */
function roleOf(user: unknown): string | undefined {
  const role = (user as { role?: unknown } | null | undefined)?.role;
  return typeof role === "string" ? role : undefined;
}

async function executeWarmCollectionRead(
  event: RequestEvent,
  turbo: NonNullable<ReturnType<typeof getTurboAuthContext>>,
): Promise<Response | null> {
  const { url, locals } = event;

  locals.user = turbo.user;
  locals.roles = turbo.roles;
  locals.tenantId = resolveRequestTenant(event.request, turbo.tenantId);
  locals.isAdmin = isAdmin(turbo.user);
  (locals as { __turboAuth?: boolean }).__turboAuth = true;
  locals.dbAdapter = dbAdapter as typeof locals.dbAdapter;
  (locals as { dbAdapterUnscoped?: unknown }).dbAdapterUnscoped = dbAdapter;

  // 🛡️ 64-Bit Bitmask Security Engine: check in-register bitmask first (<0.5 ns).
  // The lane answers `/api/collections` GET, whose entry in `ENDPOINT_PERMISSIONS`
  // requires `collections:read` — the lane must be exactly as strict as the
  // endpoint map, never more permissive.
  const admin = isAdmin(turbo.user);
  const isAuthorized = admin || hasPermissionBitmask(turbo.permMask ?? 0n, "collections:read");

  if (!isAuthorized) return null;

  // 🛡️ Stale grants: a role/permission mutation bumps the global epoch while this
  // context keeps its compiled mask. Decline until the pipeline re-resolves the
  // session: detecting it is one `Atomics.load`, not a database round-trip.
  if (isPermissionBitsetStale(turbo.permRev)) return null;

  const tenantP = applyAdapterTenantContext(dbAdapter, locals.tenantId ?? null);
  if (tenantP) await tenantP;

  const userId = turbo.user?._id || turbo.user?.id || null;
  const pathKey = buildUserResponseCacheKey(url.pathname, url.search, userId);
  const cacheTenant = (locals.tenantId as string | null) ?? null;
  const parts = splitPathSegments(url.pathname);
  const collectionId = parts[2];
  const entryId = parts.length === 4 ? parts[3] : null;

  // 🔐 FLAC gate — before any cache lookup, so a body stored before a policy
  // change can never outlive it. Non-exempt callers use the full pipeline, which
  // redacts in `handleTokenResolution`.
  if (!admin && !isLaneFlacExempt(collectionId, cacheTenant, roleOf(turbo.user))) {
    return null;
  }
  const listParams = !entryId ? parseCollectionQueryParams(url.searchParams) : null;
  if (listParams && (listParams.stream || listParams.limit >= MAX_PAGE_SIZE)) {
    return null;
  }

  const bypass =
    url.searchParams.get("refresh") === "true" ||
    url.searchParams.get("nocache") === "true" ||
    url.searchParams.get("bypassCache") === "true" ||
    listParams?.bypassCache === true;

  const srvT0 = STAMP_SRV_DUR || STAMP_SRV_SPLIT ? performance.now() : 0;
  const marks = STAMP_SRV_SPLIT ? new Map<string, number>() : null;
  const cached = bypass ? null : responseCache.get(pathKey, cacheTenant);
  marks?.set("lookup", performance.now() - srvT0);
  if (cached?.body) {
    const res = serveTurboCacheEntry(event, cached);
    stampSrvDur(res.headers, srvT0);
    if (!entryId && !cached.compressed) {
      // Lazy variant warm-up for LISTS only: the first re-hit is the proof that
      // a list key is actually re-read, so compressing it off the request path
      // pays for itself on later hits. Point reads are high-cardinality — a
      // variant is almost never re-served before the FIFO evicts the key — so
      // they skip the stash (and the `Buffer.byteLength` walk) entirely (see
      // response-compression-stash.ts). The stash runs after the response.
      const bodyBytes = cached.buffer?.byteLength ?? Buffer.byteLength(cached.body, "utf8");
      void scheduleTurboVariantStash({
        key: pathKey,
        body: cached.body,
        etag: cached.etag,
        byteLength: bodyBytes,
        ttlMs: cached.expiresAt ? Math.max(1_000, cached.expiresAt - Date.now()) : 300_000,
        tenantId: cacheTenant,
        setOptions: {
          tags: collectionResponseCacheTags(collectionId, null).tags,
          skipSharedL1: false,
        },
      });
    }
    return res;
  }

  const rebuilt = await coalesceCollectionRefill(
    event,
    pathKey,
    cacheTenant,
    collectionId,
    entryId,
    listParams,
    marks,
  );
  if (rebuilt) {
    // The leader is a miss. Waiters share the body the leader just cached
    // and are labelled as hits. Both use the prebuilt security headers.
    const res = rebuilt.response ?? serveTurboCacheEntry(event, rebuilt);
    marks?.set("serve", performance.now() - srvT0);
    if (rebuilt.miss) res.headers.set("X-Cache", bypass ? "BYPASS" : "MISS");
    stampSrvDur(res.headers, srvT0);
    if (marks) stampSrvSplit(res.headers, marks);
    return res;
  }
  return null;
}

async function coalesceCollectionRefill(
  event: RequestEvent,
  pathKey: string,
  cacheTenant: string | null,
  collectionId: string,
  entryId: string | null,
  listParams: ReturnType<typeof parseCollectionQueryParams> | null,
  marks: Map<string, number> | null,
): Promise<CoalescedCollectionRead | null> {
  const flightKey = `${cacheTenant ?? ""}:${pathKey}`;
  const inflight = inflightCollectionReads.get(flightKey);
  if (inflight) {
    const shared = await inflight;
    if (!shared) return null;
    // Response bodies are single-use — waiters rebuild from the shared string.
    return { body: shared.body, etag: shared.etag };
  }

  // The executor runs synchronously, so `releaseFlight` is bound before use.
  // (No `() => {}` placeholder: undefined + an optional call in `finally`.)
  let releaseFlight: ((entry: CoalescedCollectionRead | null) => void) | undefined;
  const flight = new Promise<CoalescedCollectionRead | null>((res) => {
    releaseFlight = res;
  });
  if (inflightCollectionReads.size < MAX_INFLIGHT_COLLECTION_READS) {
    inflightCollectionReads.set(flightKey, flight);
  }

  let published: CoalescedCollectionRead | null = null;
  try {
    published = await rebuildWarmCollectionRead(
      event,
      pathKey,
      cacheTenant,
      collectionId,
      entryId,
      listParams,
      marks,
    );
    return published;
  } finally {
    // Unregistered flights have no waiters — resolving them is a no-op.
    releaseFlight?.(published);
    inflightCollectionReads.delete(flightKey);
  }
}

async function rebuildWarmCollectionRead(
  event: RequestEvent,
  pathKey: string,
  cacheTenant: string | null,
  collectionId: string,
  entryId: string | null,
  listParams: ReturnType<typeof parseCollectionQueryParams> | null,
  marks: Map<string, number> | null,
): Promise<CoalescedCollectionRead | null> {
  const { locals } = event;
  const cms = getLaneCms();
  if (!cms) return null;
  const dbT0 = marks ? performance.now() : 0;

  // Direct-to-Wire point stream optimization (Phase 1): a simple published point read
  // whose query parameters are exactly the compiled defaults fetches the wire body
  // directly from the database engine, bypassing entity hydration and JSON.stringify.
  // The admission predicate owns that decision (unknown parameters fail closed inside
  // it); anything it declines falls through to LocalCMS findById below.
  if (entryId && dbAdapter?.crud?.findPointWireStream) {
    const schema = contentStore.getCollection(collectionId, locals.tenantId as string);
    // WeakMap plan: the compiled wire meta depends only on the schema object
    // (the lane always compiles with the default locale), so a random-id scan
    // reuses the first compilation instead of rebuilding the published-field
    // Set per request. The cache keys on schema identity, which the content
    // registry keeps stable across requests.
    let wireMeta: CollectionWireMeta | null = null;
    if (schema) {
      if (wireMetaCache.has(schema)) {
        wireMeta = wireMetaCache.get(schema) ?? null;
      } else {
        wireMeta = computeCollectionWireMeta(schema);
        wireMetaCache.set(schema, wireMeta);
      }
    }
    if (wireMeta && isWirePlaneAdmissible(event, wireMeta)) {
      const wireRes = await dbAdapter.crud.findPointWireStream(
        collectionId,
        entryId as DatabaseId,
        {
          tenantId: locals.tenantId as DatabaseId,
          // Publication clamp parity: the Domain Plane resolves the caller's clamp
          // from the same policy function, and the wire SQL enforces it in-engine,
          // so a wire-served point read can never expose a row the caller is denied.
          // `locals` is passed directly (its `user` is what the policy reads; the
          // policy never reads `locals.system`, which the lane never sets) — the
          // previous `{ user: locals.user }` literal was a per-request allocation.
          requirePublished:
            resolvePublicationFilter(locals, event.url.searchParams.get("status")) !== "all",
        },
      );
      if (wireRes?.success && wireRes.data) {
        const apiBody = wireRes.data.wireBody;
        const etag = wireRes.data.etag || generateContentEtag(apiBody);
        (locals as { apiBody?: string }).apiBody = apiBody;
        marks?.set("db", performance.now() - dbT0);
        marks?.set("build", 0);
        responseCache.set(pathKey, { body: apiBody, etag }, 300_000, cacheTenant, {
          skipSharedL1: true,
        });
        marks?.set("cachewrite", performance.now() - dbT0);
        return { body: apiBody, etag, miss: true };
      }
      if (wireRes && wireRes.success === false && wireRes.error?.code === "RECORD_NOT_FOUND") {
        // The wire SELECT ran and definitively found no servable row (id absent
        // or publication-clamped away). Build the SAME `200 {success:true,data:null}`
        // envelope the Domain-Plane fallback below would produce — skipping its
        // redundant re-query. Byte-identity with the findById path: that path
        // stringifies `{ success: true, data: envelope.data }` where `data` is
        // null, and hashes the same etag. Only the admitted wire-plane case can
        // reach here (see isWirePlaneAdmissible), so the verdict is authoritative.
        const apiBody = STATIC_ENVELOPES.SUCCESS_NULL;
        const etag = generateContentEtag(apiBody);
        (locals as { apiBody?: string }).apiBody = apiBody;
        marks?.set("db", performance.now() - dbT0);
        marks?.set("build", 0);
        responseCache.set(pathKey, { body: apiBody, etag }, 300_000, cacheTenant, {
          skipSharedL1: true,
        });
        marks?.set("cachewrite", performance.now() - dbT0);
        return { body: apiBody, etag, miss: true };
      }
    }
  }

  // Direct-to-Wire List stream optimization (Phase 2): a published list read
  // whose parameters match the compiled defaults (no custom sort, default limit 50, page 1)
  // fetches the wire body directly from the database engine using in-engine aggregation.
  // Benchmarked: SQLite +22.7% to +50.2% RPS gain; engines that decline fall through.
  if (!entryId && dbAdapter?.crud?.findListWireStream && listParams) {
    const schema = contentStore.getCollection(collectionId, locals.tenantId as string);
    let wireMeta: CollectionWireMeta | null = null;
    if (schema) {
      if (wireMetaCache.has(schema)) {
        wireMeta = wireMetaCache.get(schema) ?? null;
      } else {
        wireMeta = computeCollectionWireMeta(schema);
        wireMetaCache.set(schema, wireMeta);
      }
    }
    if (wireMeta && isWirePlaneAdmissible(event, wireMeta)) {
      const wireRes = await dbAdapter.crud.findListWireStream(collectionId, {
        tenantId: locals.tenantId as DatabaseId,
        limit: listParams.limit,
        offset: listParams.offset,
        requirePublished:
          resolvePublicationFilter(locals, event.url.searchParams.get("status")) !== "all",
      });
      if (wireRes?.success && wireRes.data) {
        const collectionMeta =
          (schema as any)?._collectionMeta ||
          (schema
            ? {
                id: schema._id,
                name: schema.name,
                label: schema.label,
              }
            : undefined);
        const apiBody = collectionMeta
          ? `{"success":true,"data":${wireRes.data.wireBody},"meta":{"_collection":${JSON.stringify(collectionMeta)}}}`
          : `{"success":true,"data":${wireRes.data.wireBody}}`;
        const etag = wireRes.data.etag || generateContentEtag(apiBody);
        (locals as { apiBody?: string }).apiBody = apiBody;
        marks?.set("db", performance.now() - dbT0);
        marks?.set("build", 0);
        const tags = collectionResponseCacheTags(collectionId, null).tags;
        let compressedVariants: Record<string, Uint8Array> | undefined;
        const acceptEncoding = event.request.headers.get("accept-encoding") ?? "";
        if (acceptEncoding) {
          const bodyBytes = Buffer.byteLength(apiBody, "utf8");
          if (bodyBytes > STASH_MIN_BYTES && bodyBytes <= STASH_MAX_BYTES) {
            const algo = negotiateEncoding(acceptEncoding, hasNativeCompression(), {
              contentLength: bodyBytes,
            });
            if (algo) {
              const variant =
                bodyBytes <= SYNC_MAX_SIZE
                  ? compressSync(apiBody, algo, bodyBytes)
                  : await compressAsync(apiBody, algo, bodyBytes).catch(() => null);
              if (variant) compressedVariants = { [algo]: variant };
            }
          }
        }
        responseCache.set(
          pathKey,
          compressedVariants
            ? { body: apiBody, etag, compressed: compressedVariants }
            : { body: apiBody, etag },
          300_000,
          cacheTenant,
          {
            tags,
            skipSharedL1: false,
          },
        );
        marks?.set("cachewrite", performance.now() - dbT0);
        return { body: apiBody, etag, miss: true, compressed: compressedVariants };
      }
    }
  }

  const result = entryId
    ? await cms.collections.findById(collectionId, entryId, {
        user: locals.user,
        tenantId: locals.tenantId as DatabaseId,
        // This lane caches the whole HTTP response in `responseCache.pointL1`
        // below, so the namespace's own L2 entry would be a second copy that
        // only bills prefix-map + tag-index work — for a random per-id scan,
        // rows that are never read twice.
        skipCacheService: true,
      })
    : await cms.collections.find(collectionId, {
        user: locals.user,
        tenantId: locals.tenantId as DatabaseId,
        limit: listParams!.limit,
        offset: listParams!.offset,
        cursor: listParams!.cursor,
        // First keyset page opts in with `keyset=true`; continuation pages
        // carry `cursor` (which implies keyset). Same contract as the
        // dispatcher handler — see handleCollectionFind.
        keyset: listParams!.cursor !== undefined || event.url.searchParams.get("keyset") === "true",
        sortField: listParams!.sortField,
        sortDirection: listParams!.sortDirection,
        filter: listParams!.filter,
        publicationFilter: listParams!.publicationFilter,
        bypassCache: listParams!.bypassCache,
        populate: listParams!.populate,
        fields: listParams!.fields,
      });
  marks?.set("db", performance.now() - dbT0);

  // Point-read etag reads `_id` + `updatedAt` off the RAW SDK row — computed
  // before the shared trim below, which drops `updatedAt` from the HTTP
  // representation (byte-identity with the dispatcher fallback). Hashing the
  // whole body on every random miss was a full scan of a document the caller
  // will not revalidate.
  const record = result as { success?: boolean; data?: unknown; meta?: unknown };
  const rawRow = record.data as { _id?: unknown; updatedAt?: unknown } | null;
  const pointEtag =
    entryId && rawRow && typeof rawRow === "object"
      ? `"${String(rawRow._id ?? entryId)}-${String(rawRow.updatedAt ?? "")}"`
      : null;
  // One JSON string. The lane builds the only Response, from the prebuilt
  // security-header template. A second Response here was pure overhead on a miss.
  // `trimPointReadEnvelope` / `trimListEnvelope` copies the rows, so the
  // SDK request cache / L2 never see the trimmed payload.
  const envelope = (entryId ? trimPointReadEnvelope(record) : record) as {
    data?: unknown;
    meta?: unknown;
  };
  const dataJson = Array.isArray(envelope.data)
    ? serializeArrayFast(envelope.data as unknown[], serializeRowFast)
    : JSON.stringify(envelope.data);
  // Byte-identity with the dispatcher fallback: list meta stays a NESTED `meta`
  // object (`_collection` included) — not the flat total/limit shape of
  // `serializeListEnvelope`. Only the point-read success branch uses the
  // pre-compiled builder.
  const apiBody =
    envelope.meta !== undefined
      ? `{"success":true,"data":${dataJson},"meta":${JSON.stringify(envelope.meta)}}`
      : serializeSuccessEnvelope(dataJson);
  (locals as { apiBody?: string }).apiBody = apiBody;
  if (
    typeof apiBody !== "string" ||
    !result ||
    (result as { success?: boolean }).success === false
  ) {
    return null;
  }
  const etag = pointEtag ?? generateContentEtag(apiBody);
  // Point reads never reach the shared cache — `responseCache.set` returns
  // before its tag write for them — so building an entry-tag array there is
  // allocation the cold random-id path pays for and throws away.
  const tags = entryId ? null : collectionResponseCacheTags(collectionId, null).tags;
  marks?.set("build", performance.now() - dbT0);

  // The pipeline compresses every response it owns; lane responses bypass
  // `handleCompression`, so a large list would leave the socket as identity
  // bytes (measured 2026-09-28: 260 791 B for a zstd-only client). Compress the
  // negotiated encoding once and hand the variant to both the response and the
  // cache entry.
  //
  // ≤ 64 KiB uses the sync tier (exactly the pipeline's) — microseconds.
  // Above 64 KiB the one-shot native zstd/brotli/gzip APIs run on the libuv
  // worker pool, so the body is compressed OFF the request thread. Declining
  // the request instead (letting the pipeline stream it) was measured worse:
  // the lane had already built the rows, the pipeline rebuilt them, and the
  // same 199-row list cost 15.0 ms vs 10.8 ms with co-tenant p95 7.39 vs
  // 2.50 ms — the duplicate build dwarfs the compression.
  let compressedVariants: Record<string, Uint8Array> | undefined;
  if (tags) {
    const acceptEncoding = event.request.headers.get("accept-encoding") ?? "";
    if (acceptEncoding) {
      const bodyBytes = Buffer.byteLength(apiBody, "utf8");
      if (bodyBytes > STASH_MIN_BYTES && bodyBytes <= STASH_MAX_BYTES) {
        const algo = negotiateEncoding(acceptEncoding, hasNativeCompression(), {
          contentLength: bodyBytes,
        });
        if (algo) {
          const variant =
            bodyBytes <= SYNC_MAX_SIZE
              ? compressSync(apiBody, algo, bodyBytes)
              : await compressAsync(apiBody, algo, bodyBytes).catch(() => null);
          if (variant) compressedVariants = { [algo]: variant };
        }
      }
    }
  }

  responseCache.set(
    pathKey,
    compressedVariants
      ? { body: apiBody, etag, compressed: compressedVariants }
      : { body: apiBody, etag },
    300_000,
    cacheTenant,
    // Point reads pass a bare options object: the `...(tags ? { tags } : {})`
    // spread used to allocate an empty literal on every random-id miss. Lists
    // keep the exact same options as before (tags present, skipSharedL1 false).
    tags ? { tags, skipSharedL1: false } : { skipSharedL1: true },
  );
  marks?.set("cachewrite", performance.now() - dbT0);
  if (tags) {
    // Fill the remaining encodings in the background (the served one is passed
    // in so it is never compressed twice). Point reads skip this entirely.
    void scheduleTurboVariantStash({
      key: pathKey,
      body: apiBody,
      etag,
      byteLength: Buffer.byteLength(apiBody, "utf8"),
      ttlMs: 300_000,
      tenantId: cacheTenant,
      setOptions: { tags, skipSharedL1: false },
      have: compressedVariants,
    });
  }
  return compressedVariants
    ? { body: apiBody, etag, miss: true, compressed: compressedVariants }
    : { body: apiBody, etag, miss: true };
}

/**
 * Warm-session collection point-read. Returns the full pipeline when the
 * session is cold, the caller is not admin, or the path is not a simple GET.
 */
function laneHostIsLocal(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * The scan `handleSecurity` runs before it touches a body. Collection GETs have
 * no body. A block is returned here so a warm cache entry is never the response.
 */
function laneThreatResponse(event: RequestEvent): Response | null {
  const pathLower = event.url.pathname.toLowerCase();
  const userAgent = event.request.headers.get("user-agent") || "";
  if (
    isHoneypotPath(pathLower) ||
    (isAiOrScannerBot(userAgent) && !laneHostIsLocal(event.url.hostname))
  ) {
    return new Response("", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "Content-Length": "0",
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        "Cache-Control": "no-store",
      },
    });
  }
  const wafCheck = wafGuard.inspectEvent(event);
  if (!wafCheck.blocked) return null;
  return handleApiError(new AppError(wafCheck.reason ?? "Security Policy Violation", 400), event);
}

export const tryCollectionReadLane: Handle = async ({ event, resolve }) => {
  if (!isSimpleCollectionRead(event) || !dbAdapter || !isLaneServingAllowed()) {
    return resolve(event);
  }
  const threat = laneThreatResponse(event);
  if (threat) return threat;
  const sessionId = sessionIdOf(event);
  if (!sessionId) return resolve(event);
  const turbo = getTurboAuthContext(sessionId);
  if (!turbo) return resolve(event);
  try {
    const served = await executeWarmCollectionRead(event, turbo);
    return served ?? resolve(event);
  } catch (err) {
    if (event.url.pathname.startsWith("/api/")) return handleApiError(err, event);
    throw err;
  }
};
