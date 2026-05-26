/**
 * @file src/routes/(app)/config/access-management/access.remote.ts
 * @description Access Management Remote Functions — token CRUD without manual fetch boilerplate.
 *
 * All exports are SvelteKit query() wrappers per .remote.ts requirements.
 */

import { query } from "$app/server";

export const generateToken = query(
  "unchecked",
  async (data: {
    name: string;
    permissions: string[];
    expiresAt: string;
  }): Promise<{ success: boolean; message?: string; error?: string }> => {
    const r = await fetch("/api/website-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (r.status === 409) return { success: false, error: "Token name already exists." };
    const d = await r.json();
    return r.ok
      ? { success: true, message: "Token created" }
      : { success: false, error: d.message };
  },
);

export const deleteWebsiteToken = query(
  "unchecked",
  async (id: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    const r = await fetch(`/api/website-tokens/${id}`, { method: "DELETE" });
    const d = await r.json();
    return r.ok
      ? { success: true, message: "Token deleted" }
      : { success: false, error: d.message };
  },
);

export const bulkDeleteTokens = query(
  "unchecked",
  async (ids: string[]): Promise<{ success: boolean; deleted: number; error?: string }> => {
    const results = await Promise.all(
      ids.map((id) => fetch(`/api/website-tokens/${id}`, { method: "DELETE" })),
    );
    const deleted = results.filter((r) => r.ok).length;
    return deleted > 0
      ? { success: true, deleted }
      : { success: false, deleted: 0, error: "Failed to delete tokens" };
  },
);
