/**
 * @file src/hooks/handle-authorization.ts
 * @description Hardened multi-tenant authorization with cache stampede protection and strict type-safe role matching.
 */

import { AuthGuardService } from "@src/services/security/auth-guard";
import { isAdmin, getRequestFlags, isPublicRoute } from "@utils/hook-utils";
import { SetupState } from "@utils/server/setup-check";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
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
import { error, type Handle, redirect, type RequestEvent } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { testWorkerContext } from "@utils/test-worker-context";
import { setTurboAuthContext } from "./handle-turbo-get";
import { getRoleBitset } from "@src/databases/auth/permissions";

const IS_BUN_TEST =
  typeof globalThis !== "undefined" && !!(globalThis as any).process?.env?.BUN_TEST;
const IS_TEST_MODE =
  typeof globalThis !== "undefined" &&
  ((globalThis as any).process?.env?.TEST_MODE === "true" ||
    (globalThis as any).process?.env?.VITE_TEST_MODE === "true");
const IS_BENCHMARK =
  typeof globalThis !== "undefined" && (globalThis as any).process?.env?.BENCHMARK === "true";

let multiTenantCached: boolean | null = null;
const userCountCache = new Map<string, { count: number; timestamp: number }>();
const rolesCache = new Map<string, { data: Role[]; timestamp: number }>();

// Cache stampede mitigation: in-flight promise deduplication
const inflightUserCounts = new Map<string, Promise<number>>();
const inflightRoles = new Map<string, Promise<Role[]>>();

let cachedDefaultRoles: typeof import("@src/databases/auth/default-roles") | null = null;

async function getDefaultRoles() {
  if (!cachedDefaultRoles) cachedDefaultRoles = await import("@src/databases/auth/default-roles");
  return cachedDefaultRoles;
}

function getCachedMultiTenant() {
  if (multiTenantCached === null) multiTenantCached = !!getPrivateSettingSync("MULTI_TENANT");
  return multiTenantCached;
}

function getCacheKey(tenantId?: DatabaseId | null | string): string {
  const workerIndex = testWorkerContext.getStore() || "";
  const base = tenantId ? String(tenantId) : "global";
  return workerIndex ? `${workerIndex}:${base}` : base;
}

async function getCachedUserCount(
  tenantId?: DatabaseId | null,
  multiTenant?: boolean,
): Promise<number> {
  const now = Date.now();
  const key = getCacheKey(tenantId);

  const cached = userCountCache.get(key);
  if (!IS_BUN_TEST && cached && now - cached.timestamp < USER_COUNT_CACHE_TTL_MS)
    return cached.count;

  if (inflightUserCounts.has(key)) return inflightUserCounts.get(key)!;

  const workPromise = (async () => {
    try {
      const cachedDist = await cacheService.get<{
        count: number;
        timestamp: number;
      }>(`userCount:${key}`, tenantId ?? undefined);
      if (cachedDist && now - cachedDist.timestamp < USER_COUNT_CACHE_TTL_MS) {
        userCountCache.set(key, cachedDist);
        return cachedDist.count;
      }

      if (!auth) return -1;
      const filter = multiTenant && tenantId ? { tenantId: tenantId as DatabaseId } : {};
      const bypassOpts = !tenantId
        ? { bypassTenantCheck: true }
        : { tenantId: tenantId as DatabaseId };
      const count = await auth.getUserCount(filter, bypassOpts);
      if (count < 0) return count;
      const cacheData = { count, timestamp: now };
      userCountCache.set(key, cacheData);
      await cacheService.set(
        `userCount:${key}`,
        cacheData,
        USER_COUNT_CACHE_TTL_S,
        tenantId ?? undefined,
      );
      return count;
    } catch (err: any) {
      logger.warn(`User count failed: ${err.message}`);
      return -1;
    } finally {
      inflightUserCounts.delete(key);
    }
  })();
  inflightUserCounts.set(key, workPromise);
  return workPromise;
}

async function getCachedRoles(tenantId?: DatabaseId | null): Promise<Role[]> {
  const now = Date.now();
  const key = getCacheKey(tenantId);
  const cached = rolesCache.get(key);
  if (cached && now - cached.timestamp < USER_PERM_CACHE_TTL_MS) return cached.data;
  if (inflightRoles.has(key)) return inflightRoles.get(key)!;

  const workPromise = (async () => {
    try {
      if (!auth) return [];
      const bypassOpts =
        !tenantId || tenantId === "global"
          ? { bypassTenantCheck: true }
          : { tenantId: tenantId as DatabaseId };
      const data = await auth.getAllRoles(bypassOpts);
      if (!data?.length) return [];
      const cacheData = { data, timestamp: now };
      rolesCache.set(key, cacheData);
      await cacheService.set(
        `roles:${key}`,
        cacheData,
        USER_PERM_CACHE_TTL_S,
        tenantId ?? undefined,
      );
      return data;
    } catch (err: any) {
      logger.error(`Roles fetch failed: ${err.message}`);
      return [];
    } finally {
      inflightRoles.delete(key);
    }
  })();
  inflightRoles.set(key, workPromise);
  return workPromise;
}

export const handleAuthorization: Handle = async ({ event, resolve }) => {
  const { url, locals } = event;
  const { user } = locals;
  const pathname = url.pathname;

  if ((locals as any).__testBypass) {
    locals.isAdmin = isAdmin(user) || (user as any)?.isAdmin === true;
    if (!pathname.startsWith("/api/") && user) {
      const roles = await getCachedRoles(event.locals.tenantId as DatabaseId);
      if (roles.length > 0) event.locals.roles = roles;
      else if ((locals as any).__setupConfigExists !== false) {
        const { getDefaultRoles: getDefaultRolesMod } = await getDefaultRoles();
        event.locals.roles = getDefaultRolesMod();
      }
      const userRoleStr = String(user.role).toLowerCase();
      const userRole = (event.locals.roles || []).find(
        (r: Role) => String(r._id) === String(user.role) || r.name?.toLowerCase() === userRoleStr,
      );
      if (userRole?.isAdmin) {
        locals.isAdmin = true;
        (user as any).isAdmin = true;
      }
    }
    return resolve(event);
  }

  if ((locals as any).__turboAuth === true) {
    locals.isAdmin = isAdmin(user) || (user as any)?.isAdmin;
    return resolve(event);
  }

  const flags = getRequestFlags(locals as any);
  if (flags.isStatic) return resolve(event);

  const setupState = (locals as any).__setupState || SetupState.COMPLETE;
  (locals as any).__setupConfigExists = setupState !== SetupState.MISSING_CONFIG;

  if (setupState !== SetupState.COMPLETE) {
    locals.isAdmin = false;
    locals.hasManageUsersPermission = false;
    return await resolve(event);
  }

  const isApi = pathname.startsWith("/api/");
  if (IS_TEST_MODE && !IS_BENCHMARK && (pathname.startsWith("/api/testing") || isApi)) {
    locals.isAdmin = isAdmin(user);
    return await resolve(event);
  }

  const isPublic = (locals as any).__flags ? flags.isPublic : isPublicRoute(pathname, IS_TEST_MODE);
  const multiTenant = getCachedMultiTenant();
  if (locals.isFirstUser === undefined) {
    locals.isFirstUser =
      (await getCachedUserCount(locals.tenantId as DatabaseId, multiTenant)) === 0;
  }

  if (isPublic) {
    if (pathname === "/" && !locals.isFirstUser && !user) {
      logger.info("[Authz] Redirecting unauthenticated user from / to /login");
      throw redirect(302, "/login");
    }
    locals.isAdmin = false;
    locals.hasManageUsersPermission = false;
    return resolve(event);
  }

  if (user && (isAdmin(user) || (user as any).isAdmin)) {
    locals.isAdmin = true;
    locals.hasAdminPermission = true;
    locals.hasManageUsersPermission = true;
    _populateTurboAuth(event, user, []);
    return await resolve(event);
  }

  const roles = await getCachedRoles(event.locals.tenantId as DatabaseId);
  event.locals.roles = roles;

  if (
    roles.length === 0 &&
    !pathname.startsWith("/setup") &&
    !pathname.startsWith("/api/system") &&
    !pathname.startsWith("/api/setup")
  ) {
    if (event.locals.__setupConfigExists) {
      const { getDefaultRoles: getDefaultRolesMod } = await getDefaultRoles();
      event.locals.roles = getDefaultRolesMod();
    } else {
      if (isApi) throw new AppError("System not initialized", 503, "SYSTEM_NOT_INITIALIZED");
      throw redirect(302, "/setup");
    }
  }

  try {
    const activeRoles = event.locals.roles || [];
    if (user) {
      const userRoleStr = String(user.role);
      const userRole = activeRoles.find((r: Role) => String(r._id) === userRoleStr);
      const isAdminUser = !!userRole?.isAdmin || isAdmin(user);
      (user as any).isAdmin = isAdminUser;
      locals.isAdmin = isAdminUser;
      locals.hasAdminPermission = isAdminUser;
      locals.hasManageUsersPermission =
        isAdminUser ||
        AuthGuardService.checkPermissions(user, "manage", "user", undefined, activeRoles);
      if (isPublic && !isApi) throw redirect(302, "/");
    } else if (!locals.isFirstUser) {
      logger.info(
        `[Authz] No user, isFirstUser=${locals.isFirstUser}, path=${pathname}, redirecting to /login`,
      );
      if (isApi) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
      throw redirect(302, "/login");
    }
    _populateTurboAuth(event, user!, activeRoles);
    return await resolve(event);
  } catch (err) {
    if (isApi) return handleApiError(err, event);
    if (err instanceof AppError) throw error(err.status, err.message);
    throw err;
  }
};

function _populateTurboAuth(event: RequestEvent, user: any, roles: Role[]): void {
  try {
    const sessionId =
      event.cookies.get(SESSION_COOKIE_NAME) ||
      event.cookies.get(`__Host-${SESSION_COOKIE_NAME}`) ||
      event.cookies.get(`__Secure-${SESSION_COOKIE_NAME}`);
    if (!sessionId) return;
    let bitset: Uint32Array;
    if (roles.length > 0) {
      const userRole = roles.find((r: Role) => String(r._id) === String(user.role));
      bitset = userRole ? getRoleBitset(userRole) : getRoleBitset(roles[0]);
    } else {
      bitset = new Uint32Array(1);
    }
    setTurboAuthContext(sessionId, user, roles, bitset, event.locals.tenantId || null);
  } catch {}
}

export async function invalidateUserCountCache(tenantId?: string | null): Promise<void> {
  const key = getCacheKey(tenantId);
  userCountCache.delete(key);
  cacheService.delete(`userCount:${key}`, tenantId ?? undefined).catch(() => {});
}
export async function invalidateRolesCache(tenantId?: string | null): Promise<void> {
  const key = getCacheKey(tenantId);
  rolesCache.delete(key);
  cacheService.delete(`roles:${key}`, tenantId ?? undefined).catch(() => {});
}
