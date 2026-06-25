/**
 * @file src/plugins/stripe/index.ts
 * @description Stripe Payments plugin for SveltyCMS — headless payment processing.
 *
 * Accept payments via Stripe for gated content, memberships, or e-commerce.
 * Uses the official Stripe SDK server-side and Stripe.js via CDN client-side
 * for PCI-compliant card collection. Zero npm dependencies beyond `stripe`.
 *
 * ### Features:
 * - PaymentIntent creation/confirmation via server API
 * - Stripe Elements card input (iframe-isolated, PCI-compliant)
 * - Webhook handler for payment status updates
 * - Payment status column in entry lists
 * - Tenant-level API key configuration
 * - Audit-logged payment transactions
 * - Abstract migrations via dbAdapter.schema.ensureCollection()
 * - Allowed checkout origins for headless frontends
 */

import type { Plugin } from "../types";

export const stripePlugin: Plugin = {
  metadata: {
    id: "stripe",
    name: "Stripe Payments",
    version: "1.0.0",
    description:
      "Accept payments via Stripe for gated content, memberships, or e-commerce with PCI-compliant card collection.",
    author: "SveltyCMS",
    icon: "mdi:credit-card-outline",
    enabled: false,
    category: "payments",
  },
  config: {
    public: {
      publishableKey: "",
      currency: "usd",
      appearance: "default",
    },
    private: {
      secretKey: "",
      webhookSecret: "",
      allowedCheckoutOrigins: [],
    },
  },
  ui: {
    columns: [
      {
        id: "payment_status",
        label: "Payment",
        width: "100px",
        sortable: false,
        component: "paymentStatus",
        props: {
          status: "paymentStatus",
          amount: "paymentAmount",
        },
      },
    ],
  },
  migrations: [
    {
      id: "001_create_payments",
      pluginId: "stripe",
      version: 1,
      description: "Ensure plugin_stripe_payments collection exists via abstract schema adapter",
      up: async (dbAdapter) => {
        await dbAdapter.schema.ensureCollection("plugin_stripe_payments", {
          fields: [
            {
              label: "Stripe Intent ID",
              name: "stripeIntentId",
              type: "text",
              required: true,
            },
            { label: "Status", name: "status", type: "text" },
            { label: "Amount", name: "amount", type: "number" },
            { label: "Currency", name: "currency", type: "text" },
            { label: "Metadata", name: "metadata", type: "json" },
            { label: "Tenant ID", name: "tenantId", type: "text" },
          ],
          status: "publish",
        });
      },
    },
    {
      id: "002_create_customers",
      pluginId: "stripe",
      version: 2,
      description: "Ensure plugin_stripe_customers collection exists via abstract schema adapter",
      up: async (dbAdapter) => {
        await dbAdapter.schema.ensureCollection("plugin_stripe_customers", {
          fields: [
            {
              label: "Stripe Customer ID",
              name: "stripeCustomerId",
              type: "text",
              required: true,
            },
            { label: "Email", name: "email", type: "text" },
            { label: "Name", name: "name", type: "text" },
            { label: "Metadata", name: "metadata", type: "json" },
            { label: "Tenant ID", name: "tenantId", type: "text" },
          ],
          status: "publish",
        });
      },
    },
  ],
  hooks: {
    beforeSave: async (context, _collection, data) => {
      // SECURITY: Enforce Premium Licensing for Stripe Integration
      const { checkExtensionLicense } = await import("@src/utils/license-manager");
      const status = await checkExtensionLicense("plugin", "stripe");
      if (!status.active && !status.hasLicense) {
        throw new Error("403 Forbidden: Premium License Required for Stripe Plugin");
      }

      // If a payment intent is attached, verify it succeeded before saving
      if (data._stripePaymentIntent) {
        const { getStripe } = await import("./server/stripe");
        const stripe = await getStripe(context.tenantId);
        const intent = await stripe.paymentIntents.retrieve(data._stripePaymentIntent);
        if (intent.status !== "succeeded") {
          throw new Error(
            `Payment not completed. Status: ${intent.status}. Please complete payment before saving.`,
          );
        }
        // Store payment reference
        data._stripePaymentStatus = intent.status;
        data._stripePaymentAmount = intent.amount;
        data._stripePaymentCurrency = intent.currency;
      }
      return data;
    },
  },
  enabledCollections: [],
};
