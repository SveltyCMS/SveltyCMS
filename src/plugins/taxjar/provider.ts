/**
 * @file src/plugins/taxjar/provider.ts
 * @description TaxProvider for TaxJar. Unlicensed / disabled → null (table rates).
 */

import { money } from "@src/services/commerce/price";
import type { Adjustment } from "@src/services/commerce/types";
import {
  isFulfillmentPluginReady,
  type FulfillmentQuoteContext,
  type TaxProvider,
} from "../commerce/fulfillment";

export const TAXJAR_PLUGIN_ID = "taxjar";

export function createTaxjarProvider(
  isReady: typeof isFulfillmentPluginReady = isFulfillmentPluginReady,
): TaxProvider {
  return {
    id: TAXJAR_PLUGIN_ID,
    pluginId: TAXJAR_PLUGIN_ID,
    async quote(
      ctx: FulfillmentQuoteContext,
      shipping: Adjustment | null,
    ): Promise<Adjustment | null> {
      const { ready, settings } = await isReady(TAXJAR_PLUGIN_ID, ctx.tenantId);
      if (!ready) return null;
      const pct = Number(settings.testRatePercent ?? 0);
      if (!(pct > 0)) return null;
      let base = ctx.subtotal.amount;
      if (settings.shippingTaxable !== false && shipping) {
        base += shipping.amount.amount;
      }
      return {
        type: "tax",
        label: "TaxJar",
        weight: 30,
        amount: money(Math.round(base * (pct / 100)), ctx.currency),
      };
    },
  };
}

export const taxjarProvider = createTaxjarProvider();
