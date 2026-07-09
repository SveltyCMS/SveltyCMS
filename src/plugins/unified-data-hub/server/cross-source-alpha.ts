/**
 * @file src/plugins/unified-data-hub/server/cross-source-alpha.ts
 * @description v3.1 alpha — opt-in cross-source virtual join execution (Pro-gated).
 *
 * Default: fail-closed decomposition (plan-only). When enabled via plugin private
 * config and valid license, allows in-memory hash-join across connectors.
 *
 * Features:
 * - Per-tenant plugin state resolution
 * - Pro license requirement
 * - Environment override for integration tests only
 */

import { pluginRegistry } from "@src/plugins/registry";
import { checkExtensionLicense } from "@src/utils/license-manager";

const PLUGIN_ID = "unified-data-hub";

export async function isCrossSourceAlphaEnabled(tenantId = "default"): Promise<boolean> {
  if (process.env.FEDERATION_CROSS_SOURCE_ALPHA === "1") {
    return true;
  }

  const plugin = pluginRegistry.get(PLUGIN_ID);
  if (!plugin) return false;

  const state = await pluginRegistry.getPluginState(PLUGIN_ID, tenantId);
  const settings = (state?.settings ?? {}) as Record<string, unknown>;
  const privateCfg = (plugin.config?.private ?? {}) as Record<string, unknown>;

  const flag =
    settings.enableCrossSourceAlpha === true || privateCfg.enableCrossSourceAlpha === true;

  if (!flag) return false;

  const license = await checkExtensionLicense("plugin", PLUGIN_ID);
  return license.active || license.hasLicense;
}
