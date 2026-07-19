/**
 * @file src/routes/(app)/user/user.remote.ts
 * @description User Remote Functions — callable directly from client components.
 *
 * All exports are SvelteKit query() wrappers that provide full type inference.
 * Plain interface exports have been moved inline or removed per SvelteKit .remote.ts rules.
 *
 * ### Features:
 * - CSRF headers on all mutating internal fetches (defense-in-depth)
 * - Clean separation of user_id vs newUserData for profile updates
 * - Token create/edit/delete, session list/revoke, batch delete
 */

import { command, query, getRequestEvent } from "$app/server";
import { buildUpdateProfileBody, remoteJsonHeaders } from "./user-remote-utils";

// Not re-exported: SvelteKit .remote.ts files require all exports to be remote functions.
// Use user-remote-utils.ts directly in tests.

/** Profile mutation — must be `command` (not query) so body is always posted. */
export const updateProfile = command(
  "unchecked",
  async (
    data: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    const event = getRequestEvent();
    const body = buildUpdateProfileBody(data);
    // Own-profile safety: empty/self resolves to session user so client never sends a stale id
    if (!body.user_id || body.user_id === "self") {
      const sessionId = event.locals.user?._id;
      if (sessionId) body.user_id = String(sessionId);
    }
    const r = await event.fetch("/api/user/update-user-attributes", {
      method: "PUT",
      headers: remoteJsonHeaders(event.cookies),
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    const errMsg =
      (d as { message?: string; error?: string | { message?: string } }).message ||
      (typeof (d as { error?: unknown }).error === "string"
        ? (d as { error: string }).error
        : (d as { error?: { message?: string } }).error?.message) ||
      "Update failed";
    return r.ok ? { success: true, message: "Updated" } : { success: false, error: errMsg };
  },
);

export const verifyPassword = query(
  "unchecked",
  async (password: string): Promise<{ valid: boolean }> => {
    const event = getRequestEvent();
    const r = await event.fetch("/api/user/verify-password", {
      method: "POST",
      headers: remoteJsonHeaders(event.cookies),
      body: JSON.stringify({ password }),
    });
    const d = await r.json().catch(() => ({}));
    return { valid: !!(d as { valid?: boolean }).valid };
  },
);

export const deleteUser = query(
  "unchecked",
  async (userIds: string[]): Promise<{ success: boolean; message?: string; error?: string }> => {
    const event = getRequestEvent();
    const r = await event.fetch("/api/user/batch", {
      method: "POST",
      headers: remoteJsonHeaders(event.cookies),
      body: JSON.stringify({ userIds, action: "delete" }),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok
      ? { success: true, message: (d as { message?: string }).message || "Deleted" }
      : {
          success: false,
          error: (d as { message?: string }).message || "Delete failed",
        };
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
    const event = getRequestEvent();
    const isEdit = !!data.token;
    const endpoint = isEdit ? `/api/token/${data.token}` : "/api/token/createToken";
    const method = isEdit ? "PUT" : "POST";
    const body = isEdit
      ? {
          newTokenData: {
            email: data.email,
            role: data.role,
            expiresInHours: data.expiresInHours || 48,
          },
        }
      : {
          email: data.email,
          role: data.role,
          expiresIn: data.expiresIn || "2 days",
        };

    const r = await event.fetch(endpoint, {
      method,
      headers: remoteJsonHeaders(event.cookies),
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    const tokenVal =
      (d as { token?: { value?: string } | string }).token &&
      typeof (d as { token?: unknown }).token === "object"
        ? ((d as { token: { value?: string } }).token.value as string | undefined)
        : ((d as { token?: string }).token as string | undefined);
    return r.ok
      ? {
          success: true,
          token: tokenVal,
          message: (d as { message?: string }).message,
        }
      : {
          success: false,
          error: (d as { message?: string }).message || "Token save failed",
        };
  },
);

export const deleteTokenAction = query(
  "unchecked",
  async (token: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    const event = getRequestEvent();
    const r = await event.fetch(`/api/token/${token}`, {
      method: "DELETE",
      headers: remoteJsonHeaders(event.cookies),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok
      ? { success: true, message: "Deleted" }
      : {
          success: false,
          error: (d as { message?: string }).message || "Token delete failed",
        };
  },
);

export const getActiveSessions = query(
  "unchecked",
  async (_event?: any): Promise<{ sessions?: any[]; error?: string }> => {
    const event = getRequestEvent();
    const r = await event.fetch("/api/user/sessions", {
      method: "GET",
      headers: remoteJsonHeaders(event.cookies),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      return { error: (d as { message?: string }).message || "Failed to load sessions" };
    }
    const sessions =
      (d as { sessions?: unknown[] }).sessions ||
      (d as { data?: { sessions?: unknown[] } }).data?.sessions ||
      (d as { data?: unknown[] }).data ||
      [];
    return { sessions: Array.isArray(sessions) ? sessions : [] };
  },
);

export const revokeSession = query(
  "unchecked",
  async (sessionId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    const event = getRequestEvent();
    const r = await event.fetch(`/api/user/sessions/${sessionId}`, {
      method: "DELETE",
      headers: remoteJsonHeaders(event.cookies),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok
      ? {
          success: true,
          message: (d as { message?: string }).message || "Revoked",
        }
      : {
          success: false,
          error: (d as { message?: string }).message || "Revoke failed",
        };
  },
);
