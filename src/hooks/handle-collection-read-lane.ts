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
 * - Admin/session only (non-admin still uses the full RBAC/FLAC pipeline)
 * - Stashes turbo L1 on first set (point-reads use a dedicated FIFO)
 * - Serve-stale lists after write; single-flight only on true miss
 * - Trims the point-read payload through the shared `trimPointReadEnvelope`
 *   helper (byte-identity with the `handleCollectionEntry` dispatcher fallback)
 * - Labels every owned response: `X-Cache: TURBO-HIT` on hit, `MISS`/`BYPASS`
 *   on the rebuild, so lane attribution is never ambiguous
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { handleApiError } from "@utils/error-handling";
import { isSecureCookieContext, readSessionCookie, isAdmin } from "@src/databases/auth/constants";
import { getTurboAuthContext, serveTurboCacheEntry } from "./handle-turbo-get";
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
import type { DatabaseId } from "@src/content/types";
import { parseCollectionQueryParams, MAX_PAGE_SIZE } from "@utils/api-params";
import { trimPointReadEnvelope } from "@utils/point-read-payload";

interface CoalescedCollectionRead {
  body: string;
  etag: string;
  /** Leader of a miss. Waiters omit this and are served as turbo hits. */
  miss?: boolean;
  response?: Response;
}

const inflightCollectionReads = new Map<string, Promise<CoalescedCollectionRead | null>>();
const MAX_INFLIGHT_COLLECTION_READS = 64;

/**
 * Stateless SDK bridge — one instance per process. `LocalCMS.getLocals()`
 * allocates a fresh locals bridge (~25 closures) on every call; the lane only
 * ever reads `collections.findById`/`find` with explicit user/tenant options,
 * so a cached instance serves identical results without the per-request
 * allocation on the hot miss path.
 */
let laneCms: LocalCMS | null = null;
function getLaneCms(): LocalCMS | null {
  if (!dbAdapter) return null;
  if (!laneCms) laneCms = new LocalCMS(dbAdapter);
  return laneCms;
}

/** True for GET/HEAD of a collection list or single entry. */
export function isSimpleCollectionRead(event: RequestEvent): boolean {
  const method = event.request.method;
  if (method !== "GET" && method !== "HEAD") return false;
  const pathname = event.url.pathname;
  if (!pathname.startsWith("/api/collections/")) return false;
  const parts = pathname.split("/").filter(Boolean);
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

  // Non-admin still needs the full FLAC / publication pipeline.
  if (!isAdmin(turbo.user) && turbo.user?.role !== "admin") return null;

  const tenantP = applyAdapterTenantContext(dbAdapter, locals.tenantId ?? null);
  if (tenantP) await tenantP;

  const userId = turbo.user?._id || turbo.user?.id || null;
  const pathKey = buildUserResponseCacheKey(url.pathname, url.search, userId);
  const cacheTenant = (locals.tenantId as string | null) ?? null;
  const parts = url.pathname.split("/").filter(Boolean);
  const collectionId = parts[2];
  const entryId = parts.length === 4 ? parts[3] : null;
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
  let releaseFlight: (entry: CoalescedCollectionRead | null) => void = () => {};
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
    releaseFlight(published);
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
  // `trimPointReadEnvelope` copies the single row (arrays pass through), so the
  // SDK request cache / L2 never see the trimmed payload.
  const envelope = trimPointReadEnvelope(record) as {
    data?: unknown;
    meta?: unknown;
  };
  const apiBody =
    envelope.meta !== undefined
      ? JSON.stringify({ success: true, data: envelope.data, meta: envelope.meta })
      : JSON.stringify({ success: true, data: envelope.data });
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
  responseCache.set(
    pathKey,
    { body: apiBody, etag },
    300_000,
    cacheTenant,
    // Point reads pass a bare options object: the `...(tags ? { tags } : {})`
    // spread used to allocate an empty literal on every random-id miss. Lists
    // keep the exact same options as before (tags present, skipSharedL1 false).
    tags ? { tags, skipSharedL1: false } : { skipSharedL1: true },
  );
  marks?.set("cachewrite", performance.now() - dbT0);
  return { body: apiBody, etag, miss: true };
}

/**
 * Warm-session collection point-read. Returns the full pipeline when the
 * session is cold, the caller is not admin, or the path is not a simple GET.
 */
export const tryCollectionReadLane: Handle = async ({ event, resolve }) => {
  if (!isSimpleCollectionRead(event) || !dbAdapter || !isLaneServingAllowed()) {
    return resolve(event);
  }
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
