/**
 * @file src/plugins/shipping-live/providers.ts
 * @description ShippingRateProvider for UPS / FedEx / DHL.
 *
 * Licensed + enabled: sandbox `testRateCents` (or a future live HTTP quote).
 * Unlicensed / disabled: return null so Commerce table rates still apply.
 */

import { money } from "@src/services/commerce/price";
import type { Adjustment } from "@src/services/commerce/types";
import {
  isFulfillmentPluginReady,
  type FulfillmentQuoteContext,
  type ShippingRateProvider,
} from "../commerce/fulfillment";

export const SHIPPING_LIVE_PLUGIN_ID = "shipping-live";

const CARRIER_LABEL: Record<string, string> = {
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
};

export function createShippingLiveProvider(
  isReady: typeof isFulfillmentPluginReady = isFulfillmentPluginReady,
): ShippingRateProvider {
  return {
    id: SHIPPING_LIVE_PLUGIN_ID,
    pluginId: SHIPPING_LIVE_PLUGIN_ID,
    async quote(ctx: FulfillmentQuoteContext): Promise<Adjustment | null> {
      const { ready, settings } = await isReady(SHIPPING_LIVE_PLUGIN_ID, ctx.tenantId);
      if (!ready) return null;
      const cents = Number(settings.testRateCents ?? 0);
      if (!(cents > 0)) return null;
      const carrier = String(settings.carrier || "ups").toLowerCase();
      return {
        type: "shipping",
        label: CARRIER_LABEL[carrier] || "Live shipping",
        weight: 20,
        amount: money(Math.round(cents), ctx.currency),
      };
    },
  };
}

export const shippingLiveProvider = createShippingLiveProvider();
