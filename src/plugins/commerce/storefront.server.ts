/**
 * @file src/plugins/commerce/storefront.server.ts
 * @description Trader block for the public shop, checkout, and legal pages.
 */

import { pluginRegistry } from "@src/plugins/registry";
import { requireCommerceTenantId } from "./tenant";
import { readCommerceLegal, traderIdentityReady, type CommerceLegal } from "./legal";

export async function commerceLegalFor(tenantRaw: string | null | undefined): Promise<{
  enabled: boolean;
  legal: CommerceLegal;
  identityReady: boolean;
}> {
  const tenantId = requireCommerceTenantId(tenantRaw ?? null);
  const state = await pluginRegistry.getPluginState("commerce", String(tenantId));
  const enabled = state
    ? Boolean(state.enabled)
    : Boolean(pluginRegistry.get("commerce")?.metadata?.enabled);
  const legal = readCommerceLegal(state?.settings as Record<string, unknown> | undefined);
  return { enabled, legal, identityReady: traderIdentityReady(legal) };
}
