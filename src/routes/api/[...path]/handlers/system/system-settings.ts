/**
 * @file src/routes/api/[...path]/handlers/system/system-settings.ts
 * @description System settings read/write routes for the system dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse } from "../base";
import { settingsGroups } from "@src/routes/(app)/config/system-settings/settings-groups";
import { handleWebhookRoutes } from "./system-webhooks";

/**
 * --- SETTINGS ---
 */
export async function handleSettingsRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const { user } = locals;

  // 🛡️ SECURITY: Admin verification for settings mutations
  if (!["GET", "OPTIONS"].includes(request.method)) {
    if (!user || (!user.isAdmin && user.role !== "admin")) {
      throw new AppError("Admin access required for settings management", 403, "FORBIDDEN");
    }
  }

  const action = segments[1];
  const subAction = segments[2];

  if (action === "webhooks") return handleWebhookRoutes(event, cms, tenantId, segments);

  if (request.method === "GET") {
    if (action === "public") {
      if (subAction === "stream") {
        return new Response("event: connected\n\n", {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      return successResponse(
        event,
        await cms.system.settings.getPublic({ tenantId: tenantId as any }),
      );
    }

    if (action === "export") {
      return successResponse(
        event,
        await cms.system.settings.getAll({ tenantId: tenantId as any }),
      );
    }

    const group = settingsGroups.find((g) => g.id === action);
    if (!group && action && action !== "all" && action !== "general") {
      throw new AppError(`Settings group ${action} not found`, 404);
    }

    // Group settings are stored as a single key in preferences, not in KNOWN_PRIVATE_KEYS.
    // Use direct preferences.get to retrieve arbitrary group keys.
    let settings: unknown;
    if (action && action !== "all" && action !== "general") {
      const pref = await cms.db.system.preferences.get(action, {
        scope: "system",
        tenantId: tenantId as any,
      });
      settings = pref.success ? pref.data : {};
    } else {
      settings = await cms.system.settings.get(action || "all", {
        tenantId: tenantId as any,
      });
    }
    return rawResponse(event, { success: true, values: settings || {} });
  }

  if (["POST", "PATCH", "PUT"].includes(request.method)) {
    if (action === "export") {
      return successResponse(
        event,
        await cms.system.settings.getAll({ tenantId: tenantId as any }),
      );
    }
    if (action === "import") {
      return successResponse(event, { success: true });
    }

    const body = await request.json().catch(() => ({}));

    // Validate keys for specific groups
    if (action && action !== "all" && action !== "general") {
      const group = settingsGroups.find((g) => g.id === action);
      if (group) {
        const allowedKeys = new Set(group.fields.map((f) => f.key));
        for (const key of Object.keys(body)) {
          if (!allowedKeys.has(key))
            throw new AppError(`Invalid setting key ${key} for group ${action}`, 400);
        }
      }
    }

    const result = await cms.system.settings.set(action || "all", body, {
      tenantId: tenantId as any,
    });

    // 🚀 Invalidate the field-permission + access-rule memos so a saved policy
    // takes effect immediately (no up-to-60s stale window).
    try {
      const { invalidateFieldPermissionCache } =
        await import("@src/services/security/field-permission-service");
      invalidateFieldPermissionCache();
      const { invalidateAccessRuleCache } =
        await import("@src/services/security/access-rule-service");
      invalidateAccessRuleCache();
    } catch {
      /* best effort */
    }

    return successResponse(event, result);
  }

  throw new AppError(`Method ${request.method} not allowed for settings`, 405);
}
