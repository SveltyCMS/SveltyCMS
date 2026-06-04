/**
 * @file src/plugins/stripe/index.ts
 * @description Stripe Payments plugin for SveltyCMS.
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
      description: "Ensure plugin_stripe_payments collection exists",
      up: async (dbAdapter) => {
        if (typeof (dbAdapter as any).createModel === "function") {
          await (dbAdapter as any).createModel({ _id: "plugin_stripe_payments" });
        } else {
          await dbAdapter.crud.findMany(
            "plugin_stripe_payments",
            {},
            { limit: 1, bypassTenantCheck: true },
          );
        }
      },
    },
    {
      id: "002_create_customers",
      pluginId: "stripe",
      version: 2,
      description: "Ensure plugin_stripe_customers collection exists",
      up: async (dbAdapter) => {
        if (typeof (dbAdapter as any).createModel === "function") {
          await (dbAdapter as any).createModel({ _id: "plugin_stripe_customers" });
        } else {
          await dbAdapter.crud.findMany(
            "plugin_stripe_customers",
            {},
            { limit: 1, bypassTenantCheck: true },
          );
        }
      },
    },
  ],
  hooks: {
    beforeSave: async (context, _collection, data) => {
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
