/**
 * @file src/plugins/plugin-server-registry.ts
 * @description Maps plugin ids to server action modules for `/api/plugins/[pluginId]`.
 */

import { logger } from "@utils/logger";
import type { PluginServerModule } from "./types";

class PluginServerRegistry {
  private readonly loaders = new Map<string, () => Promise<PluginServerModule>>();

  register(pluginId: string, loader: () => Promise<PluginServerModule>): void {
    this.loaders.set(pluginId, loader);
    logger.debug(`[PluginServerRegistry] Registered server module for '${pluginId}'`);
  }

  getLoader(pluginId: string): (() => Promise<PluginServerModule>) | undefined {
    return this.loaders.get(pluginId);
  }

  has(pluginId: string): boolean {
    return this.loaders.has(pluginId);
  }

  clear(): void {
    this.loaders.clear();
  }
}

export const pluginServerRegistry = new PluginServerRegistry();
