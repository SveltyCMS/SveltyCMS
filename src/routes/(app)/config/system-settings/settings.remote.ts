/**
 * @file src/routes/(app)/config/system-settings/settings.remote.ts
 * @description Settings remote functions — LocalCMS, no HTTP hop.
 *
 * ### Features:
 * - same privilege gate as `/api/settings` (admin for mutations)
 * - group keys stored as one preferences document
 */

import { command, query, getRequestEvent } from "$app/server";
import { getRequestLocalCMS, remoteErrorMessage } from "@utils/server/request-cms.server";
import { settingsGroups } from "@src/services/system/settings-groups.server";
import { AppError } from "@utils/error-handling";

function requireUser() {
  const event = getRequestEvent();
  if (!event.locals.user) throw new AppError("Unauthorized", 401);
  return event;
}

function requireAdmin() {
  const event = requireUser();
  const user = event.locals.user;
  if (!event.locals.isAdmin && user?.role !== "admin" && !user?.isAdmin) {
    throw new AppError("Admin access required for settings management", 403, "FORBIDDEN");
  }
  return event;
}

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
    try {
      requireUser();
      const { cms, tenantId } = await getRequestLocalCMS();
      const group = settingsGroups.find((g) => g.id === groupId);
      if (!group && groupId && groupId !== "all" && groupId !== "general") {
        return { success: false, error: `Settings group ${groupId} not found` };
      }

      if (bypassCache) {
        await cms.system.settings.invalidateCache({ tenantId: tenantId as never });
      }

      const values: Record<string, unknown> = {};

      if (group) {
        const keys = group.fields.map((f) => f.key);
        // Load settings by their field keys from system preferences
        if (keys.length > 0) {
          const prefResult = await cms.db.system.preferences
            .getMany(keys, {
              scope: "system",
              tenantId: tenantId as never,
            })
            .catch(() => null);

          if (prefResult?.success && prefResult.data) {
            Object.assign(values, prefResult.data);
          }
        }

        // Also check if there's any fallback group document
        const groupDoc = await cms.db.system.preferences
          .get(groupId, {
            scope: "system",
            tenantId: tenantId as never,
          })
          .catch(() => null);

        if (groupDoc?.success && groupDoc.data && typeof groupDoc.data === "object") {
          Object.assign(values, groupDoc.data);
        }
      } else {
        const settings = await cms.system.settings.get(groupId || "all", {
          tenantId: tenantId as never,
        });
        if (settings && typeof settings === "object") {
          Object.assign(values, settings);
        }
      }

      return { success: true, values };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Failed to load settings") };
    }
  },
);

export const saveSettingsGroup = command(
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
    inlang?: {
      added: string[];
      translated: boolean;
      compiled: boolean;
      error?: string;
    };
  }> => {
    try {
      requireAdmin();
      const { cms, tenantId } = await getRequestLocalCMS();
      const group = settingsGroups.find((g) => g.id === groupId);
      if (group) {
        const allowedKeys = new Set(group.fields.map((f) => f.key));
        for (const key of Object.keys(values)) {
          if (!allowedKeys.has(key)) {
            return { success: false, error: `Invalid setting key ${key} for group ${groupId}` };
          }
        }

        // Persist each setting key into system.preferences with its category
        const ops = Object.entries(values).map(([key, val]) => {
          const field = group.fields.find((f) => f.key === key);
          return {
            key,
            value: val,
            category: field?.category || "private",
            scope: "system" as const,
          };
        });

        if (ops.length > 0) {
          const res = await cms.db.system.preferences.setMany(ops, {
            tenantId: tenantId as never,
          });
          if (!res.success) {
            return { success: false, error: res.error?.message || "Failed to persist settings" };
          }
        }
      } else {
        await cms.system.settings.set(groupId || "all", values, {
          tenantId: tenantId as never,
        });
      }

      await cms.system.settings.invalidateCache({ tenantId: tenantId as never });
      let inlang:
        | {
            added: string[];
            translated: boolean;
            compiled: boolean;
            error?: string;
          }
        | undefined;
      if (Array.isArray(values.LOCALES)) {
        try {
          const { syncInlangSystemLocales } =
            await import("@src/services/setup/sync-inlang-locales.server");
          inlang = await syncInlangSystemLocales(values.LOCALES as string[]);
        } catch {
          /* best effort — settings already persisted */
        }
      }
      try {
        const { invalidateFieldPermissionCache } =
          await import("@src/services/security/field-permission-service");
        invalidateFieldPermissionCache();
      } catch {
        /* best effort */
      }
      return {
        success: true,
        message: inlang?.error
          ? "Saved. Machine translation did not finish — run bun translate then bun run paraglide."
          : "Saved",
        values,
        inlang,
      };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Failed to save settings") };
    }
  },
);

export const resetSettingsGroup = command(
  "unchecked",
  async (groupId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      requireAdmin();
      const { cms, tenantId } = await getRequestLocalCMS();
      await cms.system.settings.set(groupId, {}, { tenantId: tenantId as never });
      return { success: true, message: "Reset to defaults" };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Failed to reset settings") };
    }
  },
);
