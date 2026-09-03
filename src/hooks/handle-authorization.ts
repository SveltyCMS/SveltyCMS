/**
 * @file src/hooks/handle-authorization.ts
 * @description
 * Hardened multi-tenant authorization with cache stampede protection and strict type-safe role matching.
 *
 * ### Features:
 * - Role/permission resolution with TTL caches
 * - Turbo auth context hand-off for GET fast-path
 * - Admin / first-user / site-starter gates
 * - Public-route allowlist short-circuit
 */

import { AuthGuardService } from "@src/services/security/auth-guard";
import { isAdmin, getRequestFlags, isPublicRoute } from "@utils/hook-utils";
import { SetupState } from "@utils/server/setup-check";
import { readSessionCookie, isSecureCookieContext } from "@src/databases/auth/constants";
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
import { error, redirect, type RequestEvent } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { isMultiTenantEnabled } from "@utils/tenant";
import { testWorkerContext } from "@utils/test-worker-context";
import { setTurboAuthContext } from "./handle-turbo-get";
import { getRoleBitset } from "@src/databases/auth/permissions";

const IS_BUN_TEST =
  typeof globalThis !== "undefined" && !!(globalThis as any).process?.env?.BUN_TEST;
const IS_TEST_MODE =
  typeof globalThis !== "undefined" &&
  ((globalThis as any).process?.env?.TEST_MODE === "true" ||
    (globalThis as any).process?.env?.VITE_TEST_MODE === "true");

let multiTenantCached: boolean | null = null;
const userCountCache = new Map<string, { count: number; timestamp: number }>();
const rolesCache = new Map<string, { data: Role[]; timestamp: number }>();

// Bounded capacity — per-tenant keys must never grow without bound in
// multi-tenant deployments (plain Maps would leak memory over time).
const MAX_CACHE_ENTRIES = 1000;

/** Insert into a bounded Map, evicting the oldest key at capacity. */
function setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V): void {
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, value);
}

/**
 * Match a user's role field against role records by EITHER id or name —
 * user.role may hold a role id ("role_admin") or a role name ("admin").
 */
function findMatchingRole(roles: Role[], targetRole: unknown): Role | undefined {
  if (!targetRole) return undefined;
  const targetStr = String(targetRole).toLowerCase();
  return roles.find(
    (r: Role) => String(r._id).toLowerCase() === targetStr || r.name?.toLowerCase() === targetStr,
  );
}

/**
 * Enforces per-role MFA requirement. If the user's assigned role requires MFA
 * and the user has not completed 2FA setup, gates access to protected resources.
 */
export function checkMfaRequirement(
  user: any,
  userRole: Role | undefined,
  pathname: string,
  isApi: boolean,
  sessionAmr?: string[],
): void {
  if (userRole?.mfaRequired) {
    const isMfaExemptPath =
      pathname.startsWith("/user") ||
      pathname.startsWith("/api/auth/2fa") ||
      pathname === "/logout" ||
      pathname.startsWith("/api/auth/logout") ||
      pathname.startsWith("/api/auth/session");

    if (isMfaExemptPath) return;

    if (!user?.is2FAEnabled) {
      logger.warn(
        `[Authz] MFA required for role "${userRole.name || userRole._id}". User ${user?.email} not enrolled.`,
      );
      if (isApi) {
        throw new AppError(
          "Multi-Factor Authentication enrollment is required for your role.",
          403,
          "MFA_REQUIRED",
        );
      }
      throw redirect(302, "/user?tab=security&mfa=required");
    }

    // 🛡️ TRUSTED-DEVICE SESSION ELEVATION (2026):
    // If the role strictly mandates MFA and the session used a trusted-device bypass (amr: ["pwd", "trusted_device"])
    // without entering an interactive second factor (missing "mfa"), lift device trust to session MFA level
    // by requiring a step-up challenge on high-privilege administrative / mutation paths.
    if (sessionAmr && sessionAmr.includes("trusted_device") && !sessionAmr.includes("mfa")) {
      const isHighPrivilegeOperation =
        pathname.startsWith("/api/system") ||
        pathname.startsWith("/api/user/roles") ||
        pathname.startsWith("/api/collections/delete") ||
        pathname.startsWith("/api/audit");

      if (isHighPrivilegeOperation) {
        logger.warn(
          `[Authz] Step-up MFA required for high-privilege path "${pathname}". Session AMR is trusted_device-only.`,
        );
        if (isApi) {
          throw new AppError(
            "Step-up Multi-Factor Authentication is required for this operation.",
            403,
            "STEP_UP_MFA_REQUIRED",
          );
        }
        throw redirect(302, "/user?tab=security&stepup=required");
      }
    }
  }
}

// Cache stampede mitigation: in-flight promise deduplication
const inflightUserCounts = new Map<string, Promise<number>>();
const inflightRoles = new Map<string, Promise<Role[]>>();

let cachedDefaultRoles: typeof import("@src/databases/auth/default-roles") | null = null;

async function getDefaultRoles() {
  if (!cachedDefaultRoles) cachedDefaultRoles = await import("@src/databases/auth/default-roles");
  return cachedDefaultRoles;
}

function getCachedMultiTenant() {
  if (multiTenantCached === null) multiTenantCached = isMultiTenantEnabled();
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
        setBoundedCache(userCountCache, key, cachedDist);
        return cachedDist.count;
      }

      if (!auth) return -1;
      const filter = multiTenant && tenantId ? { tenantId: tenantId as DatabaseId } : {};
      const bypassOpts = !tenantId
        ? { bypassTenantCheck: true }
        : { tenantId: tenantId as DatabaseId };
      if (typeof auth.getUserCount !== "function") return -1;
      const count = await auth.getUserCount(filter, bypassOpts);
      if (count < 0) return count;
      const cacheData = { count, timestamp: now };
      setBoundedCache(userCountCache, key, cacheData);
      await cacheService.set(
        `userCount:${key}`,
        cacheData,
        USER_COUNT_CACHE_TTL_S,
        tenantId ?? undefined,
      );
      void cacheService.set(
        `layout:userCount:${key}`,
        count,
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
      // 🛡️ PROXY SHAPE GUARD: `auth` is a Proxy over __AUTH_INSTANCE__ — the
      // proxy object is ALWAYS truthy, even when the global instance is unset
      // (a page request racing the boot, or the auth service initializer
      // failing). `if (!auth)` can therefore never fire; a truthy proxy with a
      // missing method previously threw "getAllRoles is not a function" on the
      // roles path. Guard the method shape, mirroring getUserCount.
      if (!auth || typeof auth.getAllRoles !== "function") return [];
      const bypassOpts =
        !tenantId || tenantId === "global"
          ? { bypassTenantCheck: true }
          : { tenantId: tenantId as DatabaseId };
      const data = await auth.getAllRoles(bypassOpts);
      if (!data?.length) return [];
      const cacheData = { data, timestamp: now };
      setBoundedCache(rolesCache, key, cacheData);
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
      const userRole = findMatchingRole(event.locals.roles || [], user.role);
      if (userRole?.isAdmin) {
        locals.isAdmin = true;
        (user as any).isAdmin = true;
      }
    }
    return resolve(event);
  }

  if ((locals as any).__turboAuth === true) {
    locals.isAdmin = isAdmin(user) || (user as any)?.isAdmin;
    // 🛡️ The turbo fast path skips full role hydration — but page loaders
    // (access-management, media, dashboard) read locals.roles to render
    // role/permission matrices. A warm turbo context populated during an early
    // request can carry EMPTY roles (e.g. right after a wizard reset), and the
    // 60s TTL would keep serving empty matrices. Hydrate on miss.
    if (!Array.isArray(locals.roles) || locals.roles.length === 0) {
      try {
        const roles = await getCachedRoles(event.locals.tenantId as DatabaseId);
        if (roles.length > 0) event.locals.roles = roles;
      } catch {
        /* keep existing locals.roles */
      }
    }
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
  if (IS_TEST_MODE && (pathname.startsWith("/api/testing") || isApi)) {
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
    // Logged-in users have no business on the auth screens — bounce them to /
    // (previously this redirect lived in the NON-public branch after isPublic
    // had already returned: dead code that would have 302-looped on "/").
    if (user && (pathname === "/login" || pathname === "/setup")) {
      logger.debug(`[Authz] Redirecting authenticated user away from ${pathname} to /`);
      throw redirect(302, "/");
    }

    if (pathname === "/" && !locals.isFirstUser && !user) {
      const { isSiteStarterEnabled } = await import("@src/services/site/site-config.server");
      if (!isSiteStarterEnabled()) {
        logger.debug("[Authz] Redirecting unauthenticated user from / to /login");
        throw redirect(302, "/login");
      }
    }
    locals.isAdmin = false;
    locals.hasManageUsersPermission = false;
    return resolve(event);
  }

  if (user && (isAdmin(user) || (user as any).isAdmin)) {
    locals.isAdmin = true;
    locals.hasAdminPermission = true;
    locals.hasManageUsersPermission = true;
    // Page loaders (media, dashboard, access-management) inspect locals.roles.
    // For API requests, skip the async role fetch on the hot write path.
    if (!isApi) {
      try {
        const roles = await getCachedRoles(event.locals.tenantId as DatabaseId);
        event.locals.roles = roles.length > 0 ? roles : event.locals.roles || [];
      } catch {
        event.locals.roles = event.locals.roles || [];
      }
    } else {
      event.locals.roles = (user as any).roles || event.locals.roles || [];
    }
    const adminRole = findMatchingRole(event.locals.roles || [], user.role);
    checkMfaRequirement(user, adminRole, pathname, isApi, event.locals.sessionAmr);
    _populateTurboAuth(event, user, event.locals.roles || []);
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
      const userRole = findMatchingRole(activeRoles, user.role);
      checkMfaRequirement(user, userRole, pathname, isApi, event.locals.sessionAmr);
      const isAdminUser = !!userRole?.isAdmin || isAdmin(user);
      (user as any).isAdmin = isAdminUser;
      locals.isAdmin = isAdminUser;
      locals.hasAdminPermission = isAdminUser;
      locals.hasManageUsersPermission =
        isAdminUser ||
        AuthGuardService.checkPermissions(user, "manage", "user", undefined, activeRoles);
    } else {
      logger.debug(`[Authz] No user, path=${pathname}, redirecting to /login`);
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
    // handleAuthentication already resolved + validated the SAME cookie earlier
    // in this request's pipeline and stored the id on locals — prefer it over a
    // second cookie parse. The fallback keeps flows that reached here without
    // the session branch (e.g. API-key auth) byte-identical to the old behavior,
    // and passes the protocol-derived isSecure so all cookie readers share one
    // per-request parse slot.
    const resolvedSessionId = event.locals.session_id
      ? String(event.locals.session_id)
      : readSessionCookie(
          event.cookies,
          isSecureCookieContext(event.url.protocol, event.url.hostname),
        );
    const sessionId = resolvedSessionId || null;
    if (!sessionId) return;
    let bitset: Uint32Array;
    if (roles.length > 0) {
      // ID-OR-NAME matching: a name-only match previously fell back to
      // roles[0] (typically guest), caching LOWER privileges on the turbo path.
      const userRole = findMatchingRole(roles, user.role);
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
