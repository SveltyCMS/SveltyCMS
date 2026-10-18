/**
 * @file src/routes/api/[...path]/handlers/system/system-plugin-settings.ts
 * @description Encrypted per-tenant plugin settings routes.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";
import { pluginRegistry } from "@src/plugins/registry";
import { validatePluginSettings } from "@src/plugins/settings-declaration";
import { capabilityRegistry } from "@src/services/security/capability-registry";

/**
 * Handle /api/plugin-settings/:pluginId
 * - GET: Return settings for a plugin (secrets masked)
 * - PUT: Save settings for a plugin (validates against declaration, encrypts secrets)
 */
export async function handlePluginSettingsRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const pluginId = segments[1];
  const user = locals.user as any;
  const roles = (locals.roles || []) as any[];

  if (!pluginId) {
    throw new AppError("pluginId is required in path", 400);
  }

  // Check plugin exists
  const plugin = pluginRegistry.get(pluginId);
  if (!plugin) {
    throw new AppError(`Plugin "${pluginId}" not found`, 404);
  }

  // Check capability gate
  if (!capabilityRegistry.canManagePluginSettings(user, roles, pluginId)) {
    throw new AppError("Insufficient permissions to manage plugin settings", 403, "FORBIDDEN");
  }

  // If plugin has requiredCapabilities, check those too
  if (plugin.settings?.requiredCapabilities) {
    for (const cap of plugin.settings.requiredCapabilities) {
      if (!capabilityRegistry.hasCapability(user, cap, roles)) {
        throw new AppError(
          `Plugin "${pluginId}" requires capability "${cap}" to manage its settings`,
          403,
          "FORBIDDEN",
        );
      }
    }
  }

  const tenantIdStr = String(tenantId);

  if (request.method === "GET") {
    const settings = await pluginRegistry.getPluginSettings(pluginId, tenantIdStr);
    return successResponse(event, { settings: settings || {} });
  }

  if (request.method === "PUT" || request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const submitted = body.settings || body;

    // Validate against declaration if available
    if (plugin.settings) {
      const issues = validatePluginSettings(submitted, plugin.settings);
      if (issues.length > 0) {
        return successResponse(event, { error: "Validation failed", issues }, 400);
      }
    }

    const saved = await pluginRegistry.savePluginSettings(pluginId, tenantIdStr, submitted);
    if (!saved) {
      throw new AppError("Failed to save plugin settings", 500);
    }

    // Return masked settings
    const updated = await pluginRegistry.getPluginSettings(pluginId, tenantIdStr);
    return successResponse(event, { settings: updated || {} });
  }

  throw new AppError(`Method ${request.method} not allowed for plugin-settings`, 405);
}
