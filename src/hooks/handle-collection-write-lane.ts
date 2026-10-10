/**
 * @file src/hooks/handle-collection-write-lane.ts
 * @description Warm-session create/update lane — one JSON parse, one INSERT/UPDATE.
 *
 * Compared with the raw-db-ceiling insert (single postgres.js tagged template),
 * the full API_WRITE sequence pays ~12 async hook hops before the same SQL.
 * After turbo-auth is warm this lane keeps WAF + CSRF + rate-limit + RBAC
 * (admin/session) and skips the no-op hops so the event loop can overlap
 * the Postgres wait the way the ceiling probe does.
 *
 * ### Features:
 * - Simple REST create/update, plus batch, bulk, increment, and status
 * - Warm admin GraphQL POST (`/api/graphql`) — same checks, handler unchanged
 * - Requires a warm turbo-auth session (cold requests fall through)
 * - Non-admins on the extended routes fall through to the full pipeline
 * - WAF path inspect + CSRF same-origin/double-submit + existing rate-limit hook
 * - `Prefer: return=minimal` skips the row read-back on every admitted write
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { RequestLane } from "./handle-request-classifier";
import { AppError, handleApiError } from "@utils/error-handling";
import { isSecureCookieContext, readSessionCookie, isAdmin } from "@src/databases/auth/constants";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { getTurboAuthContext } from "./handle-turbo-get";
import { isLaneServingAllowed } from "./lane-state-gate";
import { resolveRequestTenant } from "./request-tenant";
import { wafGuard } from "./handle-waf-guard";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { applyAdapterTenantContext } from "@src/databases/tenant-adapter";
import { fastSuccessResponse, successResponse } from "@src/routes/api/[...path]/handlers/base";
import { applyAllSecurityHeaders } from "./handle-security-headers";
import { handleRateLimit } from "./handle-rate-limit";
import type { DatabaseId } from "@src/content/types";
import { prefersMinimalReturn } from "@utils/http-preferences";
import { parseCollectionQueryParams } from "@utils/api-params";
import {
  hasPermissionBitmask,
  isPermissionBitsetStale,
} from "@src/databases/auth/permission-bitmask";
import { getClientIp } from "@utils/hook-utils";
import { API_MAX_BODY_SIZE_BYTES, bodyTooLargeMessage } from "@utils/api-body-limits";
import { decideSessionRisk, evaluateSessionAnomaly } from "@src/databases/auth/session-user";
import { recordAuditEntry } from "./handle-audit-logging";

/**
 * `SVELTY_SRV_DUR=1` records total server time for the write lane (`x-srv-dur`)
 * — the same header the read lane stamps, so hot and cold writes are comparable
 * against the read acceptance gate. Off on the replica.
 */
const STAMP_SRV_DUR = process.env.SVELTY_SRV_DUR === "1";
/**
 * `SVELTY_SRV_SPLIT=1` stamps the write lane's phases on the response
 * (`x-srv-split`): security (WAF + CSRF + session/turbo + tenant), parse
 * (request.json + envelope unwrap), the namespace sub-phases (schema, prep,
 * encrypt, dbwrite, postwrite), persist (whole SDK call) and serve (envelope +
 * security headers). Zero cost when off.
 */
const STAMP_WRITE_SPLIT = process.env.SVELTY_SRV_SPLIT === "1";

function stampWriteSplit(headers: Headers, marks: Map<string, number>): void {
  if (!STAMP_WRITE_SPLIT || marks.size === 0) return;
  const parts: string[] = [];
  marks.forEach((ms, label) => parts.push(`${label}=${ms.toFixed(2)}`));
  headers.set("x-srv-split", parts.join(";"));
}

function stampSrvDur(headers: Headers, started: number): void {
  if (!STAMP_SRV_DUR) return;
  headers.set("x-srv-dur", (performance.now() - started).toFixed(2));
}

function unwrapWritePayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    let hasExtras = false;
    for (const k in obj) {
      if (Object.hasOwn(obj, k) && k !== "data" && k !== "tenantId") {
        hasExtras = true;
        break;
      }
    }
    if (!hasExtras) return obj.data;
  }
  return raw;
}

const SKIP_COLLECTION_IDS = new Set(["search", "reorder", "warm-cache", "list"]);

export type CollectionWriteLaneKind = "simple" | "extended";

/**
 * Which warm-lane shape a collection mutation is, or null when the full
 * API_WRITE pipeline must own it (cold-only routes, reads, reorder).
 *
 * Simple: POST /api/collections/:id and PATCH|PUT /api/collections/:id/:entryId.
 * Extended: batch, bulk create/update, atomic increment, and status. Those
 * keep the same WAF, CSRF, session-risk, and rate-limit checks. A non-admin
 * falls through so the pipeline's permission map still decides.
 */
export function collectionWriteLaneKind(
  method: string,
  pathname: string,
): CollectionWriteLaneKind | null {
  if (!pathname.startsWith("/api/collections/")) return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts.length > 5) return null;
  const collectionId = parts[2];
  if (!collectionId || SKIP_COLLECTION_IDS.has(collectionId)) return null;
  const entryId = parts[3];
  const subAction = parts[4];

  if (method === "POST" && parts.length === 3) return "simple";
  if (
    (method === "PATCH" || method === "PUT") &&
    parts.length === 4 &&
    entryId &&
    entryId !== "bulk" &&
    entryId !== "batch" &&
    entryId !== "batch-clone"
  ) {
    return "simple";
  }

  if (
    method === "POST" &&
    parts.length === 4 &&
    (entryId === "batch" || entryId === "batch-clone" || entryId === "bulk")
  ) {
    return "extended";
  }
  if ((method === "PATCH" || method === "PUT") && parts.length === 4 && entryId === "bulk") {
    return "extended";
  }
  if (method === "POST" && parts.length === 5 && subAction === "increment" && entryId) {
    return "extended";
  }
  if (
    (method === "PATCH" || method === "PUT") &&
    parts.length === 5 &&
    subAction === "status" &&
    entryId
  ) {
    return "extended";
  }
  return null;
}

/** True for any collection mutation the warm lane is allowed to admit. */
export function isCollectionWriteLanePath(event: RequestEvent): boolean {
  return collectionWriteLaneKind(event.request.method, event.url.pathname) !== null;
}

/** Warm admin GraphQL mutation. Queries and non-admins stay on the full pipeline. */
export function isGraphqlWriteLanePath(event: RequestEvent): boolean {
  if (event.request.method !== "POST") return false;
  const pathname = event.url.pathname;
  return pathname === "/api/graphql" || pathname === "/api/graphql/";
}

/**
 * Stateless SDK bridge — one instance per process (same pattern as the read
 * lane: `LocalCMS.getLocals()` allocates a fresh facade per request, the
 * namespaces are stateless per adapter and tenancy comes from
 * `applyAdapterTenantContext`).
 */
let laneCms: LocalCMS | null = null;
function getLaneCms(): LocalCMS | null {
  if (!dbAdapter) return null;
  if (!laneCms) laneCms = new LocalCMS(dbAdapter);
  return laneCms;
}

type CollectionHandlerModule = typeof import("@src/routes/api/[...path]/handlers/collections");
let collectionHandlersPromise: Promise<CollectionHandlerModule> | null = null;
function loadCollectionHandlers(): Promise<CollectionHandlerModule> {
  collectionHandlersPromise ??= import("@src/routes/api/[...path]/handlers/collections");
  return collectionHandlersPromise;
}

let graphqlPostPromise: Promise<(event: RequestEvent) => Promise<Response>> | null = null;
function loadGraphqlPost(): Promise<(event: RequestEvent) => Promise<Response>> {
  graphqlPostPromise ??= import("@src/routes/api/graphql/+server").then((mod) => mod.POST);
  return graphqlPostPromise;
}

function finishWarmWrite(
  event: RequestEvent,
  res: Response,
  marks: Map<string, number> | null,
  srvT0: number,
  t0: number,
): Response {
  res.headers.set("x-svelty-lane", RequestLane.API_WRITE);
  applyAllSecurityHeaders(
    res.headers,
    event.url.protocol === "https:",
    event.request.headers.get("Origin"),
    event.url.pathname,
  );
  marks?.set("serve", performance.now() - t0);
  if (marks) stampWriteSplit(res.headers, marks);
  stampSrvDur(res.headers, srvT0);
  return res;
}

/** WAF, CSRF, session-risk, and tenant bind. Throws on a security reject. */
async function openWarmMutation(
  event: RequestEvent,
  turbo: NonNullable<ReturnType<typeof getTurboAuthContext>>,
): Promise<void> {
  const { request, url, cookies, locals } = event;
  const wafCheck = wafGuard.inspectEvent(event);
  if (wafCheck.blocked) {
    throw new AppError(wafCheck.reason ?? "Security Policy Violation", 400);
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const contentLength = parseInt(declaredLength, 10);
    if (Number.isFinite(contentLength) && contentLength > API_MAX_BODY_SIZE_BYTES) {
      throw new AppError(bodyTooLargeMessage(contentLength), 413, "PAYLOAD_TOO_LARGE");
    }
  }
  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  const csrf = validateCsrfForRequest(cookies, request, isSecure);
  if (!csrf.isValid) {
    throw new AppError(`Security violation: ${csrf.error}`, 403, "CSRF_VIOLATION");
  }
  // GraphQL POST validates CSRF again. The token rotates on a successful
  // header check, so a second call would reject the request it just accepted.
  (locals as { __laneCsrfChecked?: boolean }).__laneCsrfChecked = true;
  const risk = decideSessionRisk(
    evaluateSessionAnomaly({
      currentIp: getClientIp(event),
      currentUserAgent: request.headers.get("user-agent"),
      storedIp: turbo.boundIp,
      storedUserAgent: turbo.boundUserAgent,
    }),
  );
  if (risk === "step-up") {
    throw new AppError(
      "Sign in again to continue. This session was presented by a different browser.",
      403,
      "SESSION_RISK_STEP_UP",
    );
  }
  locals.user = turbo.user;
  locals.roles = turbo.roles;
  locals.tenantId = resolveRequestTenant(request, turbo.tenantId);
  locals.isAdmin = isAdmin(turbo.user);
  (locals as { __turboAuth?: boolean }).__turboAuth = true;
  locals.dbAdapter = dbAdapter as typeof locals.dbAdapter;
  (locals as { dbAdapterUnscoped?: unknown }).dbAdapterUnscoped = dbAdapter;
  const tenantP = applyAdapterTenantContext(dbAdapter, locals.tenantId ?? null);
  if (tenantP) await tenantP;
}

async function dispatchExtendedCollectionWrite(
  event: RequestEvent,
  cms: LocalCMS,
  parts: string[],
): Promise<Response | null> {
  const handlers = await loadCollectionHandlers();
  const collectionId = parts[2];
  const entryId = parts[3];
  const subAction = parts[4];
  if (!collectionId) return null;
  const tenantId = event.locals.tenantId as DatabaseId;
  const user = event.locals.user;
  const method = event.request.method;
  if (method === "POST" && entryId === "bulk") {
    return handlers.handleCollectionBulkCreate(event, cms, tenantId, user, collectionId);
  }
  if ((method === "PATCH" || method === "PUT") && entryId === "bulk") {
    return handlers.handleCollectionBulkUpdate(event, cms, tenantId, user, collectionId);
  }
  if (method === "POST" && (entryId === "batch" || entryId === "batch-clone") && entryId) {
    return handlers.handleCollectionBatchAction(event, cms, tenantId, user, collectionId, entryId);
  }
  if (method === "POST" && subAction === "increment" && entryId) {
    return handlers.handleCollectionIncrement(event, cms, tenantId, user, collectionId, entryId);
  }
  if ((method === "PATCH" || method === "PUT") && subAction === "status" && entryId) {
    return handlers.handleCollectionStatusUpdate(event, cms, tenantId, user, collectionId, entryId);
  }
  return null;
}

/** True for simple REST create (POST collection) or update (PATCH/PUT entry). */
export function isSimpleCollectionWrite(event: RequestEvent): boolean {
  return collectionWriteLaneKind(event.request.method, event.url.pathname) === "simple";
}

function hasWarmSession(event: RequestEvent): boolean {
  const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
  const sessionId = readSessionCookie(event.cookies, isSecure);
  if (!sessionId) return false;
  // Slide TTL — must use getTurboAuthContext, not a raw Map get.
  return getTurboAuthContext(sessionId) !== null;
}

/** Resolve the warm turbo-auth context, or null for a cold/unknown session. */
export function resolveWarmWriteSession(
  event: RequestEvent,
): NonNullable<ReturnType<typeof getTurboAuthContext>> | null {
  const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
  const sessionId = readSessionCookie(event.cookies, isSecure);
  // Slides TTL — must use getTurboAuthContext, not a raw Map get.
  return sessionId ? getTurboAuthContext(sessionId) : null;
}

/**
 * Admission rule for SIMPLE collection writes (create/update) on the warm
 * lane — mirrors the read lane's rule: an admin or a fresh `collections:write`
 * bit admits; anything else (or a stale bitset) must fall through to the full
 * pipeline while the body is still unread, where the endpoint permission map
 * authorizes and the field guard inside prepareWritePayload still enforces
 * the per-field write rules. Exported for the policy unit test.
 */
export function isSimpleWriteLaneAuthorized(args: {
  user: Parameters<typeof isAdmin>[0];
  permMask?: bigint;
  permRev?: number;
}): boolean {
  const admin = isAdmin(args.user) || args.user?.role === "admin";
  if (!admin && !hasPermissionBitmask(args.permMask ?? 0n, "collections:write")) {
    return false;
  }
  return !isPermissionBitsetStale(args.permRev);
}

async function executeWarmCollectionWrite(
  event: RequestEvent,
  turboContext?: NonNullable<ReturnType<typeof getTurboAuthContext>>,
): Promise<Response | null> {
  const { request, url, cookies, locals } = event;
  const srvT0 = STAMP_SRV_DUR || STAMP_WRITE_SPLIT ? performance.now() : 0;
  const t0 = STAMP_WRITE_SPLIT ? performance.now() : 0;
  const marks = STAMP_WRITE_SPLIT ? new Map<string, number>() : null;

  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  const sessionId = readSessionCookie(cookies, isSecure);
  const turbo = turboContext ?? (sessionId ? getTurboAuthContext(sessionId) : null);
  // Expired turbo → fall through to the full auth pipeline (session cookie
  // is still valid). A 401 here is what aborted 14/100k seed rows at ~60s
  // with no application log — the request never reached create().
  // A caller that supplies `turboContext` (the raw fast lane) has already
  // resolved the session, so this cannot race its own pre-check.
  if (!turbo) {
    return null;
  }

  await openWarmMutation(event, turbo);
  marks?.set("security", performance.now() - t0);

  const kind = collectionWriteLaneKind(request.method, url.pathname);
  // Non-admins on extended routes are turned back in tryCollectionWriteLane
  // before this runs, so the body is still unread. A direct caller still
  // fail-closes.
  if (!isAdmin(turbo.user) && turbo.user?.role !== "admin") {
    throw new AppError("Forbidden: Insufficient permissions", 403, "FORBIDDEN");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (kind === "extended") {
    const extendedCms = getLaneCms();
    if (!extendedCms) return null;
    const extended = await dispatchExtendedCollectionWrite(event, extendedCms, parts);
    if (!extended) return null;
    return finishWarmWrite(event, extended, marks, srvT0, t0);
  }
  const collectionId = parts[2];
  const entryId = parts[3];
  const tParse = STAMP_WRITE_SPLIT ? performance.now() : 0;
  const raw = await request.json();
  const data = unwrapWritePayload(raw);
  if (marks) marks.set("parse", performance.now() - tParse);
  const cms = getLaneCms();
  if (!cms) return null;
  const tenantId = locals.tenantId as DatabaseId;
  const user = locals.user;

  let result: unknown;
  const minimal = prefersMinimalReturn(request.headers.get("prefer"), url);
  // 🔭 FIELD PROJECTION parity with the full pipeline (handlers/collections.ts):
  // `?fields=_id,count,updatedAt` prunes the UPDATE read-back to the requested
  // columns. Minimal acks already skip RETURNING entirely.
  const projection = !minimal ? parseCollectionQueryParams(url.searchParams).fields : undefined;
  if (request.method === "POST") {
    result = await cms.collections.create(collectionId, data, {
      user,
      tenantId,
      ...(marks ? { __phaseMarks: marks } : {}),
      ...(minimal ? { skipReturning: true } : {}),
    });
  } else {
    // `skipReturning` is the adapter-agnostic half of the minimal ack: the row is not read
    // back at all (no SQL `RETURNING`, no Mongo `findOneAndUpdate`), so the saving is
    // server-side too, not just on the wire.
    result = await cms.collections.update(collectionId, entryId, data, {
      user,
      tenantId,
      ...(marks ? { __phaseMarks: marks } : {}),
      ...(minimal ? { skipReturning: true } : {}),
      ...(projection ? { fields: projection } : {}),
    });
  }
  marks?.set("persist", performance.now() - t0);

  // L1/L2 invalidation is already scheduled by collections.create/update
  // (schedulePostWrite). A second invalidateCollection here double-bumps the
  // epoch and starts an L2 tag scan on the same tick as the next concurrent
  // create — that is the HTTP write cliff.
  //
  // RFC 7240 `Prefer: return=minimal`: this lane is the hot path for warm sessions, so the
  // ack belongs here too — the default body is the whole written document, which a caller
  // that only needs "it worked" discards (the competitive update lane measured ~3.5 KB of
  // representation per write). The write above already skipped its read-back, so all that
  // is left is the envelope. Same read on the dispatcher side (`handlers/collections.ts`),
  // so both paths behave identically.
  if (minimal) {
    const isPost = request.method === "POST";
    const resId = isPost
      ? (result as any)?.data?._id ||
        (result as any)?.data?.id ||
        (result as any)?._id ||
        (result as any)?.id
      : entryId;
    const res = fastSuccessResponse(
      event,
      `{"_id":${JSON.stringify(resId)}}`,
      { _id: resId },
      isPost ? 201 : 200,
    );
    return finishWarmWrite(event, res, marks, srvT0, t0);
  }

  const res = successResponse(event, result, request.method === "POST" ? 201 : 200);
  return finishWarmWrite(event, res, marks, srvT0, t0);
}

/**
 * Serve a warm-session write from an already-resolved session context.
 *
 * `turbo` is passed in so the transport lane and the SvelteKit pipeline observe
 * the same session decision — no TTL race between the pre-check and the write.
 * This NEVER falls through: once a caller has committed to serving, every path
 * returns a `Response`. That guarantee is what lets the raw fast lane read the
 * request body safely (a body can only be consumed once a response is certain).
 */
export async function serveWarmCollectionWrite(
  event: RequestEvent,
  turbo: NonNullable<ReturnType<typeof getTurboAuthContext>>,
): Promise<Response> {
  const start = performance.now();
  let statusCode = 500;
  let executionError: unknown;
  try {
    // 🚀 LANE-LEAN RATE LIMIT: consume the in-memory bucket synchronously and
    // let the Redis ledger receive the spend after the response (measured
    // ~0.6 ms per warm mutation with Redis up — the in-memory bucket already
    // enforces the same limit, and a second process still sees the spend).
    // Only this lane opts in; GraphQL writes and the full pipeline keep the
    // awaited Redis enforcement.
    (event.locals as { __rateLimitAsyncRemote?: boolean }).__rateLimitAsyncRemote = true;
    const res = await handleRateLimit({
      event,
      resolve: async () => {
        const written = await executeWarmCollectionWrite(event, turbo);
        // Unreachable while `turbo` is supplied and the adapter exists, but the
        // body may already be consumed here, so answer rather than fall through.
        return (
          written ??
          handleApiError(
            new AppError("Write lane unavailable", 503, "WRITE_LANE_UNAVAILABLE"),
            event,
          )
        );
      },
    });
    res.headers.set("x-svelty-lane", RequestLane.API_WRITE);
    statusCode = res.status;
    return res;
  } catch (err) {
    executionError = err;
    if (event.url.pathname.startsWith("/api/")) {
      const errRes = handleApiError(err, event);
      errRes.headers.set("x-svelty-lane", RequestLane.API_WRITE);
      statusCode = errRes.status;
      return errRes;
    }
    throw err;
  } finally {
    const durationMs = (performance.now() - start).toFixed(1);
    recordAuditEntry(event, statusCode, durationMs, executionError);
  }
}

/**
 * Warm-session collection create/update. Returns `resolve(event)` when the
 * request must use the full API_WRITE sequence (cold session, bulk, increment, …).
 *
 * Before the state gate / session pre-checks, `resolve` runs with the request
 * body UNREAD — so a caller that re-dispatches unserved requests to the full
 * pipeline (the raw fast lane) never has to replay a consumed body.
 */
export const tryGraphqlWriteLane: Handle = async ({ event, resolve }) => {
  if (!isGraphqlWriteLanePath(event) || !dbAdapter || !isLaneServingAllowed()) {
    return resolve(event);
  }
  if (!hasWarmSession(event)) return resolve(event);
  const turbo = resolveWarmWriteSession(event);
  // Non-admins keep the full authorization pipeline. Body stays unread.
  if (!turbo || !(isAdmin(turbo.user) || turbo.user?.role === "admin")) {
    return resolve(event);
  }
  const stamp = STAMP_SRV_DUR || STAMP_WRITE_SPLIT;
  const srvT0 = stamp ? performance.now() : 0;
  const marks = STAMP_WRITE_SPLIT ? new Map<string, number>() : null;
  try {
    const res = await handleRateLimit({
      event,
      resolve: async () => {
        const tSec = STAMP_WRITE_SPLIT ? performance.now() : 0;
        await openWarmMutation(event, turbo);
        marks?.set("security", performance.now() - tSec);
        const post = await loadGraphqlPost();
        const res = await post(event);
        return finishWarmWrite(event, res, marks, srvT0, srvT0);
      },
    });
    res.headers.set("x-svelty-lane", RequestLane.API_WRITE);
    return res;
  } catch (err) {
    if (event.url.pathname.startsWith("/api/")) {
      const errRes = handleApiError(err, event);
      errRes.headers.set("x-svelty-lane", RequestLane.API_WRITE);
      return errRes;
    }
    throw err;
  }
};

export const tryCollectionWriteLane: Handle = async ({ event, resolve }) => {
  if (!isCollectionWriteLanePath(event) || !dbAdapter || !hasWarmSession(event)) {
    return resolve(event);
  }
  // 🛡️ Operational-state gate: the write lane never runs `handle-system-state`,
  // so a MAINTENANCE/RECOVERY/FAILED instance must not accept mutations here.
  if (!isLaneServingAllowed()) return resolve(event);
  const turbo = resolveWarmWriteSession(event);
  if (!turbo) return resolve(event);
  const kind = collectionWriteLaneKind(event.request.method, event.url.pathname);
  // Batch, bulk, increment, and status are valid for non-admins who hold
  // collections:write. Leave those on the full pipeline. The body is unread.
  if (kind === "extended" && !isAdmin(turbo.user) && turbo.user?.role !== "admin") {
    return resolve(event);
  }
  // 🚪 SIMPLE-WRITE ADMISSION (mirrors the read lane's rule): a warm session
  // admits when the caller is an admin OR carries a fresh `collections:write`
  // bit — an author with a warm session creates/updates at the same speed as
  // an admin instead of hitting the hard 403 inside the lane. Everyone else
  // (or a stale bitset) falls through to the full pipeline while the body is
  // still unread: the endpoint permission map authorizes there and the field
  // guard inside prepareWritePayload still enforces per-field write rules.
  if (kind === "simple" && !isSimpleWriteLaneAuthorized(turbo)) {
    return resolve(event);
  }
  return serveWarmCollectionWrite(event, turbo);
};
