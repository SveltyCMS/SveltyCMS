/**
 * @file src/routes/(app)/user/user.remote.ts
 * @description User remote functions — LocalCMS, no HTTP hop through /api.
 */

import { command, query, getRequestEvent } from "$app/server";
import { buildUpdateProfileBody } from "./user-remote-utils";
import { getRequestLocalCMS, remoteErrorMessage } from "@utils/server/request-cms.server";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { AppError } from "@utils/error-handling";
import { verifyPassword as verifyPasswordHash } from "@src/databases/auth";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { isAdmin } from "@src/databases/auth/constants";
import { invalidateSessionCache } from "@src/hooks/handle-authentication";
import type { User } from "@src/databases/auth/types";

export const updateProfile = command(
  "unchecked",
  async (
    data: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const event = getRequestEvent();
      getAuthenticatedUser(event.locals);
      const body = buildUpdateProfileBody(data);
      if (!body.user_id || body.user_id === "self") {
        const sessionId = event.locals.user?._id;
        if (sessionId) body.user_id = String(sessionId);
      }
      const { cms, tenantId } = await getRequestLocalCMS();
      const { applyUserAttributeUpdate } =
        await import("@utils/server/user-attribute-update.server");
      await applyUserAttributeUpdate(event, cms, tenantId as never, {
        user_id: body.user_id,
        newUserData: body.newUserData,
      });
      return { success: true, message: "Updated" };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Update failed") };
    }
  },
);

export const verifyPassword = query(
  "unchecked",
  async (password: string): Promise<{ valid: boolean }> => {
    const event = getRequestEvent();
    const user = event.locals.user;
    if (!user?._id || !password || typeof password !== "string") return { valid: false };
    try {
      const { cms, tenantId } = await getRequestLocalCMS();
      const freshResult = await cms.auth.getUserById(String(user._id), {
        tenantId: tenantId as never,
      });
      const freshUser = freshResult?.success ? freshResult.data : null;
      if (!freshUser?.password) return { valid: false };
      const valid = await verifyPasswordHash(freshUser.password, password);
      return { valid: !!valid };
    } catch {
      return { valid: false };
    }
  },
);

export const deleteUser = query(
  "unchecked",
  async (userIds: string[]): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const event = getRequestEvent();
      const caller = getAuthenticatedUser(event.locals);
      const canManage =
        event.locals.isAdmin === true ||
        isAdmin(caller) ||
        hasPermissionWithRoles(caller as User, "user:write", event.locals.roles ?? []);
      if (!canManage) throw new AppError("Forbidden", 403);
      const { cms, tenantId } = await getRequestLocalCMS();
      const result = await cms.auth.batchAction(userIds.map(String), "delete", {
        tenantId: tenantId as never,
      });
      if (!result.success) {
        return { success: false, error: result.message || "Delete failed" };
      }
      return { success: true, message: "Deleted" };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Delete failed") };
    }
  },
);

export const saveToken = query(
  "unchecked",
  async (
    data: Record<string, unknown>,
  ): Promise<{
    success: boolean;
    token?: string;
    message?: string;
    error?: string;
  }> => {
    try {
      const event = getRequestEvent();
      const caller = getAuthenticatedUser(event.locals);
      if (!event.locals.isAdmin && !isAdmin(caller)) throw new AppError("Forbidden", 403);
      const { cms, tenantId } = await getRequestLocalCMS();
      const isEdit = !!data.token;
      if (isEdit) {
        const result = await cms.tokens.update(
          String(data.token),
          {
            email: data.email,
            role: data.role,
            expiresInHours: data.expiresInHours || 48,
          } as never,
          { tenantId: tenantId as never },
        );
        // tokens.update returns the updated Token or undefined (missing id) —
        // failures are thrown as AppError inside the namespace.
        if (!result) {
          return {
            success: false,
            error: "Token not found",
          };
        }
        return { success: true, message: "Updated" };
      }
      const created = await cms.tokens.create({
        email: String(data.email ?? ""),
        role: String(data.role ?? "user"),
        expires: String(data.expiresIn || "2 days"),
        userId: String(caller._id),
        tenantId: tenantId as never,
      });
      const tokenVal =
        created && typeof created === "object" && "data" in created
          ? (created as { data?: { value?: string } | string }).data
          : created;
      const tokenStr =
        tokenVal && typeof tokenVal === "object" && tokenVal !== null && "value" in tokenVal
          ? String((tokenVal as { value?: string }).value)
          : typeof tokenVal === "string"
            ? tokenVal
            : undefined;
      return { success: true, token: tokenStr, message: "Token created" };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Token save failed") };
    }
  },
);

export const deleteTokenAction = query(
  "unchecked",
  async (token: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const event = getRequestEvent();
      const caller = getAuthenticatedUser(event.locals);
      if (!event.locals.isAdmin && !isAdmin(caller)) throw new AppError("Forbidden", 403);
      const { cms, tenantId } = await getRequestLocalCMS();
      await cms.tokens.delete(token, { tenantId: tenantId as never });
      return { success: true, message: "Deleted" };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Token delete failed") };
    }
  },
);

export const getActiveSessions = query(
  "unchecked",
  async (_event?: unknown): Promise<{ sessions?: unknown[]; error?: string }> => {
    try {
      const event = getRequestEvent();
      const user = getAuthenticatedUser(event.locals);
      const { cms, tenantId } = await getRequestLocalCMS();
      const result = await cms.auth.getActiveSessions(String(user._id), {
        tenantId: tenantId as never,
      });
      if (!result.success) {
        return { error: result.message || "Failed to load sessions" };
      }
      const currentSessionId = String(event.locals.session_id ?? "");
      // Sessions come back as strongly-typed `Session`, but the view model reads
      // optional legacy fields (ip/updatedAt/createdAt) not present on the type —
      // widen to the index-signature view once for the mapping.
      const sessions = ((result.data || []) as unknown as Record<string, unknown>[])
        .filter((s) => !s.rotated)
        .map((s) => {
          const sid = String(s._id ?? s.id ?? "");
          return {
            ...s,
            _id: sid,
            id: sid,
            ip: s.ip ?? s.ipAddress,
            ipAddress: s.ipAddress ?? s.ip,
            lastAccess: s.lastAccess ?? s.lastActiveAt ?? s.updatedAt ?? s.createdAt,
            lastActiveAt: s.lastActiveAt ?? s.updatedAt ?? s.createdAt,
            userAgent: s.userAgent ?? "",
            isCurrent: currentSessionId.length > 0 && sid === currentSessionId,
          };
        });
      let sawCurrent = false;
      for (const s of sessions) {
        if (s.isCurrent) {
          if (sawCurrent) s.isCurrent = false;
          else sawCurrent = true;
        }
      }
      return { sessions };
    } catch (err) {
      return { error: remoteErrorMessage(err, "Failed to load sessions") };
    }
  },
);

export const revokeSession = query(
  "unchecked",
  async (opts: {
    sessionId: string;
    reauthToken?: string;
  }): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const event = getRequestEvent();
      const user = getAuthenticatedUser(event.locals);
      const { cms, tenantId } = await getRequestLocalCMS();
      const currentSessionId = String(event.locals.session_id ?? "");
      const isCurrent = currentSessionId.length > 0 && opts.sessionId === currentSessionId;
      const adminBypass = event.locals.isAdmin === true || isAdmin(user);
      if (!isCurrent && !adminBypass) {
        const { verifyReauthToken } = await import("@utils/server/session-reauth.server");
        if (!verifyReauthToken(opts.reauthToken, String(user._id), currentSessionId)) {
          throw new AppError(
            "Re-authentication required to revoke sessions",
            403,
            "REAUTH_REQUIRED",
          );
        }
      }
      await cms.auth.logout(opts.sessionId);
      invalidateSessionCache(opts.sessionId, tenantId as never);
      return { success: true, message: "Revoked" };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Revoke failed") };
    }
  },
);

export const reauthForSessionManagement = query(
  "unchecked",
  async (password: string): Promise<{ token?: string; error?: string }> => {
    try {
      const event = getRequestEvent();
      const user = getAuthenticatedUser(event.locals);
      if (!password) throw new AppError("Password required", 400);
      const { cms, tenantId } = await getRequestLocalCMS();
      const freshResult = await cms.auth.getUserById(String(user._id), {
        tenantId: tenantId as never,
      });
      const hash = freshResult?.success ? freshResult.data?.password : null;
      if (!hash || !(await verifyPasswordHash(hash, password))) {
        throw new AppError("Invalid password", 403);
      }
      const sessionId = String(event.locals.session_id ?? "");
      if (!sessionId) throw new AppError("Session required", 401);
      const { signReauthToken, REAUTH_TOKEN_TTL_MS } =
        await import("@utils/server/session-reauth.server");
      return {
        token: signReauthToken(String(user._id), sessionId, Date.now() + REAUTH_TOKEN_TTL_MS),
      };
    } catch (err) {
      return { error: remoteErrorMessage(err, "Verification failed") };
    }
  },
);
