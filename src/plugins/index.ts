/**
 * @file src/plugins/index.ts
 * @description Plugin system initialization and main exports
 */

export * from "./types";

import { pluginRegistry } from "./registry";
export { pluginRegistry };

import { logger } from "@utils/logger";
import { editableWebsitePlugin } from "./editable-website";
import { pageSpeedPlugin } from "./pagespeed";
import { redirectManagerPlugin } from "./redirect-manager";
import { sitemapPlugin } from "./sitemap";
import type { Plugin } from "./types";

// All available plugins
export const availablePlugins: Plugin[] = [
  pageSpeedPlugin,
  editableWebsitePlugin,
  redirectManagerPlugin,
  sitemapPlugin,
];

/**
 * Initialize plugin system
 * Registers all plugins and runs migrations
 *
 * Called during server startup from src/databases/db.ts
 */
export async function initializePlugins(dbAdapter: any, tenantId = "default"): Promise<void> {
  try {
    logger.info("🔌 Initializing plugin system...");

    // 1. Initialize settings service
    await pluginRegistry.initializeSettings(dbAdapter);

    // 2. Register all available plugins
    for (const plugin of availablePlugins) {
      await pluginRegistry.register(plugin);
    }

    // 3. Run migrations for all plugins
    await pluginRegistry.runAllMigrations(dbAdapter, tenantId);

    // 4. Mark as initialized
    pluginRegistry.markInitialized();

    logger.info("✅ Plugin system initialized");
  } catch (error) {
    logger.error("Failed to initialize plugin system", { error });
    // We don't throw to allow CMS to start even if plugins have issues
  }
}
