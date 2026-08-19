/**
 * @file src/plugins/stripe/server/payment-gateway.ts
 * @description Stripe PaymentGateway — amount is server grandTotal only.
 */

import type {
  CreateIntentInput,
  PaymentGateway,
  PaymentIntentResult,
} from "@src/plugins/commerce/payment-gateway";
import { getStripe } from "./stripe";

function mapIntent(intent: {
  id: string;
  client_secret?: string | null;
  status: string;
  amount: number;
  currency: string;
}): PaymentIntentResult {
  return {
    id: intent.id,
    clientSecret: intent.client_secret ?? null,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
  };
}

export const stripePaymentGateway: PaymentGateway = {
  id: "stripe",

  async createIntent(input: CreateIntentInput): Promise<PaymentIntentResult> {
    const stripe = await getStripe(input.tenantId);
    const intent = await stripe.paymentIntents.create({
      amount: input.amount,
      currency: input.currency.toLowerCase(),
      receipt_email: input.receiptEmail,
      metadata: {
        tenantId: input.tenantId,
        orderId: input.orderId,
        ...input.metadata,
      },
      automatic_payment_methods: { enabled: true },
    });
    return mapIntent(intent);
  },

  async retrieveIntent(id: string, tenantId: string): Promise<PaymentIntentResult> {
    const stripe = await getStripe(tenantId);
    const intent = await stripe.paymentIntents.retrieve(id);
    return mapIntent(intent);
  },
};
