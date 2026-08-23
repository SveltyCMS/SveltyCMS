/**
 * @file src/routes/(app)/config/system-settings/settings.remote.ts
 * @description Settings remote functions — LocalCMS, no HTTP hop.
 *
 * ### Features:
 * - same privilege gate as `/api/settings` (admin for mutations)
 * - group keys stored as one preferences document
 */

import { query, getRequestEvent } from "$app/server";
import { getRequestLocalCMS, remoteErrorMessage } from "@utils/server/request-cms.server";
import { settingsGroups } from "./settings-groups";
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

      let settings: unknown;
      if (groupId && groupId !== "all" && groupId !== "general") {
        if (bypassCache) {
          await cms.system.settings.invalidateCache({ tenantId: tenantId as never });
        }
        const pref = await cms.db.system.preferences.get(groupId, {
          scope: "system",
          tenantId: tenantId as never,
        });
        settings = pref.success ? pref.data : {};
      } else {
        settings = await cms.system.settings.get(groupId || "all", {
          tenantId: tenantId as never,
        });
      }
      return { success: true, values: (settings as Record<string, unknown>) || {} };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Failed to load settings") };
    }
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
    try {
      requireAdmin();
      const { cms, tenantId } = await getRequestLocalCMS();
      if (groupId && groupId !== "all" && groupId !== "general") {
        const group = settingsGroups.find((g) => g.id === groupId);
        if (group) {
          const allowedKeys = new Set(group.fields.map((f) => f.key));
          for (const key of Object.keys(values)) {
            if (!allowedKeys.has(key)) {
              return { success: false, error: `Invalid setting key ${key} for group ${groupId}` };
            }
          }
        }
      }
      const result = await cms.system.settings.set(groupId || "all", values, {
        tenantId: tenantId as never,
      });
      void result; // settings.set persists silently; the saved snapshot is `values`.
      try {
        const { invalidateFieldPermissionCache } =
          await import("@src/services/security/field-permission-service");
        invalidateFieldPermissionCache();
      } catch {
        /* best effort */
      }
      return {
        success: true,
        message: "Saved",
        values,
      };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Failed to save settings") };
    }
  },
);

export const resetSettingsGroup = query(
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

export const loadAllSettings = query(
  "unchecked",
  async (): Promise<{
    success: boolean;
    values?: Record<string, unknown>;
    error?: string;
  }> => {
    try {
      requireUser();
      const { cms, tenantId } = await getRequestLocalCMS();
      const values = await cms.system.settings.getAll({ tenantId: tenantId as never });
      return { success: true, values: values as Record<string, unknown> };
    } catch (err) {
      return { success: false, error: remoteErrorMessage(err, "Failed to load settings") };
    }
  },
);
