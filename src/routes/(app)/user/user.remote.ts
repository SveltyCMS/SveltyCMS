/**
 * @file src/routes/(app)/user/user.remote.ts
 * @description User Remote Functions — callable directly from client components.
 *
 * All exports are SvelteKit query() wrappers that provide full type inference.
 * Plain interface exports have been moved inline or removed per SvelteKit .remote.ts rules.
 */

import { getRequestEvent, query } from "$app/server";
import { getDb, getDbInitPromise, isDbConnected } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { invalidateSessionCache } from "@src/hooks/handle-authentication";
import { LocalCMS } from "@src/services/sdk";

function responseMessage(data: Record<string, unknown>): string | undefined {
  return typeof data.message === "string" ? data.message : undefined;
}

function responseToken(data: Record<string, unknown>): string | undefined {
  if (typeof data.token === "string") return data.token;
  if (data.token && typeof data.token === "object" && "value" in data.token) {
    const value = (data.token as { value?: unknown }).value;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

async function requestJson(
  input: string,
  init: RequestInit,
  retries = 2,
): Promise<{ response: Response; data: Record<string, unknown> }> {
  const { fetch } = getRequestEvent();

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(input, init);
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (response.status !== 503 || attempt >= retries) {
      return { response, data };
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
}

export const updateProfile = query(
  "unchecked",
  async (
    data: Record<string, unknown>,
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    const event = getRequestEvent();
    const rawTargetId =
      !data.user_id || data.user_id === "self" ? event.locals.user?._id : data.user_id;
    const targetId = rawTargetId ? String(rawTargetId) : "";

    if (!targetId) {
      return { success: false, error: "User ID is required" };
    }

    if (!isDbConnected()) {
      await getDbInitPromise();
    }

    const adapter = event.locals.dbAdapter || getDb();
    if (!adapter) {
      return { success: false, error: "Database connection not established." };
    }

    const cms = new LocalCMS(adapter);
    const { user_id: _user_id, ...updates } = data;
    const tenantId = (event.locals.tenantId ?? null) as DatabaseId | null;
    const result = await cms.auth.updateUserAttributes(targetId, updates, {
      tenantId,
    });

    if (!result.success) {
      return { success: false, error: result.message || "Failed to update user." };
    }

    if (event.locals.session_id) {
      invalidateSessionCache(event.locals.session_id, tenantId);
    }

    return { success: true, message: "Updated" };
  },
);

export const verifyPassword = query(
  "unchecked",
  async (password: string): Promise<{ valid: boolean }> => {
    const { data: d } = await requestJson("/api/user/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return { valid: !!d.valid };
  },
);

export const deleteUser = query(
  "unchecked",
  async (userIds: string[]): Promise<{ success: boolean; message?: string; error?: string }> => {
    const { response, data: d } = await requestJson("/api/user/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds, action: "delete" }),
    });
    return response.ok
      ? { success: true, message: responseMessage(d) || "Deleted" }
      : { success: false, error: responseMessage(d) };
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
    const endpoint = isEdit ? `/api/token/${data.token}` : "/api/token/create-token";
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

    const { response, data: d } = await requestJson(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok
      ? { success: true, token: responseToken(d), message: responseMessage(d) }
      : { success: false, error: responseMessage(d) };
  },
);

export const deleteTokenAction = query(
  "unchecked",
  async (token: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    const { response, data: d } = await requestJson(`/api/token/${token}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok
      ? { success: true, message: "Deleted" }
      : { success: false, error: responseMessage(d) };
  },
);

export const getActiveSessions = query(
  "unchecked",
  async (): Promise<{ sessions?: any[]; error?: string }> => {
    const { response, data: d } = await requestJson("/api/user/sessions", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok
      ? { sessions: Array.isArray(d.sessions) ? d.sessions : [] }
      : { error: responseMessage(d) };
  },
);

export const revokeSession = query(
  "unchecked",
  async (sessionId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    const { response, data: d } = await requestJson(`/api/user/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok
      ? { success: true, message: responseMessage(d) || "Revoked" }
      : { success: false, error: responseMessage(d) };
  },
);
