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
 * - POST /api/collections/:id and PATCH/PUT /api/collections/:id/:entryId only
 * - Requires a warm turbo-auth session (cold requests fall through)
 * - WAF path inspect + CSRF same-origin/double-submit + existing rate-limit hook
 * - Delegates persist to cms.collections.create/update (same adapter path)
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
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
import { successResponse } from "@src/routes/api/[...path]/handlers/base";
import { applyAllSecurityHeaders } from "./handle-security-headers";
import { handleRateLimit } from "./handle-rate-limit";
import type { DatabaseId } from "@src/content/types";
import { prefersMinimalReturn } from "@utils/http-preferences";

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

/** True for simple REST create (POST collection) or update (PATCH/PUT entry). */
export function isSimpleCollectionWrite(event: RequestEvent): boolean {
  const method = event.request.method;
  if (method !== "POST" && method !== "PATCH" && method !== "PUT") return false;
  const pathname = event.url.pathname;
  if (!pathname.startsWith("/api/collections/")) return false;
  const parts = pathname.split("/").filter(Boolean);
  // ["api", "collections", collectionId] or + entryId
  if (parts.length < 3 || parts.length > 4) return false;
  if (SKIP_COLLECTION_IDS.has(parts[2])) return false;
  if (
    parts.length === 4 &&
    (parts[3] === "batch" || parts[3] === "bulk" || parts[3] === "increment")
  ) {
    return false;
  }
  if (method === "POST" && parts.length !== 3) return false;
  if ((method === "PATCH" || method === "PUT") && parts.length !== 4) return false;
  return true;
}

function hasWarmSession(event: RequestEvent): boolean {
  const isSecure = isSecureCookieContext(event.url.protocol, event.url.hostname);
  const sessionId = readSessionCookie(event.cookies, isSecure);
  if (!sessionId) return false;
  // Slide TTL — must use getTurboAuthContext, not a raw Map get.
  return getTurboAuthContext(sessionId) !== null;
}

async function executeWarmCollectionWrite(event: RequestEvent): Promise<Response | null> {
  const { request, url, cookies, locals } = event;
  const srvT0 = STAMP_SRV_DUR || STAMP_WRITE_SPLIT ? performance.now() : 0;
  const t0 = STAMP_WRITE_SPLIT ? performance.now() : 0;
  const marks = STAMP_WRITE_SPLIT ? new Map<string, number>() : null;
  const wafCheck = wafGuard.inspectEvent(event);
  if (wafCheck.blocked) {
    throw new AppError(wafCheck.reason ?? "Security Policy Violation", 400);
  }

  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  const csrf = validateCsrfForRequest(cookies, request, isSecure);
  if (!csrf.isValid) {
    throw new AppError(`Security violation: ${csrf.error}`, 403, "CSRF_VIOLATION");
  }

  const sessionId = readSessionCookie(cookies, isSecure);
  const turbo = sessionId ? getTurboAuthContext(sessionId) : null;
  // Expired turbo → fall through to the full auth pipeline (session cookie
  // is still valid). A 401 here is what aborted 14/100k seed rows at ~60s
  // with no application log — the request never reached create().
  if (!turbo) {
    return null;
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
  marks?.set("security", performance.now() - t0);

  if (!isAdmin(turbo.user) && turbo.user?.role !== "admin") {
    throw new AppError("Forbidden: Insufficient permissions", 403, "FORBIDDEN");
  }

  const parts = url.pathname.split("/").filter(Boolean);
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
  const minimal = request.method !== "POST" && prefersMinimalReturn(request.headers.get("prefer"));
  if (request.method === "POST") {
    result = await cms.collections.create(collectionId, data, {
      user,
      tenantId,
      ...(marks ? { __phaseMarks: marks } : {}),
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
  const payload = minimal ? { success: true, data: { _id: entryId } } : result;
  const res = successResponse(event, payload, request.method === "POST" ? 201 : 200);
  applyAllSecurityHeaders(
    res.headers,
    url.protocol === "https:",
    request.headers.get("Origin"),
    url.pathname,
  );
  marks?.set("serve", performance.now() - t0);
  if (marks) stampWriteSplit(res.headers, marks);
  stampSrvDur(res.headers, srvT0);
  return res;
}

/**
 * Warm-session collection create/update. Returns null when the request must
 * use the full API_WRITE sequence (cold session, bulk, increment, …).
 */
export const tryCollectionWriteLane: Handle = async ({ event, resolve }) => {
  if (!isSimpleCollectionWrite(event) || !hasWarmSession(event) || !dbAdapter) {
    return resolve(event);
  }
  // 🛡️ Operational-state gate: the write lane never runs `handle-system-state`,
  // so a MAINTENANCE/RECOVERY/FAILED instance must not accept mutations here.
  if (!isLaneServingAllowed()) return resolve(event);
  try {
    return await handleRateLimit({
      event,
      resolve: async () => {
        const written = await executeWarmCollectionWrite(event);
        return written ?? resolve(event);
      },
    });
  } catch (err) {
    if (event.url.pathname.startsWith("/api/")) return handleApiError(err, event);
    throw err;
  }
};
