/**
 * @file src/utils/server/user-attribute-update.server.ts
 * @description Privilege-safe user attribute patch used by the API handler and remotes.
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/databases/db-interface";
import type { User } from "@src/databases/auth/types";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import {
  hasCredentialChangeFields,
  hasPrivilegedUserFields,
  isAdminCaller,
  sanitizeClientUserAttributePatch,
} from "@utils/security/user-attribute-policy";
import { verifyPassword } from "@src/databases/auth";
import { sanitizeUserForClient } from "@src/databases/auth/session-user";
import { verifyReauthToken, verifyUserReauthToken } from "@utils/server/session-reauth.server";
import { AppError, raise, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { invalidateSessionCache, primeSessionMemoryCache } from "@src/hooks/handle-authentication";
import { readSessionCookie } from "@utils/security/session-cookie";
import { withSystemScope } from "@src/databases/system-tenant-scope";

/** Cached lazy handle to the turbo GET hook — one module-registry lookup instead of one per call. */
let handleTurboGetModulePromise: Promise<typeof import("@src/hooks/handle-turbo-get")> | undefined;
function loadHandleTurboGetModule(): Promise<typeof import("@src/hooks/handle-turbo-get")> {
  return (handleTurboGetModulePromise ??= import("@src/hooks/handle-turbo-get"));
}

/** Cached lazy handle to the cache service — one module-registry lookup instead of one per call. */
let cacheServiceModulePromise:
  | Promise<typeof import("@src/databases/cache/cache-service")>
  | undefined;
function loadCacheServiceModule(): Promise<typeof import("@src/databases/cache/cache-service")> {
  return (cacheServiceModulePromise ??= import("@src/databases/cache/cache-service"));
}

/** Cached lazy handle to the layout-cache invalidator — one module-registry lookup instead of one per call. */
let layoutCachesModulePromise:
  | Promise<typeof import("@utils/server/layout-caches.server")>
  | undefined;
function loadLayoutCachesModule(): Promise<typeof import("@utils/server/layout-caches.server")> {
  return (layoutCachesModulePromise ??= import("@utils/server/layout-caches.server"));
}

/** Normalize a user's tenant ownership for comparison (null/empty → no tenant). */
function tenantIdOf(user: unknown): string | null {
  const raw = (user as { tenantId?: unknown } | null)?.tenantId;
  if (raw === undefined || raw === null || raw === "") return null;
  return String(raw);
}

/** Extract a User from either `{ data }` adapter results or direct user objects. */
function extractUserRecord(res: unknown): User | null {
  if (!res || typeof res !== "object") return null;
  if ("data" in res) {
    return ((res as { data?: User | null }).data ?? null) as User | null;
  }
  if ("success" in res) {
    return null;
  }
  return res as User;
}

export async function applyUserAttributeUpdate(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  body: Record<string, unknown>,
): Promise<unknown> {
  const caller = event.locals.user;
  if (!caller?._id) throw new AppError("Unauthorized", 401);

  const { user_id, newUserData, ...directUpdates } = body;
  const targetId = !user_id || user_id === "self" ? caller._id : user_id;
  if (!targetId) throw new AppError("User ID is required", 400);
  const targetIdStr = String(targetId);
  const callerIdStr = String(caller._id);

  const isSelf = targetIdStr === callerIdStr;
  const isAdmin = isAdminCaller(caller);
  const roles = (event.locals.roles ?? []) as Parameters<typeof hasPermissionWithRoles>[2];
  const canManageUsers = isAdmin || hasPermissionWithRoles(caller as User, "user:write", roles);
  if (!isSelf && !canManageUsers) {
    throw new AppError("Forbidden: cannot update another user", 403);
  }

  const merged: Record<string, unknown> =
    newUserData && typeof newUserData === "object"
      ? { ...directUpdates, ...(newUserData as Record<string, unknown>) }
      : { ...directUpdates };

  // Non-admin user:write holders may never reset another user's credentials or
  // touch an administrator account (prevents role-denylist bypass via password reset).
  if (!isSelf && !isAdmin) {
    if (hasCredentialChangeFields(merged)) {
      raise(
        403,
        "Admin privileges required to change another user's email or password",
        "FORBIDDEN_CREDENTIAL_RESET",
      );
    }
    try {
      const targetLookupOpts = tenantId ? { tenantId } : withSystemScope("auth-bootstrap");
      const targetRes = await cms.auth.getUserById(targetIdStr, targetLookupOpts as never);
      const targetUser = extractUserRecord(targetRes);
      if (targetUser && isAdminCaller(targetUser as { isAdmin?: boolean; role?: string })) {
        raise(403, "Forbidden: cannot modify an administrator account", "FORBIDDEN_TARGET_RANK");
      }
    } catch (err) {
      rethrow(err);
      if (err instanceof AppError && err.status === 403) throw err;
    }
  }

  if (hasPrivilegedUserFields(merged) && !isAdmin) {
    logger.warn(
      `[Auth] Stripped privileged fields from update-user-attributes (user=${caller._id})`,
    );
  }

  const updates = sanitizeClientUserAttributePatch(merged, { isAdmin });

  // H1: a self-service change of email or password must prove the current
  // password for THIS request, either via x-reauth-token (5 min TTL) or
  // server-side verification of currentPassword against the stored hash.
  const isPasswordUpdating =
    "password" in merged &&
    merged.password !== undefined &&
    String(merged.password).trim().length > 0;
  const callerEmail = typeof caller.email === "string" ? caller.email.trim().toLowerCase() : "";
  const isEmailUpdating =
    "email" in merged &&
    merged.email !== undefined &&
    String(merged.email).trim().toLowerCase() !== callerEmail;

  if (isSelf && (isPasswordUpdating || isEmailUpdating)) {
    const sessionCandidates = [
      String((event.locals.session_id as DatabaseId | undefined) ?? ""),
      String(readSessionCookie(event.cookies, event.url.protocol === "https:") ?? ""),
    ].filter((id) => id.length > 0);
    const proof = event.request.headers.get("x-reauth-token");
    let proven =
      sessionCandidates.some((id) => verifyReauthToken(proof, callerIdStr, id)) ||
      verifyUserReauthToken(proof, callerIdStr);

    if (
      !proven &&
      typeof merged.currentPassword === "string" &&
      merged.currentPassword.length > 0
    ) {
      try {
        const freshOpts = tenantId ? { tenantId } : withSystemScope("auth-bootstrap");
        const freshRes = await cms.auth.getUserById(callerIdStr, freshOpts as never);
        const freshUser = extractUserRecord(freshRes);
        if (freshUser?.password) {
          proven = Boolean(await verifyPassword(freshUser.password, merged.currentPassword));
        }
      } catch {
        proven = false;
      }
    }

    if (!proven) {
      raise(403, "Re-authentication required to change email or password", "REAUTH_REQUIRED");
    }
  }
  if (Object.keys(updates).length === 0) {
    throw new AppError("At least one user attribute is required", 400);
  }

  const updateOpts: {
    tenantId?: DatabaseId;
    systemScope?: ReturnType<typeof withSystemScope>["systemScope"];
    allowPrivilegeEscalation?: boolean;
  } = {};
  if (isAdmin) updateOpts.allowPrivilegeEscalation = true;
  if (tenantId) {
    updateOpts.tenantId = tenantId;
  } else {
    // Single-tenant / legacy profile route without a tenant context — branded
    // system scope (auth-bootstrap) instead of the deprecated bypass boolean
    // the tenant isolation gate (lint:tenant) rejects.
    updateOpts.systemScope = withSystemScope("auth-bootstrap").systemScope;
  }

  let resolvedId = targetIdStr;
  let result = await cms.auth.updateUserAttributes(resolvedId, updates, updateOpts);

  if (
    !result.success &&
    /not found/i.test(String(result.message || "")) &&
    event.locals.user?.email
  ) {
    try {
      const email = String(event.locals.user.email);

      // Resolve the legacy "stale session id after re-seed" case inside the
      // ambient tenant only. Never let the fallback cross a tenant boundary.
      const byEmail = await cms.auth.getUserByEmail(email, { tenantId } as never);
      const emailUser = byEmail?.success && byEmail.data ? byEmail.data : null;

      if (emailUser) {
        const ownerTenant = tenantIdOf(emailUser);
        if (tenantId && ownerTenant !== String(tenantId)) {
          raise(409, "Email is already in use in another tenant", "EMAIL_IN_USE");
        }
        const emailId = (emailUser as { _id?: DatabaseId })._id;
        if (emailId && String(emailId) !== resolvedId) {
          resolvedId = String(emailId);
          result = await cms.auth.updateUserAttributes(resolvedId, updates, {
            tenantId,
            ...(isAdmin ? { allowPrivilegeEscalation: true } : {}),
          } as never);
        }
      } else if (tenantId) {
        // The adapter scoped the lookup correctly and found no user. Check
        // whether the same email is owned by another tenant: if so this is a
        // cross-tenant conflict, not a resolvable fallback — reject and never
        // touch the foreign record.
        const foreign = await cms.auth.getUserByEmail(String(email), {
          ...withSystemScope("auth-bootstrap"),
        } as never);
        const foreignUser = foreign?.success && foreign.data ? foreign.data : null;
        const foreignTenant = foreignUser ? tenantIdOf(foreignUser) : null;
        if (foreignUser && foreignTenant !== String(tenantId)) {
          raise(409, "Email is already in use in another tenant", "EMAIL_IN_USE");
        }
      }
    } catch (err) {
      rethrow(err);
      // Preserve intentional 409s; lookup failures keep the original result.
      if (err instanceof AppError) throw err;
      logger.debug("[Auth] Email fallback lookup failed", err);
    }
  }

  if (!result.success) throw new AppError(result.message || "Update failed", 400);

  try {
    const { invalidateLayoutUserCache } = await loadLayoutCachesModule();
    await invalidateLayoutUserCache(resolvedId, tenantId as string | undefined);
  } catch {
    /* server cache helper unavailable */
  }

  try {
    const { invalidateTurboAuthForUser } = await loadHandleTurboGetModule();
    invalidateTurboAuthForUser(resolvedId);
  } catch {
    /* turbo auth cache helper unavailable */
  }

  const currentSessionId =
    (event.locals.session_id as DatabaseId | undefined) ??
    readSessionCookie(event.cookies, event.url.protocol === "https:");
  if (targetIdStr === callerIdStr && currentSessionId && result.data) {
    primeSessionMemoryCache(currentSessionId, result.data as User);
    try {
      const { cacheService } = await loadCacheServiceModule();
      const cacheKey = tenantId
        ? `session:${tenantId}:${currentSessionId}`
        : `session:${currentSessionId}`;
      cacheService.delete(cacheKey, tenantId ?? undefined).catch(() => {});
    } catch {
      /* memory-only is fine */
    }
  }

  const hasPasswordField = "password" in updates || "password" in body;
  if (hasPasswordField) {
    const sessionId = event.locals.session_id as DatabaseId | undefined;
    const sessionsResult = await cms.auth.getActiveSessions(targetIdStr, { tenantId });
    const otherSessions = (
      (sessionsResult as { data?: Array<{ _id?: string }> }).data || []
    ).filter((s) => s._id !== sessionId);
    await cms.auth.invalidateAllUserSessions(targetIdStr, { tenantId });
    for (const s of otherSessions) {
      if (s._id) invalidateSessionCache(s._id, tenantId);
    }
  }

  return sanitizeUserForClient(result.data);
}

/**
 * Prevents non-admin callers (e.g. a role holding `user:write`) from deleting,
 * blocking, or unblocking administrator accounts via batch operations.
 */
export async function assertNonAdminTargetsForCaller(
  cms: LocalCMS,
  targetIds: readonly string[],
  tenantId: DatabaseId | undefined,
  caller: { isAdmin?: boolean; role?: string } | null | undefined,
): Promise<void> {
  if (isAdminCaller(caller)) return;
  const lookupOpts = tenantId ? { tenantId } : withSystemScope("auth-bootstrap");
  for (const id of targetIds) {
    try {
      const targetRes = await cms.auth.getUserById(id, lookupOpts as never);
      const targetUser = extractUserRecord(targetRes);
      if (targetUser && isAdminCaller(targetUser as { isAdmin?: boolean; role?: string })) {
        raise(403, "Forbidden: cannot modify an administrator account", "FORBIDDEN_TARGET_RANK");
      }
    } catch (err) {
      rethrow(err);
      if (err instanceof AppError && err.status === 403) throw err;
    }
  }
}
