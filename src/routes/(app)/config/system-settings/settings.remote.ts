/**
 * @file src/routes/(app)/config/system-settings/settings.remote.ts
 * @description Settings Remote Functions — callable from client components.
 *
 * All exports are SvelteKit query() wrappers that provide full type inference.
 * Wraps the REST API with typed functions.
 *
 * ### Features:
 * - CSRF headers on mutating PUT/DELETE (via settings-utils.remoteJsonHeaders)
 * - event.fetch for relative URL resolution on the server
 */

import { query, getRequestEvent } from "$app/server";
import { remoteJsonHeaders } from "./settings-utils";

export const loadSettingsGroup = query(
  "unchecked",
  async ({
    groupId,
    bypassCache = false,
  }: {
    groupId: string;
    bypassCache?: boolean;
  }): Promise<{
    success: boolean;
    values?: Record<string, unknown>;
    error?: string;
  }> => {
    // Use the request event's fetch: remote functions run on the server, where the global
    // fetch rejects relative URLs. event.fetch resolves them against the current request.
    const event = getRequestEvent();
    const url = bypassCache ? `/api/settings/${groupId}?refresh=true` : `/api/settings/${groupId}`;
    const r = await event.fetch(url);
    const d = await r.json();
    return d.success
      ? { success: true, values: d.values || {} }
      : { success: false, error: d.message };
  },
);

export const saveSettingsGroup = query(
  "unchecked",
  async ({
    groupId,
    values,
  }: {
    groupId: string;
    values: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    values?: Record<string, unknown>;
    message?: string;
    error?: string;
  }> => {
    const event = getRequestEvent();
    const r = await event.fetch(`/api/settings/${groupId}`, {
      method: "PUT",
      headers: remoteJsonHeaders(event.cookies),
      body: JSON.stringify(values),
    });
    const d = await r.json();
    return d.success
      ? { success: true, message: "Saved", values: d.values }
      : { success: false, error: d.message };
  },
);

export const resetSettingsGroup = query(
  "unchecked",
  async (groupId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    const event = getRequestEvent();
    const r = await event.fetch(`/api/settings/${groupId}`, {
      method: "DELETE",
      headers: remoteJsonHeaders(event.cookies),
    });
    const d = await r.json();
    return d.success
      ? { success: true, message: "Reset to defaults" }
      : { success: false, error: d.message };
  },
);

export const loadAllSettings = query(
  "unchecked",
  async (): Promise<{
    success: boolean;
    values?: Record<string, unknown>;
    error?: string;
  }> => {
    const { fetch } = getRequestEvent();
    const r = await fetch("/api/settings/all");
    const d = await r.json();
    return d.success
      ? { success: true, values: d.groups || d.values }
      : { success: false, error: d.message };
  },
);
