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

import type { Handle, RequestEvent } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { isSecureCookieContext, readSessionCookie, isAdmin } from "@src/databases/auth/constants";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { turboAuthCache } from "./handle-turbo-get";
import { wafGuard } from "./wasm-waf-guard";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { applyAdapterTenantContext } from "@src/databases/tenant-adapter";
import { successResponse } from "@src/routes/api/[...path]/handlers/base";
import { responseCache } from "@src/services/cache/response-cache";
import { applyAllSecurityHeaders } from "./handle-security-headers";
import type { DatabaseId } from "@src/content/types";

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
  const turbo = turboAuthCache.get(sessionId);
  return !!(turbo && Date.now() < turbo.expiresAt);
}

async function executeWarmCollectionWrite(event: RequestEvent): Promise<Response> {
  const { request, url, cookies, locals } = event;
  const wafCheck = wafGuard.inspectRequest(url.pathname, url.search, request.headers);
  if (wafCheck.blocked) {
    throw new AppError(wafCheck.reason ?? "Security Policy Violation", 400);
  }

  const isSecure = isSecureCookieContext(url.protocol, url.hostname);
  const csrf = validateCsrfForRequest(cookies, request, isSecure);
  if (!csrf.isValid) {
    throw new AppError(`Security violation: ${csrf.error}`, 403, "CSRF_VIOLATION");
  }

  const sessionId = readSessionCookie(cookies, isSecure);
  const turbo = sessionId ? turboAuthCache.get(sessionId) : undefined;
  if (!turbo || Date.now() >= turbo.expiresAt) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  locals.user = turbo.user;
  locals.roles = turbo.roles;
  locals.tenantId = turbo.tenantId as DatabaseId;
  locals.isAdmin = isAdmin(turbo.user);
  (locals as { __turboAuth?: boolean }).__turboAuth = true;
  locals.dbAdapter = dbAdapter as typeof locals.dbAdapter;
  (locals as { dbAdapterUnscoped?: unknown }).dbAdapterUnscoped = dbAdapter;
  const tenantP = applyAdapterTenantContext(dbAdapter, locals.tenantId ?? null);
  if (tenantP) await tenantP;

  if (!isAdmin(turbo.user) && turbo.user?.role !== "admin") {
    throw new AppError("Forbidden: Insufficient permissions", 403, "FORBIDDEN");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  const collectionId = parts[2];
  const entryId = parts[3];
  const raw = await request.json();
  const data = unwrapWritePayload(raw);
  const cms = LocalCMS.getLocals(dbAdapter, locals);
  const tenantId = locals.tenantId as DatabaseId;
  const user = locals.user;

  let result: unknown;
  if (request.method === "POST") {
    result = await cms.collections.create(collectionId, data, { user, tenantId });
  } else {
    result = await cms.collections.update(collectionId, entryId, data, { user, tenantId });
  }

  const tenantKey = tenantId ? String(tenantId) : "global";
  void responseCache.invalidateCollection("collections", tenantKey).catch(() => {});

  const res = successResponse(event, result, request.method === "POST" ? 201 : 200);
  applyAllSecurityHeaders(
    res.headers,
    url.protocol === "https:",
    request.headers.get("Origin"),
    url.pathname,
  );
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
  try {
    const { handleRateLimit } = await import("./handle-rate-limit");
    return await handleRateLimit({
      event,
      resolve: () => executeWarmCollectionWrite(event),
    });
  } catch (err) {
    if (event.url.pathname.startsWith("/api/")) return handleApiError(err, event);
    throw err;
  }
};
