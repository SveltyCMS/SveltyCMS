/**
 * @file src/plugins/stripe/index.ts
 * @description Stripe Payments plugin for SveltyCMS — freemium payment processing.
 *
 * Accept payments via Stripe for gated content, memberships, or e-commerce.
 * Uses the official Stripe SDK server-side and Stripe.js via CDN client-side
 * for PCI-compliant card collection. Zero npm dependencies beyond `stripe`.
 *
 * ### Licensing (Freemium):
 * - Free tier: one-time payments via PaymentIntents (amount, currency, description)
 * - Premium tier: subscriptions, invoices, multi-currency, custom themes
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
        await dbAdapter.collection.createModel({
          _id: "plugin_stripe_payments",
          name: "plugin_stripe_payments",
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
        } as any);
      },
    },
    {
      id: "002_create_customers",
      pluginId: "stripe",
      version: 2,
      description: "Ensure plugin_stripe_customers collection exists via abstract schema adapter",
      up: async (dbAdapter) => {
        await dbAdapter.collection.createModel({
          _id: "plugin_stripe_customers",
          name: "plugin_stripe_customers",
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
        } as any);
      },
    },
  ],
  hooks: {
    beforeSave: async (context, _collection, data) => {
      const { checkExtensionLicense } = await import("@src/utils/license-manager");
      const status = await checkExtensionLicense("plugin", "stripe");

      // Premium features require a license
      if (!status.active && !status.hasLicense) {
        // Strip premium fields — keep free tier (one-time payments only)
        delete data._stripeSubscriptionPlan;
        delete data._stripeInvoiceSettings;
        delete data._stripeMultiCurrency;
        delete data._stripeCustomTheme;
        delete data._stripeAnalytics;
        console.warn("[stripe] Premium fields stripped due to missing license. Free tier active.");
      }

      // If a payment intent is attached, verify it succeeded (free + premium)
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
