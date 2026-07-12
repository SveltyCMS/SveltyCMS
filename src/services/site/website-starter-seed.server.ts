/**
 * @file src/services/site/website-starter-seed.server.ts
 * @description Shared Website Starter seed blueprint — preset collections, homepage, plugin state.
 *
 * Used by setup completion, testing API (`seed-website-starter`), and E2E helpers.
 *
 * ### Features:
 * - idempotent preset collection seeding
 * - published Svedit homepage (`slug: home`)
 * - optional Editable Website plugin auto-enable
 */

import type { DatabaseAdapter, DatabaseId } from "@src/databases/db-interface";
import { logger } from "@utils/logger";

export interface SeedWebsiteStarterBlueprintOptions {
  siteName?: string;
  tenantId?: string | null;
  /** When true (default), enables editable-website and starts the trial */
  enablePlugin?: boolean;
  adminUserId?: string;
}

export interface SeedWebsiteStarterBlueprintResult {
  collectionsSeeded: number;
  homepageSeeded: boolean;
  pluginEnabled: boolean;
}

/** Idempotently seeds Website Starter assets (collections, homepage, plugin). */
export async function seedWebsiteStarterBlueprint(
  adapter: DatabaseAdapter,
  options: SeedWebsiteStarterBlueprintOptions = {},
): Promise<SeedWebsiteStarterBlueprintResult> {
  const { siteName = "SveltyCMS", tenantId = null, enablePlugin = true, adminUserId } = options;

  const { seedPresetCollections, seedWebsiteStarterPages } = await import("@src/routes/setup/seed");

  const schemas = await seedPresetCollections(adapter, "website", tenantId, undefined, {
    replaceAll: false,
  });

  try {
    const { refreshContent } = await import("@src/content/engine.server");
    await refreshContent(tenantId, { mode: "schemas", adapter });
  } catch (err) {
    logger.warn("[WebsiteStarterSeed] Content refresh failed:", err);
  }

  await seedWebsiteStarterPages(adapter, { siteName, tenantId });

  let pluginEnabled = false;
  if (enablePlugin) {
    try {
      const { pluginRegistry } = await import("@src/plugins/registry");
      pluginEnabled = await pluginRegistry.togglePlugin(
        "editable-website",
        true,
        (tenantId || "default") as DatabaseId,
        adminUserId,
      );
    } catch (err) {
      logger.warn("[WebsiteStarterSeed] Plugin enable failed:", err);
    }
  }

  return {
    collectionsSeeded: schemas.length,
    homepageSeeded: true,
    pluginEnabled,
  };
}
