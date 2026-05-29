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

// --- MODULE-LEVEL CACHES ---
let multiTenantCached: boolean | null = null;
let userCountCache: { count: number; timestamp: number } | null = null;
const rolesCache = new Map<string, { data: Role[]; timestamp: number }>();

// 🚀 PRE-CACHED DYNAMIC IMPORTS: Avoid repeated lazy-load overhead
let cachedSetupCheck: typeof import("@utils/setup-check") | null = null;
let cachedDefaultRoles:
  | typeof import("@src/databases/auth/default-roles")
  | null = null;

async function getSetupCheck() {
  if (!cachedSetupCheck) cachedSetupCheck = await import("@utils/setup-check");
  return cachedSetupCheck;
}
async function getDefaultRoles() {
  if (!cachedDefaultRoles)
    cachedDefaultRoles = await import("@src/databases/auth/default-roles");
  return cachedDefaultRoles;
}

function getCachedMultiTenant() {
  if (multiTenantCached === null)
    multiTenantCached = !!getPrivateSettingSync("MULTI_TENANT");
  return multiTenantCached;
}

// --- UTILITIES ---

/** Get cached user count with fallback (optimized) */
async function getCachedUserCount(
  tenantId?: DatabaseId | null,
  multiTenant?: boolean,
): Promise<number> {
  const now = Date.now();

  // 1. In-memory check
  if (
    !process.env.BUN_TEST &&
    userCountCache &&
    now - userCountCache.timestamp < USER_COUNT_CACHE_TTL_MS
  ) {
    return userCountCache.count;
  }

  // 2. Distributed check
  try {
    const cached = await cacheService.get<{ count: number; timestamp: number }>(
      "userCount",
      tenantId ?? undefined,
    );
    if (cached && now - cached.timestamp < USER_COUNT_CACHE_TTL_MS) {
      userCountCache = cached;
      return cached.count;
    }

    // 3. Database source of truth
    if (!auth) return -1;
    const filter =
      multiTenant && tenantId ? { tenantId: tenantId as DatabaseId } : {};
    const bypassOpts = !tenantId
      ? { bypassTenantCheck: true }
      : { tenantId: tenantId as DatabaseId };
    const count = await auth.getUserCount(filter, bypassOpts);
    const cacheData = { count, timestamp: now };
    userCountCache = cacheData;
    await cacheService.set(
      "userCount",
      cacheData,
      USER_COUNT_CACHE_TTL_S,
      tenantId ?? undefined,
    );
    return count;
  } catch (err) {
    logger.warn(
      `User count cache or query failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return -1;
  }
}

/** Get cached roles for access checks (database-only) */
async function getCachedRoles(tenantId?: DatabaseId | null): Promise<Role[]> {
  const now = Date.now();
  const key = tenantId || "global";

  const cached = rolesCache.get(key.toString());
  if (cached && now - cached.timestamp < USER_PERM_CACHE_TTL_MS)
    return cached.data;

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
    await cacheService.set(
      `roles:${key}`,
      cacheData,
      USER_PERM_CACHE_TTL_S,
      tenantId ?? undefined,
    );
    return data;
  } catch (err) {
    logger.error(
      `Failed to fetch roles: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// --- MAIN HANDLE ---

export const handleAuthorization: Handle = async ({ event, resolve }) => {
  const { url, locals } = event;
  const { user } = locals;

  // 🧪 TEST MODE BYPASS: If cryptographic handshake verified, skip auth logic
  if ((locals as any).__testBypass) {
    locals.isAdmin = isAdmin(user);
    return resolve(event);
  }

  const pathname = url.pathname;
  const isTestMode =
    process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";
  const isBenchmark = process.env.BENCHMARK === "true";

  // 1. ULTRA-FAST SHORT-CIRCUIT using pre-computed flags from Turbo Pipeline
  const flags = getRequestFlags(locals as any);
  if (flags.isStatic) return resolve(event);

  // --- Phase 1: Gated Initialization ---
  const { getSetupState, SetupState } = await getSetupCheck();
  const setupState = (locals as any).__setupState || (await getSetupState());
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
  if (
    isTestMode &&
    !isBenchmark &&
    (pathname.startsWith("/api/testing") || isApi)
  ) {
    locals.isAdmin = isAdmin(user);
    return await resolve(event);
  }

  // Use pre-computed flags from Turbo Pipeline classifier when available;
  // fall back to direct computation for unit tests that bypass the pipeline.
  const isPublic = (locals as any).__flags
    ? flags.isPublic
    : isPublicRoute(pathname, isTestMode);

  // 2. FIRST-USER CHECK (Optimized setup flow)
  const multiTenant = getCachedMultiTenant();
  if (locals.isFirstUser === undefined) {
    const userCount = await getCachedUserCount(
      locals.tenantId as DatabaseId,
      multiTenant,
    );
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
    return await resolve(event);
  }

  // 3. ROLES LOAD (only for non-admin users)
  const roles = await getCachedRoles(locals.tenantId as DatabaseId);
  locals.roles = roles;

  // Setup guard
  if (
    roles.length === 0 &&
    !pathname.startsWith("/setup") &&
    !pathname.startsWith("/api/system") &&
    !pathname.startsWith("/api/setup")
  ) {
    if (locals.__setupConfigExists === true) {
      const { getDefaultRoles: getDefaultRolesMod } = await getDefaultRoles();
      locals.roles = getDefaultRolesMod();
    } else {
      if (isApi)
        throw new AppError(
          "System not initialized",
          503,
          "SYSTEM_NOT_INITIALIZED",
        );
      throw redirect(302, "/setup");
    }
  }

  // 4. AUTH CHECKS
  try {
    if (user) {
      const userRole = roles.find(
        (r) => r._id.toString() === user.role?.toString(),
      );
      const isAdminUser = !!userRole?.isAdmin || isAdmin(user);

      (user as any).isAdmin = isAdminUser;
      locals.isAdmin = isAdminUser;
      locals.hasAdminPermission = isAdminUser;
      locals.hasManageUsersPermission =
        isAdminUser ||
        AuthGuardService.checkPermissions(
          user,
          "manage",
          "user",
          undefined,
          roles,
        );

      if (isPublic && !isApi) throw redirect(302, "/");
    } else if (!(isPublic || locals.isFirstUser)) {
      if (isApi) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
      throw redirect(302, "/login");
    }

    const response = await resolve(event);

    return response;
  } catch (err) {
    if (isApi) return handleApiError(err, event);
    if (err instanceof AppError) throw error(err.status, err.message);
    throw err;
  }
};

// --- CACHE INVALIDATION ---

export async function invalidateUserCountCache(
  tenantId?: string | null,
): Promise<void> {
  userCountCache = null;
  cacheService.delete("userCount", tenantId).catch(() => {});
}

export async function invalidateRolesCache(
  tenantId?: string | null,
): Promise<void> {
  const key = tenantId || "global";
  rolesCache.delete(key);
  cacheService.delete(`roles:${key}`, tenantId).catch(() => {});
}
