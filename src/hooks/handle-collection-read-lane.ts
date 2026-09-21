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
 * - Labels every owned response: `X-Cache: TURBO-HIT` on hit, `MISS`/`BYPASS`
 *   on the rebuild, so lane attribution is never ambiguous
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { handleApiError } from "@utils/error-handling";
import { isSecureCookieContext, readSessionCookie, isAdmin } from "@src/databases/auth/constants";
import { getTurboAuthContext, serveTurboCacheEntry } from "./handle-turbo-get";
import { resolveRequestTenant } from "./request-tenant";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { applyAdapterTenantContext } from "@src/databases/tenant-adapter";
import { successResponse } from "@src/routes/api/[...path]/handlers/base";
import { applyAllSecurityHeaders } from "./handle-security-headers";
import {
  responseCache,
  buildUserResponseCacheKey,
  generateContentEtag,
  collectionResponseCacheTags,
  COLLECTION_ACTION_SEGMENTS,
} from "@src/services/cache/response-cache";
import type { DatabaseId } from "@src/content/types";
import { parseCollectionQueryParams, MAX_PAGE_SIZE } from "@utils/api-params";

interface CoalescedCollectionRead {
  body: string;
  etag: string;
  response?: Response;
}

const inflightCollectionReads = new Map<string, Promise<CoalescedCollectionRead | null>>();
const MAX_INFLIGHT_COLLECTION_READS = 64;

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

function hasWarmSession(event: RequestEvent): boolean {
  const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
  const sessionId = readSessionCookie(event.cookies, isSecure);
  if (!sessionId) return false;
  return getTurboAuthContext(sessionId) !== null;
}

async function executeWarmCollectionRead(event: RequestEvent): Promise<Response | null> {
  const { url, cookies, locals } = event;
  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  const sessionId = readSessionCookie(cookies, isSecure);
  const turbo = sessionId ? getTurboAuthContext(sessionId) : null;
  if (!turbo) {
    return null;
  }

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

  const srvT0 = performance.now();
  const cached = bypass ? null : responseCache.get(pathKey, cacheTenant);
  if (cached?.body) {
    const res = serveTurboCacheEntry(event, cached);
    res.headers.set("x-srv-dur", (performance.now() - srvT0).toFixed(2));
    return res;
  }

  const rebuilt = await coalesceCollectionRefill(
    event,
    pathKey,
    cacheTenant,
    collectionId,
    entryId,
    listParams,
  );
  if (rebuilt?.response) {
    // The rebuild is the ONLY path that emits no cache header of its own —
    // `serveTurboCacheEntry` labels hits. Without this, a served miss is
    // indistinguishable from the lane not having run at all.
    rebuilt.response.headers.set("X-Cache", bypass ? "BYPASS" : "MISS");
    rebuilt.response.headers.set("x-srv-dur", (performance.now() - srvT0).toFixed(2));
    return rebuilt.response;
  }
  if (rebuilt) {
    const res = serveTurboCacheEntry(event, rebuilt);
    res.headers.set("x-srv-dur", (performance.now() - srvT0).toFixed(2));
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
): Promise<CoalescedCollectionRead | null> {
  const { request, url, locals } = event;
  if (!dbAdapter) return null;
  const cms = LocalCMS.getLocals(dbAdapter, locals);
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
        sortField: listParams!.sortField,
        sortDirection: listParams!.sortDirection,
        filter: listParams!.filter,
        publicationFilter: listParams!.publicationFilter,
        bypassCache: listParams!.bypassCache,
        populate: listParams!.populate,
        fields: listParams!.fields,
      });

  const res = successResponse(event, result, 200);
  applyAllSecurityHeaders(
    res.headers,
    url.protocol === "https:",
    request.headers.get("Origin"),
    url.pathname,
  );

  const apiBody = (locals as { apiBody?: string }).apiBody;
  if (
    typeof apiBody !== "string" ||
    !result ||
    (result as { success?: boolean }).success === false
  ) {
    return null;
  }
  const etag = res.headers.get("etag") || generateContentEtag(apiBody);
  res.headers.set("etag", etag);
  const { tags, skipSharedL1 } = collectionResponseCacheTags(collectionId, entryId);
  responseCache.set(pathKey, { body: apiBody, etag }, 300_000, cacheTenant, {
    tags,
    skipSharedL1,
  });
  return { body: apiBody, etag, response: res };
}

/**
 * Warm-session collection point-read. Returns the full pipeline when the
 * session is cold, the caller is not admin, or the path is not a simple GET.
 */
export const tryCollectionReadLane: Handle = async ({ event, resolve }) => {
  if (!isSimpleCollectionRead(event) || !hasWarmSession(event) || !dbAdapter) {
    return resolve(event);
  }
  try {
    const served = await executeWarmCollectionRead(event);
    return served ?? resolve(event);
  } catch (err) {
    if (event.url.pathname.startsWith("/api/")) return handleApiError(err, event);
    throw err;
  }
};
