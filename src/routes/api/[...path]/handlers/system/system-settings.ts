/**
 * @file src/routes/api/[...path]/handlers/system/system-settings.ts
 * @description System settings read/write routes for the system dispatcher.
 */

import { AppError, raise } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse } from "../base";
import { requireAdminUser } from "./system-shared";
import { settingsGroups } from "@src/services/system/settings-groups.server";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import type { User } from "@src/databases/auth/types";
import { handleWebhookRoutes } from "./system-webhooks";

const SECRET_KEY_RE =
  /(secret|password|passwd|token|api[_-]?key|private[_-]?key|credential|refresh|jwt|encryption)/i;

/** Strip sensitive credential values from exported settings payloads. */
function redactExportedSettings(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rec = payload as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === "private" && v && typeof v === "object" && !Array.isArray(v)) {
      const redactedPriv: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        if (SECRET_KEY_RE.test(pk)) {
          redactedPriv[pk] = pv ? "[REDACTED]" : "";
        } else {
          redactedPriv[pk] = pv;
        }
      }
      clean[k] = redactedPriv;
    } else if (SECRET_KEY_RE.test(k)) {
      // Drop plain-text secret fields from exported groups
      continue;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      clean[k] = redactExportedSettings(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * --- SETTINGS ---
 */
export async function handleSettingsRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;

  // 🛡️ SECURITY: Admin verification for settings mutations (401 before 403).
  if (!["GET", "OPTIONS"].includes(request.method)) {
    requireAdminUser(event, "Admin access required for settings management");
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
      // CWE-200 / privilege boundary: system:read alone must NEVER dump system secrets.
      requireAdminUser(event, "Admin access required for settings export");
      const all = await cms.system.settings.getAll({ tenantId: tenantId as any });
      return successResponse(event, redactExportedSettings(all));
    }

    if (action === "private" && subAction === "OLLAMA_URL") {
      const caller = event.locals.user;
      if (!caller) {
        raise(401, "Unauthorized", "UNAUTHORIZED");
      }
      const roles = (event.locals.roles ?? []) as Parameters<typeof hasPermissionWithRoles>[2];
      const allowed =
        event.locals.isAdmin === true ||
        hasPermissionWithRoles(caller as User, "ai:use", roles) ||
        hasPermissionWithRoles(caller as User, "system:settings", roles);
      if (!allowed) {
        raise(403, "Forbidden", "FORBIDDEN");
      }
      return successResponse(event, { value: getPrivateSettingSync("OLLAMA_URL") ?? "" });
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
      // CWE-200 / privilege boundary: system:read alone must NEVER dump system secrets.
      requireAdminUser(event, "Admin access required for settings export");
      const all = await cms.system.settings.getAll({ tenantId: tenantId as any });
      return successResponse(event, redactExportedSettings(all));
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
