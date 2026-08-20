/**
 * @file src/plugins/shipping-live/index.ts
 * @description Paid live-carrier plugin (UPS / FedEx / DHL).
 *
 * Not a field widget: live rates need HTTP, secrets, and the Commerce
 * `ShippingRateProvider` port. Table-rate `shipping_zones` stay free in Commerce.
 *
 * ### Features:
 * - marketplace Paid SKU `plugin:shipping-live` (14-day trial)
 * - per-carrier secret keys (encrypted settings)
 * - sandbox `testRateCents` until carrier HTTP is keyed
 * - disabled by default
 */

import { definePlugin } from "../define-plugin";

export const shippingLivePlugin = definePlugin({
  metadata: {
    id: "shipping-live",
    name: "Live Shipping (UPS / FedEx / DHL)",
    version: "1.0.0",
    description:
      "Paid live carrier quotes for Commerce checkout. UPS, FedEx, and DHL keys stay in this plugin — table-rate shipping_zones remain free.",
    author: "SveltyCMS",
    icon: "mdi:truck-delivery-outline",
    enabled: false,
    category: "commerce",
    capabilities: ["network:fetch"],
  },
  config: {
    public: {
      carrier: "ups",
      testRateCents: 0,
    },
    private: {
      upsAccessKey: "",
      fedexApiKey: "",
      dhlApiKey: "",
    },
  },
  parts: [
    {
      type: "settings",
      declaration: {
        label: "Live shipping",
        description:
          "Paid plugin. Without a license (after the 14-day trial) checkout keeps using Commerce table rates.",
        fields: [
          {
            type: "string",
            name: "carrier",
            label: "Default carrier",
            list: ["ups", "fedex", "dhl"],
            default: "ups",
          },
          {
            type: "number",
            name: "testRateCents",
            label: "Sandbox rate (integer cents)",
            min: 0,
            default: 0,
          },
          { type: "secret", name: "upsAccessKey", label: "UPS access key" },
          { type: "secret", name: "fedexApiKey", label: "FedEx API key" },
          { type: "secret", name: "dhlApiKey", label: "DHL API key" },
        ],
      },
    },
  ],
});
