/**
 * @file src/routes/(app)/config/extensions/+page.server.ts
 * @description Server-side logic for the extensions management page.
 *
 * ### Features:
 * - Admin gate via locals.isAdmin (not role string alone)
 * - Plugin registry state for tenant
 */

import { pluginRegistry } from "@src/plugins";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { error, isHttpError } from "@sveltejs/kit";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { logger } from "@utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);

    if (!locals.isAdmin) {
      logger.warn(`User ${user._id} denied access to extensions (admin only)`);
      throw error(403, "Admin privileges required");
    }

    const tenantId = locals.tenantId || "default";
    const allPlugins = pluginRegistry.getAll();

    const plugins = await Promise.all(
      allPlugins.map(async (p) => {
        let missingConfig = false;
        const configUrl = "/config/system-settings";

        const state = await pluginRegistry.getPluginState(p.metadata.id, tenantId);
        const enabled = state ? state.enabled : p.metadata.enabled;

        if (p.metadata.id === "pagespeed") {
          missingConfig = !getPrivateSettingSync("GOOGLE_PAGESPEED_API_KEY" as never);
        }

        return {
          name: p.metadata.id,
          displayName: p.metadata.name,
          version: p.metadata.version,
          description: p.metadata.description,
          author: p.metadata.author,
          icon: p.metadata.icon,
          enabled,
          missingConfig,
          configUrl,
        };
      }),
    );

    return {
      plugins,
      tenantId,
      isAdmin: true,
    };
  } catch (err) {
    if (isHttpError(err)) throw err;
    throw error(500, err instanceof Error ? err.message : String(err));
  }
};
