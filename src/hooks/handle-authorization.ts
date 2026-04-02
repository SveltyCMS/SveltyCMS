/**
 * @file src/hooks/handle-authorization.ts
 * @description Lightweight authorization middleware for user role and route protection
 *
 * ### Improvements
 * - Removed setup guard (redundant)
 * - Removed heavy global data loading (users/tokens)
 * - Simplified redirect logic for authenticated users
 * - Public and static routes skip database access entirely
 */

import { hasPermissionByAction } from "@src/databases/auth/permissions";
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
import { logger } from "@utils/logger.server";

// --- SIMPLE IN-MEMORY CACHE ---

let userCountCache: { count: number; timestamp: number } | null = null;
const rolesCache = new Map<string, { data: Role[]; timestamp: number }>();

// --- UTILITIES ---

function isPublicRoute(
  pathname: string,
  method: string | undefined,
  testMode: string | undefined,
): boolean {
  const publicRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/setup",
    "/forbidden",
    "/api/system/version",
    "/api/user/login",
    "/api/settings/public",
    "/api/preview",
    "/api/system/health",
  ];

  if (testMode === "true") {
    publicRoutes.push("/api/testing");
  }

  // Token validation endpoint is public (GET only) for registration flow
  if (method === "GET" && pathname.startsWith("/api/token/") && pathname.length > 11) {
    return true;
  }

  return publicRoutes.some((route) => pathname.startsWith(route));
}

function isOAuthRoute(pathname: string): boolean {
  return pathname.startsWith("/login") && pathname.includes("OAuth");
}

/** Get cached user count with fallback */
async function getCachedUserCount(
  tenantId?: DatabaseId | null,
  multiTenant?: boolean,
): Promise<number> {
  let userCount: number;
  const now = Date.now();

  // 1. Check in-memory cache (disabled in tests for isolation)
  if (
    !process.env.BUN_TEST &&
    userCountCache &&
    now - userCountCache.timestamp < USER_COUNT_CACHE_TTL_MS
  ) {
    userCount = userCountCache.count;
  } else {
    // 2. Check distributed cache
    try {
      const cached = await cacheService.get<{
        count: number;
        timestamp: number;
      }>("userCount", tenantId ?? undefined);
      if (cached && now - cached.timestamp < USER_COUNT_CACHE_TTL_MS) {
        userCountCache = cached; // Update in-memory cache from distributed cache
        userCount = cached.count;
      } else {
        // 3. Fetch from database if not in any cache or expired
        if (!auth) {
          return -1; // Database adapter not initialized
        }
        const filter = multiTenant && tenantId ? { tenantId: tenantId as DatabaseId } : {};
        const bypassOpts = !tenantId
          ? { bypassTenantCheck: true }
          : { tenantId: tenantId as DatabaseId };
        userCount = await auth.getUserCount(filter, bypassOpts);
        const cacheData = { count: userCount, timestamp: now };
        userCountCache = cacheData; // Update in-memory cache
        await cacheService.set(
          "userCount",
          cacheData,
          USER_COUNT_CACHE_TTL_S,
          tenantId ?? undefined,
        ); // Update distributed cache
      }
    } catch (err) {
      logger.warn(
        `User count cache or query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return -1; // Error fetching from cache or DB
    }
  }

  return userCount;
}

/**
 * Get cached roles for access checks (database-only)
 * Returns empty array if database is unavailable - caller should handle setup redirect
 */
async function getCachedRoles(tenantId?: DatabaseId | null): Promise<Role[]> {
  const now = Date.now();
  const key = tenantId || "global";

  const cached = rolesCache.get(key.toString());
  if (cached && now - cached.timestamp < USER_PERM_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    if (!auth) {
      logger.debug("Database adapter not initialized - roles unavailable");
      return [];
    }

    const bypassOpts =
      !tenantId || tenantId === "global"
        ? { bypassTenantCheck: true }
        : { tenantId: tenantId as DatabaseId };
    const data = await auth.getAllRoles(bypassOpts);
    if (!data || data.length === 0) {
      logger.debug("No roles found in database", { tenantId });
      return [];
    }

    const cacheData = { data, timestamp: now };
    rolesCache.set(key.toString(), cacheData);
    await cacheService.set(`roles:${key}`, cacheData, USER_PERM_CACHE_TTL_S, tenantId ?? undefined);
    return data;
  } catch (err) {
    logger.error(
      `Failed to fetch roles from database: ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

// --- MAIN HANDLE ---

export const handleAuthorization: Handle = async ({ event, resolve }) => {
  const { url, locals, request } = event;
  const { user } = locals;
  const pathname = url.pathname;

  // Dynamic imports for settings to avoid circular dependencies in hooks
  const { getPrivateSettingSync } = await import("@src/services/settings-service");

  const isApi = pathname.startsWith("/api/");
  const isPublic = isPublicRoute(pathname, request.method, process.env.TEST_MODE);

  if (pathname.includes("/api/testing")) {
    console.log(
      `[Authorization] Path: ${pathname}, TEST_MODE: ${process.env.TEST_MODE}, isPublic: ${isPublic}`,
    );
  }

  // --- Skip static or internal routes early ---
  const ASSET_REGEX =
    /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map|json))/;
  if (
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/_") ||
    ASSET_REGEX.test(pathname)
  ) {
    return resolve(event);
  }

  // --- Check if first user (for setup flow) ---
  const multiTenant = getPrivateSettingSync("MULTI_TENANT");

  if (locals.isFirstUser === undefined) {
    const userCount = await getCachedUserCount(locals.tenantId as DatabaseId, !!multiTenant);
    locals.isFirstUser = userCount === 0;
  }

  // --- Public routes require no auth ---
  if (isPublic) {
    locals.isAdmin = false;
    locals.hasManageUsersPermission = false;
    return resolve(event);
  }
  // --- Load cached roles (database-only) ---
  const rolesData = await getCachedRoles(locals.tenantId as DatabaseId);

  // Deduplicate roles by ID to prevent UI glitches
  const uniqueRolesMap = new Map();
  for (const r of rolesData) {
    if (!uniqueRolesMap.has(r._id.toString())) {
      uniqueRolesMap.set(r._id.toString(), r);
    }
  }
  const uniqueRoles = Array.from(uniqueRolesMap.values());
  locals.roles = uniqueRoles;

  // --- Redirect to setup if database not initialized (no roles found) ---
  const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);
  if (
    uniqueRoles.length === 0 &&
    !pathname.startsWith("/setup") &&
    !isLocalizedSetup &&
    !pathname.startsWith("/api/system") &&
    !pathname.startsWith("/api/setup")
  ) {
    // If handleSetup already declared setup complete, don't redirect
    // back to /setup — use fallback roles instead to prevent a redirect loop
    if (locals.__setupConfigExists === true) {
      logger.warn(
        "No roles in DB but setup marked complete — using fallback roles to prevent redirect loop",
      );
      const { getDefaultRoles } = await import("@src/databases/auth/default-roles");
      locals.roles = getDefaultRoles();
    } else {
      logger.warn("No roles found in database - redirecting to setup", {
        pathname,
        tenantId: locals.tenantId,
      });
      if (isApi) {
        const errorMsg = "Service Unavailable: System not initialized. Please run setup.";
        throw new AppError(errorMsg, 503, "SYSTEM_NOT_INITIALIZED");
      }
      throw redirect(302, "/setup");
    }
  }

  // --- Handle authenticated users ---
  try {
    if (user) {
      const currentRoles = locals.roles;
      const userRole = currentRoles.find((r) => r._id.toString() === user.role?.toString());
      const isAdmin = !!userRole?.isAdmin || (user as any).isAdmin;

      // Ensure isAdmin is available on both locals and user object
      // (MongoDB resolves this via aggregation, other adapters may not)
      (user as any).isAdmin = isAdmin;
      locals.isAdmin = isAdmin;
      locals.hasAdminPermission = isAdmin;
      locals.hasManageUsersPermission =
        isAdmin || hasPermissionByAction(user, "manage", "user", undefined, currentRoles);

      // Redirect authenticated users away from public routes
      if (isPublic && !isOAuthRoute(pathname) && !isApi) {
        throw redirect(302, "/");
      }
    } else {
      // --- Handle unauthenticated users ---
      locals.isAdmin = false;
      locals.hasManageUsersPermission = false;

      // Block access to protected pages
      if (!(isPublic || locals.isFirstUser)) {
        if (isApi) {
          throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
        }
        throw redirect(302, "/login");
      }
    }

    // --- Allow OAuth routes to pass through ---
    if (isOAuthRoute(pathname)) {
      logger.trace("OAuth route detected, passing through");
    }

    const response = await resolve(event);

    // Intercept 403 Forbidden responses and redirect to the dedicated /forbidden page
    // Only for non-API requests and authenticated users
    if (response.status === 403 && !isApi && user) {
      logger.warn(
        `Redirecting authenticated user ${user._id} to /forbidden (was 403 on ${pathname})`,
      );
      return new Response(null, {
        status: 302,
        headers: { location: "/forbidden" },
      });
    }

    return response;
  } catch (err) {
    if (isApi) {
      return handleApiError(err, event);
    }

    if (err instanceof AppError) {
      throw error(err.status, err.message);
    }

    throw err;
  }
};

// --- CACHE INVALIDATION UTILITIES ---

export async function invalidateUserCountCache(tenantId?: string | null): Promise<void> {
  userCountCache = null;
  try {
    await cacheService.delete("userCount", tenantId);
    logger.debug("User count cache invalidated");
  } catch (err: any) {
    logger.error(`Failed to invalidate user count: ${err.message}`);
  }
}

export async function invalidateRolesCache(tenantId?: string | null): Promise<void> {
  const key = tenantId || "global";
  rolesCache.delete(key);
  try {
    await cacheService.delete(`roles:${key}`, tenantId);
    logger.debug(`Roles cache invalidated (tenant: ${tenantId || "global"})`);
  } catch (err: any) {
    logger.error(`Failed to invalidate roles cache: ${err.message}`);
  }
}
