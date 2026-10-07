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

/** Cached lazy handle to the settings service — one module-registry lookup instead of one per call. */
let settingsServiceModulePromise:
  | Promise<typeof import("@src/services/core/settings-service")>
  | undefined;
function loadSettingsServiceModule(): Promise<
  typeof import("@src/services/core/settings-service")
> {
  return (settingsServiceModulePromise ??= import("@src/services/core/settings-service"));
}

/** Cached lazy handle to the engine server — one module-registry lookup instead of one per call. */
let engineServerModulePromise: Promise<typeof import("@src/content/engine.server")> | undefined;
function loadEngineServerModule(): Promise<typeof import("@src/content/engine.server")> {
  return (engineServerModulePromise ??= import("@src/content/engine.server"));
}

/** Cached lazy handle to the cache service — one module-registry lookup instead of one per call. */
let cacheServiceModulePromise:
  | Promise<typeof import("@src/databases/cache/cache-service")>
  | undefined;
function loadCacheServiceModule(): Promise<typeof import("@src/databases/cache/cache-service")> {
  return (cacheServiceModulePromise ??= import("@src/databases/cache/cache-service"));
}

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
    const { refreshContent } = await loadEngineServerModule();
    await refreshContent(tenantId, { mode: "schemas", adapter });
  } catch (err) {
    logger.warn("[WebsiteStarterSeed] Content refresh failed:", err);
  }

  await seedWebsiteStarterPages(adapter, { siteName, tenantId });
  try {
    const { setPublicSetting, invalidateSettingsCache } = await loadSettingsServiceModule();
    await setPublicSetting("SITE_STARTER_ENABLED", true, tenantId ?? undefined);
    invalidateSettingsCache(tenantId ?? undefined);
    const { cacheService } = await loadCacheServiceModule();
    await cacheService.invalidateCollection("pages", (tenantId ?? undefined) as string | undefined);
    await cacheService.invalidateCollection(
      "collection_pages",
      (tenantId ?? undefined) as string | undefined,
    );
  } catch (err) {
    logger.warn("[WebsiteStarterSeed] Failed to configure site starter settings/cache:", err);
  }

  let pluginEnabled = false;
  if (enablePlugin) {
    try {
      const { pluginRegistry } = await import("@src/plugins/registry");
      pluginEnabled = await pluginRegistry.togglePlugin(
        "editable-website",
        true,
        (tenantId || "default") as DatabaseId,
        adminUserId,
        adapter,
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
