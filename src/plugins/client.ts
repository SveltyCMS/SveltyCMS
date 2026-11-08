/**
 * @file src/plugins/client.ts
 * @description Client-side plugin entrypoint: UI-bearing plugin catalog plus the
 * lazy plugin-component cache used by `<PluginComponent>`.
 *
 * Features:
 * - static, explicit plugin index imports (no `import.meta.glob`, no server-only dirs)
 * - `availablePlugins` mirrors the UI-bearing subset of the server catalog
 * - idempotent `registerPluginSlots()` delegating to the shared registration loop
 * - cached lazy resolution of plugin-contributed Svelte components
 */

import { logger } from "@utils/logger";
import { commercePlugin } from "./commerce";
import { editableWebsitePlugin } from "./editable-website";
import { focalPointPlugin } from "./focal-point";
import { pageSpeedPlugin } from "./pagespeed";
import { redirectManagerPlugin } from "./redirect-manager";
import { registerPlugins } from "./register-plugins";
import { shippingLivePlugin } from "./shipping-live";
import { smartImporterPlugin } from "./smart-importer";
import { stripePlugin } from "./stripe";
import { taxjarPlugin } from "./taxjar";
import { unifiedDataHubPlugin } from "./unified-data-hub";
import { webmcpPlugin } from "./webmcp";
import type { Plugin } from "./types";

/**
 * UI-bearing plugin catalog.
 *
 * Keep this list in sync with every `src/plugins/<name>/index.ts` that declares
 * `ui:` or `parts:`. `tests/unit/plugins/plugin-client-catalog.test.ts` fails if
 * a directory is missing here (or if a server-only plugin sneaks in).
 */
export const availablePlugins: Plugin[] = [
  commercePlugin,
  editableWebsitePlugin,
  focalPointPlugin,
  pageSpeedPlugin,
  redirectManagerPlugin,
  shippingLivePlugin,
  smartImporterPlugin,
  stripePlugin,
  taxjarPlugin,
  unifiedDataHubPlugin,
  webmcpPlugin,
];

/**
 * Register slots, plugin pages, and admin tools with the isomorphic registries.
 *
 * Idempotent: the shared loop ignores repeat calls. The eager call below keeps
 * the previous `./index.ts` behavior — importing the catalog is enough to
 * populate the registries, and `+layout.svelte` also calls this explicitly so a
 * bundler can never tree-shake the registration into a lazy route node.
 */
export function registerPluginSlots(): void {
  registerPlugins(availablePlugins);
}

// Register eagerly — runs wherever this module executes (client bootstrap, dev, HMR).
registerPluginSlots();

// Registry of plugin UI components (lazy-loaded)
const pluginUIComponents: Record<string, Record<string, () => Promise<{ default: any }>>> = {
  pagespeed: {
    // score: () => import('@components/plugins/PageSpeedScore.svelte')
  },
};

// Cached loaded components to avoid repeated dynamic imports
const loadedComponents = new Map<string, any>();

/**
 * Get a plugin UI component
 *
 * @param pluginId - ID of the plugin
 * @param componentName - Name of the component provided by the plugin
 * @returns The component or null if not found
 */
/** Sync L1 peek — list cells skip the loading spinner when the module is warm. */
export function peekPluginComponent(pluginId: string, componentName: string): unknown | null {
  return loadedComponents.get(`${pluginId}:${componentName}`) ?? null;
}

export async function getPluginComponent(
  pluginId: string,
  componentName: string,
): Promise<any | null> {
  const cacheKey = `${pluginId}:${componentName}`;
  if (loadedComponents.has(cacheKey)) {
    return loadedComponents.get(cacheKey);
  }

  const plugin = pluginUIComponents[pluginId];
  if (!plugin?.[componentName]) {
    logger.warn(`Plugin component not found: ${pluginId}.${componentName}`);
    return null;
  }

  try {
    const module = await plugin[componentName]();
    const component = module.default;
    loadedComponents.set(cacheKey, component);
    return component;
  } catch (error) {
    logger.error(`Failed to load plugin component: ${pluginId}.${componentName}`, error);
    return null;
  }
}
