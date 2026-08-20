/**
 * @file src/plugins/taxjar/index.ts
 * @description Paid TaxJar plugin for live sales-tax quotes.
 *
 * Not a field widget: live tax needs HTTP + secrets and the Commerce
 * `TaxProvider` port. Preset `tax_rates` stay free in Commerce.
 *
 * ### Features:
 * - marketplace Paid SKU `plugin:taxjar` (14-day trial)
 * - encrypted API token
 * - sandbox `testRatePercent` until TaxJar HTTP is keyed
 * - disabled by default
 */

import { definePlugin } from "../define-plugin";

export const taxjarPlugin = definePlugin({
  metadata: {
    id: "taxjar",
    name: "TaxJar",
    version: "1.0.0",
    description:
      "Paid live sales-tax quotes for Commerce checkout. Preset tax_rates remain the free table.",
    author: "SveltyCMS",
    icon: "mdi:receipt-text-outline",
    enabled: false,
    category: "commerce",
    capabilities: ["network:fetch"],
  },
  config: {
    public: {
      testRatePercent: 0,
      shippingTaxable: true,
    },
    private: {
      apiToken: "",
    },
  },
  parts: [
    {
      type: "settings",
      declaration: {
        label: "TaxJar",
        description:
          "Paid plugin. Without a license (after the 14-day trial) checkout keeps using Commerce tax_rates.",
        fields: [
          {
            type: "number",
            name: "testRatePercent",
            label: "Sandbox rate (percent)",
            min: 0,
            max: 100,
            default: 0,
          },
          {
            type: "boolean",
            name: "shippingTaxable",
            label: "Tax shipping",
            default: true,
          },
          { type: "secret", name: "apiToken", label: "TaxJar API token" },
        ],
      },
    },
  ],
});
