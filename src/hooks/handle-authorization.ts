/**
 * @file src/hooks/handle-authorization.ts
 * @description Lightweight authorization middleware for user role and route protection
 *
 * ### Improvements
 * - Centered around high-performance hook-utils for short-circuiting
 * - Cached multi-tenant resolution
 * - Optimized first-user check logic
 * - Removed redundant role deduplication
 */

import { AuthGuardService } from "@src/services/security/auth-guard";
import { isAdmin, getRequestFlags, isPublicRoute } from "@utils/hook-utils";
import { SetupState } from "@utils/setup-check";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";

// 🚀 Module-level cached env flags
const IS_BUN_TEST = !!process.env.BUN_TEST;
const IS_TEST_MODE = process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";
const IS_BENCHMARK = process.env.BENCHMARK === "true";
import type { Role } from "@src/databases/auth/types";
import type { DatabaseId } from "../content/types";
import {
  cacheService,
  USER_COUNT_CACHE_TTL_MS,
  USER_COUNT_CACHE_TTL_S,
  USER_PERM_CACHE_TTL_MS,
  USER_PERM_CACHE_TTL_S,
} from "@src/databases/cache/cache-service";
import { auth } from "@src/databases/db";
import { error, type Handle, redirect } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { testWorkerContext } from "@utils/test-worker-context";

// 🚀 Turbo GET fast-path: imports for populating auth context cache
import { setTurboAuthContext } from "./handle-turbo-get";
import { getRoleBitset } from "@src/databases/auth/permissions";

// --- MODULE-LEVEL CACHES ---
let multiTenantCached: boolean | null = null;
const userCountCache = new Map<string, { count: number; timestamp: number }>();
const rolesCache = new Map<string, { data: Role[]; timestamp: number }>();

// 🚀 PRE-CACHED DYNAMIC IMPORTS: Avoid repeated lazy-load overhead
let cachedDefaultRoles: typeof import("@src/databases/auth/default-roles") | null = null;

async function getDefaultRoles() {
  if (!cachedDefaultRoles) cachedDefaultRoles = await import("@src/databases/auth/default-roles");
  return cachedDefaultRoles;
}

function getCachedMultiTenant() {
  if (multiTenantCached === null) multiTenantCached = !!getPrivateSettingSync("MULTI_TENANT");
  return multiTenantCached;
}

// --- UTILITIES ---

/** Get cached user count with fallback (optimized) */
async function getCachedUserCount(
  tenantId?: DatabaseId | null,
  multiTenant?: boolean,
): Promise<number> {
  const now = Date.now();
  const workerIndex = testWorkerContext.getStore() || "";
  const key = workerIndex ? `${workerIndex}:${tenantId || "global"}` : tenantId || "global";

  // 1. In-memory check
  const cached = userCountCache.get(key.toString());
  if (!IS_BUN_TEST && cached && now - cached.timestamp < USER_COUNT_CACHE_TTL_MS) {
    return cached.count;
  }

  // 2. Distributed check
  try {
    const cachedDist = await cacheService.get<{ count: number; timestamp: number }>(
      `userCount:${key}`,
      tenantId ?? undefined,
    );
    if (cachedDist && now - cachedDist.timestamp < USER_COUNT_CACHE_TTL_MS) {
      userCountCache.set(key.toString(), cachedDist);
      return cachedDist.count;
    }

    // 3. Database source of truth
    if (!auth) return -1;
    const filter = multiTenant && tenantId ? { tenantId: tenantId as DatabaseId } : {};
    const bypassOpts = !tenantId
      ? { bypassTenantCheck: true }
      : { tenantId: tenantId as DatabaseId };
    const count = await auth.getUserCount(filter, bypassOpts);
    // Never cache a non-authoritative count. A negative value means the read failed or auth
    // wasn't ready; caching it (TTL = 1h) would pin a false "fresh install" state and break
    // login until the TTL expires. Return it uncached so the next request re-reads.
    if (count < 0) {
      return count;
    }
    const cacheData = { count, timestamp: now };
    userCountCache.set(key.toString(), cacheData);
    await cacheService.set(
      `userCount:${key}`,
      cacheData,
      USER_COUNT_CACHE_TTL_S,
      tenantId ?? undefined,
    );
    return count;
  } catch (err: any) {
    logger.warn(`User count cache or query failed: ${err.message}`);
    return -1;
  }
}

/** Get cached roles for access checks (database-only) */
async function getCachedRoles(tenantId?: DatabaseId | null): Promise<Role[]> {
  const now = Date.now();
  const workerIndex = testWorkerContext.getStore() || "";
  const key = workerIndex ? `${workerIndex}:${tenantId || "global"}` : tenantId || "global";

  const cached = rolesCache.get(key.toString());
  if (cached && now - cached.timestamp < USER_PERM_CACHE_TTL_MS) return cached.data;

  try {
    if (!auth) return [];
    const bypassOpts =
      !tenantId || tenantId === "global"
        ? { bypassTenantCheck: true }
        : { tenantId: tenantId as DatabaseId };
    const data = await auth.getAllRoles(bypassOpts);
    if (!data || data.length === 0) return [];

    const cacheData = { data, timestamp: now };
    rolesCache.set(key.toString(), cacheData);
    await cacheService.set(`roles:${key}`, cacheData, USER_PERM_CACHE_TTL_S, tenantId ?? undefined);
    return data;
  } catch (err: any) {
    logger.error(`Failed to fetch roles: ${err.message}`);
    return [];
  }
}

// --- MAIN HANDLE ---

export const handleAuthorization: Handle = async ({ event, resolve }) => {
  const { url, locals } = event;
  const { user } = locals;

  // 🧪 TEST MODE BYPASS: Skip heavy auth logic, but page loads still need roles for +page.server.ts RBAC.
  if ((locals as any).__testBypass) {
    locals.isAdmin = isAdmin(user) || (user as any)?.isAdmin === true;
    const pathname = url.pathname;
    if (!pathname.startsWith("/api/") && user) {
      const roles = await getCachedRoles(event.locals.tenantId as DatabaseId);
      if (roles.length > 0) {
        event.locals.roles = roles;
      } else if ((locals as any).__setupConfigExists !== false) {
        const { getDefaultRoles: getDefaultRolesMod } = await getDefaultRoles();
        event.locals.roles = getDefaultRolesMod();
      }
      const userRole = (event.locals.roles || []).find(
        (r) => r._id === user.role || r.name?.toLowerCase() === String(user.role).toLowerCase(),
      );
      if (userRole?.isAdmin) {
        locals.isAdmin = true;
        (user as any).isAdmin = true;
      }
    }
    return resolve(event);
  }

  // 🚀 TURBO GET FAST-PATH: Auth context pre-injected by handleTurboGet.
  // User, roles, and bitset already on locals — skip role loading entirely.
  if ((locals as any).__turboAuth === true) {
    locals.isAdmin = isAdmin(user) || (user as any)?.isAdmin;
    return resolve(event);
  }

  const pathname = url.pathname;

  // 1. ULTRA-FAST SHORT-CIRCUIT using pre-computed flags from Turbo Pipeline
  const flags = getRequestFlags(locals as any);
  if (flags.isStatic) return resolve(event);

  // --- Phase 1: Gated Initialization ---
  // 🚀 __setupState is always set by handleTurboPipeline before this hook runs.
  // No dynamic import needed — SetupState is statically imported for zero-runtime cost.
  const setupState = (locals as any).__setupState || SetupState.COMPLETE;
  locals.__setupConfigExists = setupState !== SetupState.MISSING_CONFIG;

  if (setupState !== SetupState.COMPLETE) {
    logger.debug(
      `[handleAuthorization] System in SETUP mode (${setupState}). Skipping authorization.`,
    );
    locals.isAdmin = false;
    locals.hasManageUsersPermission = false;
    return await resolve(event);
  }

  const isApi = pathname.startsWith("/api/");
  // 🚀 Only skip auth for test mode, NOT for benchmarks (honest measurements)
  if (IS_TEST_MODE && !IS_BENCHMARK && (pathname.startsWith("/api/testing") || isApi)) {
    locals.isAdmin = isAdmin(user);
    return await resolve(event);
  }

  // Use pre-computed flags from Turbo Pipeline classifier when available;
  // fall back to direct computation for unit tests that bypass the pipeline.
  const isPublic = (locals as any).__flags ? flags.isPublic : isPublicRoute(pathname, IS_TEST_MODE);

  // 2. FIRST-USER CHECK (Optimized setup flow)
  const multiTenant = getCachedMultiTenant();
  if (locals.isFirstUser === undefined) {
    const userCount = await getCachedUserCount(locals.tenantId as DatabaseId, multiTenant);
    locals.isFirstUser = userCount === 0;
  }

  if (isPublic) {
    locals.isAdmin = false;
    locals.hasManageUsersPermission = false;
    return resolve(event);
  }

  // 🚀 FAST PATH: Admin users don't need roles loaded (saves a cache hit)
  if (user && (isAdmin(user) || (user as any).isAdmin)) {
    locals.isAdmin = true;
    locals.hasAdminPermission = true;
    locals.hasManageUsersPermission = true;
    // 🚀 Turbo GET: Populate auth context cache so subsequent GET requests
    // skip the full auth/authz middleware chain entirely.
    _populateTurboAuth(event, user, []);
    return await resolve(event);
  }

  // 3. ROLES LOAD (only for non-admin users)
  const roles = await getCachedRoles(event.locals.tenantId as DatabaseId);
  event.locals.roles = roles;

  // Setup guard
  if (
    roles.length === 0 &&
    !pathname.startsWith("/setup") &&
    !pathname.startsWith("/api/system") &&
    !pathname.startsWith("/api/setup")
  ) {
    if (event.locals.__setupConfigExists === true) {
      const { getDefaultRoles: getDefaultRolesMod } = await getDefaultRoles();
      event.locals.roles = getDefaultRolesMod();
    } else {
      if (isApi) throw new AppError("System not initialized", 503, "SYSTEM_NOT_INITIALIZED");
      throw redirect(302, "/setup");
    }
  }

  // 4. AUTH CHECKS
  try {
    const activeRoles = event.locals.roles || [];
    if (user) {
      const userRole = activeRoles.find((r) => r._id.toString() === user.role?.toString());
      const isAdminUser = !!userRole?.isAdmin || isAdmin(user);

      (user as any).isAdmin = isAdminUser;
      event.locals.isAdmin = isAdminUser;
      event.locals.hasAdminPermission = isAdminUser;
      event.locals.hasManageUsersPermission =
        isAdminUser ||
        AuthGuardService.checkPermissions(user, "manage", "user", undefined, activeRoles);

      if (isPublic && !isApi) throw redirect(302, "/");
    } else if (!(isPublic || event.locals.isFirstUser)) {
      if (isApi) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
      throw redirect(302, "/login");
    }

    // 🚀 Turbo GET: Populate auth context cache after roles are resolved
    // so the next GET request to a cached endpoint skips all middleware.
    _populateTurboAuth(event, user!, activeRoles);

    const response = await resolve(event);

    return response;
  } catch (err) {
    if (isApi) return handleApiError(err, event);
    if (err instanceof AppError) throw error(err.status, err.message);
    throw err;
  }
};

// --- CACHE INVALIDATION ---

export async function invalidateUserCountCache(tenantId?: string | null): Promise<void> {
  const workerIndex = testWorkerContext.getStore() || "";
  const key = workerIndex ? `${workerIndex}:${tenantId || "global"}` : tenantId || "global";
  userCountCache.delete(key.toString());
  cacheService.delete(`userCount:${key}`, tenantId).catch(() => {});
}

export async function invalidateRolesCache(tenantId?: string | null): Promise<void> {
  const workerIndex = testWorkerContext.getStore() || "";
  const key = workerIndex ? `${workerIndex}:${tenantId || "global"}` : tenantId || "global";
  rolesCache.delete(key.toString());
  cacheService.delete(`roles:${key}`, tenantId).catch(() => {});
}

// ─── Turbo GET Auth Context Population ───────────────────────────────────────

/**
 * Populates the turbo auth context cache after successful authentication
 * and role resolution. This enables subsequent GET requests to skip the
 * full handleAuthentication + handleAuthorization middleware chain.
 */
function _populateTurboAuth(
  event: import("@sveltejs/kit").RequestEvent,
  user: import("@src/databases/auth/types").User,
  roles: Role[],
): void {
  try {
    const sessionId =
      event.cookies.get(SESSION_COOKIE_NAME) ||
      event.cookies.get(`__Host-${SESSION_COOKIE_NAME}`) ||
      event.cookies.get(`__Secure-${SESSION_COOKIE_NAME}`);

    if (!sessionId) return;

    // Compute the combined permission bitset from all user roles
    let bitset: Uint32Array;
    if (roles.length > 0) {
      const userRole = roles.find((r) => r._id.toString() === user.role?.toString());
      bitset = userRole ? getRoleBitset(userRole) : getRoleBitset(roles[0]);
    } else {
      // Admin users have no specific roles — use empty bitset
      // (the dispatcher's admin fast-path bypasses permission checks)
      bitset = new Uint32Array(1);
    }

    setTurboAuthContext(sessionId, user, roles, bitset, (event.locals.tenantId as any) || null);
  } catch {
    // Non-critical — turbo cache miss just means the next request runs
    // through the normal middleware chain.
  }
}
