/**
 * @file src/routes/(app)/config/extensions/+page.server.ts
 * @description Server-side logic for the extensions management page.
 *
 * ### Features:
 * - Admin gate via locals.isAdmin (not role string alone)
 * - Plugin registry state for tenant
 */

import { availablePlugins, pluginRegistry } from "@src/plugins";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { marketplaceService } from "@src/services/core/marketplace-service";
import { LocalCMS } from "@src/services/sdk";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { isAppError, raise, rethrow } from "@utils/error-handling";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { getLayoutPluginStates } from "@utils/server/layout-caches.server";
import { getInstalledDashboardWidgets } from "@src/routes/(app)/dashboard/widgets/manifest-registry";
import { logger } from "@utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);

    if (!locals.isAdmin) {
      logger.warn(`User ${user._id} denied access to extensions (admin only)`);
      raise(403, "Admin privileges required");
    }

    const tenantId = locals.tenantId || "default";
    // The runtime registry is only populated once `initializePlugins` has run.
    // Fall back to the statically discovered catalog so code-shipped plugins are
    // never misreported as "No plugins installed" on a fresh/non-booted process.
    const registered = pluginRegistry.getAll();
    const catalog = registered.length > 0 ? registered : availablePlugins;
    const enabledById = await getLayoutPluginStates(tenantId);

    const plugins = catalog.map((p) => {
      const missingConfig =
        p.metadata.id === "pagespeed" &&
        !getPrivateSettingSync("GOOGLE_PAGESPEED_API_KEY" as never);

      return {
        name: p.metadata.id,
        displayName: p.metadata.name,
        version: p.metadata.version,
        description: p.metadata.description,
        author: p.metadata.author,
        icon: p.metadata.icon,
        enabled: enabledById[p.metadata.id] ?? p.metadata.enabled,
        missingConfig,
        configUrl: "/config/system-settings",
      };
    });

    const dashboardWidgets = getInstalledDashboardWidgets();

    // Both lists are rendered by non-default tabs; load them here so the tabs
    // paint from SSR instead of fetching on first open.
    const cms = new LocalCMS(dbAdapter);
    const [widgets, marketplace] = await Promise.all([
      cms.widgets.list({ tenantId: tenantId as DatabaseId }).catch((err) => {
        logger.warn("Could not load widget list for extensions:", err);
        return [];
      }),
      marketplaceService.list().catch((err) => {
        logger.warn("Could not load marketplace catalog for extensions:", err);
        return { items: [], source: "local" as const, remoteAvailable: false };
      }),
    ]);

    return {
      plugins,
      dashboardWidgets,
      widgets,
      marketplace,
      tenantId,
      isAdmin: true,
    };
  } catch (err) {
    rethrow(err);
    if (isAppError(err)) throw err;
    logger.error("Failed to load extensions page:", err);
    raise(500, err instanceof Error ? err.message : String(err));
  }
};
