/**
 * @file src/routes/(app)/user/user.remote.ts
 * @description User Remote Functions — callable directly from client components.
 *
 * All exports are SvelteKit query() wrappers that provide full type inference.
 * Plain interface exports have been moved inline or removed per SvelteKit .remote.ts rules.
 */

import { query } from "$app/server";

export const updateProfile = query(
  "unchecked",
  async (
    data: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    const r = await fetch("/api/user/update-user-attributes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: data.user_id, newUserData: data }),
    });
    const d = await r.json();
    return r.ok ? { success: true, message: "Updated" } : { success: false, error: d.message };
  },
);

export const verifyPassword = query(
  "unchecked",
  async (password: string): Promise<{ valid: boolean }> => {
    const r = await fetch("/api/user/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const d = await r.json();
    return { valid: !!d.valid };
  },
);

export const deleteUser = query(
  "unchecked",
  async (userIds: string[]): Promise<{ success: boolean; message?: string; error?: string }> => {
    const r = await fetch("/api/user/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds, action: "delete" }),
    });
    const d = await r.json();
    return r.ok
      ? { success: true, message: d.message || "Deleted" }
      : { success: false, error: d.message };
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

    const r = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    return r.ok
      ? { success: true, token: d.token?.value || d.token, message: d.message }
      : { success: false, error: d.message };
  },
);

export const deleteTokenAction = query(
  "unchecked",
  async (token: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    const r = await fetch(`/api/token/${token}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const d = await r.json();
    return r.ok ? { success: true, message: "Deleted" } : { success: false, error: d.message };
  },
);

export const getActiveSessions = query(
  "unchecked",
  async (): Promise<{ sessions?: any[]; error?: string }> => {
    const r = await fetch("/api/user/sessions", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const d = await r.json();
    return r.ok ? { sessions: d.sessions || [] } : { error: d.message };
  },
);

export const revokeSession = query(
  "unchecked",
  async (sessionId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    const r = await fetch(`/api/user/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    const d = await r.json();
    return r.ok
      ? { success: true, message: d.message || "Revoked" }
      : { success: false, error: d.message };
  },
);
