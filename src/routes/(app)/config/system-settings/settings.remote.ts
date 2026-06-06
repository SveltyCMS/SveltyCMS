/**
 * @file src/routes/(app)/config/system-settings/settings.remote.ts
 * @description Settings Remote Functions — callable from client components.
 *
 * All exports are SvelteKit query() wrappers that provide full type inference.
 * Wraps the REST API with typed functions.
 */

import { query, command, getRequestEvent } from "$app/server";

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
    const { fetch } = getRequestEvent();
    const url = bypassCache ? `/api/settings/${groupId}?refresh=true` : `/api/settings/${groupId}`;
    const r = await fetch(url);
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
    const { fetch } = getRequestEvent();
    const r = await fetch(`/api/settings/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
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
    const { fetch } = getRequestEvent();
    const r = await fetch(`/api/settings/${groupId}`, { method: "DELETE" });
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

export const repairContentCache = command(
  "unchecked",
  async (_payload?: {}): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> => {
    const event = getRequestEvent();
    const { contentService } = await import("@src/content/content-service.server");
    const { logger } = await import("@utils/logger");

    if (!event.locals.isAdmin) {
      return {
        success: false,
        error: "Only administrators can repair the content cache.",
      };
    }

    logger.info(`Repair Cache triggered by user: ${event.locals.user?._id}`);

    try {
      await contentService.fullReload();
      return {
        success: true,
        message: "Content structure cache rebuilt and synchronized successfully.",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Content Cache Repair failed: ${msg}`);
      return { success: false, error: `Repair failed: ${msg}` };
    }
  },
);
