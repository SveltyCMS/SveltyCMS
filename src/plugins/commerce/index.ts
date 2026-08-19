/**
 * @file src/plugins/commerce/index.ts
 * @description Optional Commerce plugin — cart, quotes, checkout, inventory.
 *
 * Disabled by default so blogs and SaaS sites never boot a store pipeline.
 * Guest `/api/commerce/*` is dispatched by the catch-all API (not
 * `/api/plugins/[pluginId]`) so checkout does not require `plugins:execute`.
 *
 * ### Features:
 * - guest cart + merge on login
 * - tax / shipping / coupon quotes
 * - per-variant inventory
 * - Stripe grandTotal PaymentIntent
 * - Commerce Pro license gates
 */

import { definePlugin } from "../define-plugin";

export const commercePlugin = definePlugin({
  metadata: {
    id: "commerce",
    name: "Commerce",
    version: "1.0.0",
    description:
      "Optional store pipeline: guest cart, tax/shipping quotes, coupons, inventory, and checkout. Stripe stays a payment adapter.",
    author: "SveltyCMS",
    icon: "mdi:cart-outline",
    enabled: false,
    category: "commerce",
  },
  config: {
    public: {
      currency: "EUR",
      cartMaxItems: 50,
    },
    private: {
      checkoutPanes: ["contact", "shipping", "payment", "review"],
      merchantEmail: "",
      bankTransferInstructions:
        "Please transfer the order total using the order number as the reference.",
    },
  },
  migrations: [
    {
      id: "001_commerce_addresses",
      pluginId: "commerce",
      version: 1,
      description: "Customer address book collection (tenant-scoped)",
      up: async (dbAdapter: {
        collection: { createModel: (schema: unknown) => Promise<unknown> };
      }) => {
        await dbAdapter.collection.createModel({
          _id: "commerce_addresses",
          name: "commerce_addresses",
          fields: [
            { label: "Customer", name: "customer", type: "text", required: true },
            { label: "Label", name: "label", type: "text" },
            { label: "Line 1", name: "line1", type: "text", required: true },
            { label: "Line 2", name: "line2", type: "text" },
            { label: "City", name: "city", type: "text", required: true },
            { label: "Postal", name: "postal", type: "text", required: true },
            { label: "Country", name: "country", type: "text", required: true },
            { label: "Default shipping", name: "isDefaultShipping", type: "boolean" },
            { label: "Default billing", name: "isDefaultBilling", type: "boolean" },
            { label: "Tenant ID", name: "tenantId", type: "text" },
          ],
          status: "publish",
        });
      },
    },
  ],
  parts: [
    {
      type: "capability",
      capabilities: ["commerce:guest"],
    },
  ],
});
