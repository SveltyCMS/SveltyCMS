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
  hasPrivilegedUserFields,
  isAdminCaller,
  sanitizeClientUserAttributePatch,
} from "@utils/security/user-attribute-policy";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { invalidateSessionCache, primeSessionMemoryCache } from "@src/hooks/handle-authentication";
import { readSessionCookie } from "@src/databases/auth/constants";
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

  if (hasPrivilegedUserFields(merged) && !isAdmin) {
    logger.warn(
      `[Auth] Stripped privileged fields from update-user-attributes (user=${caller._id})`,
    );
  }

  const updates = sanitizeClientUserAttributePatch(merged, { isAdmin });
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
      // Email fallback resolves the user across tenants — branded system scope.
      const byEmail = await cms.auth.getUserByEmail(String(event.locals.user.email), {
        ...withSystemScope("auth-bootstrap"),
      } as never);
      const emailUser =
        byEmail?.success && byEmail.data
          ? byEmail.data
          : byEmail && typeof byEmail === "object" && "_id" in (byEmail as object)
            ? (byEmail as unknown as { _id: string })
            : null;
      const emailId = emailUser && (emailUser as { _id?: string })._id;
      if (emailId && String(emailId) !== resolvedId) {
        resolvedId = String(emailId);
        result = await cms.auth.updateUserAttributes(resolvedId, updates, {
          ...withSystemScope("auth-bootstrap"),
          ...(isAdmin ? { allowPrivilegeEscalation: true } : {}),
        } as never);
      }
    } catch {
      /* keep original failure */
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

  return result.data;
}
