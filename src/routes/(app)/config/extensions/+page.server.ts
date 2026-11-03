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
import { LocalCMS } from "@src/services/sdk";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { isAppError, raise, rethrow } from "@utils/error-handling";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { getLayoutPluginStates } from "@utils/server/layout-caches.server";
import { getInstalledDashboardWidgets } from "@src/routes/(app)/dashboard/widgets/manifest-registry";
import { isAdmin } from "@src/databases/auth/constants";
import { logger } from "@utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const user = getAuthenticatedUser(locals);
    const isAdminUser = locals.isAdmin === true || isAdmin(user);

    if (!isAdminUser) {
      logger.warn(`User ${user._id} denied access to extensions (admin only)`);
      raise(403, "Admin privileges required");
    }

    const tenantId = locals.tenantId || "default";
    // The runtime registry is only populated once `initializePlugins` has run.
    // Fall back to empty array if pluginRegistry.getAll() returns nothing or throws.
    let catalog: any[] = [];
    try {
      catalog = pluginRegistry.getAll() || [];
    } catch (regErr) {
      logger.warn("Could not retrieve plugins from pluginRegistry:", regErr);
    }

    let enabledById: Record<string, boolean> = {};
    try {
      enabledById = (await getLayoutPluginStates(tenantId)) || {};
    } catch (stateErr) {
      logger.warn("Could not retrieve plugin layout states:", stateErr);
    }

    const plugins = catalog.map((p) => {
      let missingConfig = false;
      try {
        missingConfig =
          p.metadata.id === "pagespeed" &&
          !getPrivateSettingSync("GOOGLE_PAGESPEED_API_KEY" as never);
      } catch {
        missingConfig = false;
      }

      // Resolve specific destination for each plugin's configure button
      let configUrl = "/config/system-settings";
      if (p.metadata.id === "smart-importer") {
        configUrl = "/config?plugin=smart-importer";
      } else if (p.metadata.id === "redirect-manager") {
        configUrl = "/config/redirects";
      } else if (p.metadata.id === "editable-website") {
        configUrl = "/config/system-settings?group=site";
      } else if (p.metadata.id === "cookie-consent") {
        configUrl = "/config/system-settings?group=gdpr";
      } else if (p.metadata.id === "pagespeed") {
        configUrl = "/config/system-settings?group=integrations";
      } else if (p.metadata.id === "focal-point") {
        configUrl = "/mediagallery";
      } else if (p.metadata.id === "sitemap") {
        configUrl = "/config/system-settings?group=site";
      } else if (
        p.metadata.id === "commerce" ||
        p.metadata.id === "stripe" ||
        p.metadata.id === "taxjar" ||
        p.metadata.id === "shipping-live"
      ) {
        configUrl = "/config/system-settings?group=integrations";
      }

      return {
        name: p.metadata.id,
        displayName: p.metadata.name,
        version: p.metadata.version,
        description: p.metadata.description,
        author: p.metadata.author,
        icon: p.metadata.icon,
        enabled: enabledById[p.metadata.id] ?? p.metadata.enabled ?? true,
        missingConfig,
        configUrl,
      };
    });

    let dashboardWidgets: any[] = [];
    try {
      dashboardWidgets = getInstalledDashboardWidgets() || [];
    } catch (dashErr) {
      logger.warn("Could not retrieve dashboard widgets:", dashErr);
    }

    // Both lists are rendered by non-default tabs; load them here so the tabs
    // paint from SSR instead of fetching on first open. The marketplace catalog is
    // deliberately NOT preloaded: it is remote, refreshable, and served by
    // `/api/marketplace` (client fetch, so the tab keeps its loading/refresh UX).
    let widgets: any[] = [];
    try {
      const db = locals.dbAdapter ?? dbAdapter;
      if (db) {
        const cms = new LocalCMS(db);
        widgets = await cms.widgets.list({ tenantId: tenantId as DatabaseId });
      }
    } catch (err) {
      logger.warn("Could not load widget list for extensions:", err);
    }

    return {
      plugins,
      dashboardWidgets,
      widgets,
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
