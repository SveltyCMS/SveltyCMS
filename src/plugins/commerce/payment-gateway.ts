/**
 * @file src/plugins/commerce/payment-gateway.ts
 * @description PSP-agnostic payment port. Stripe implements this; PayPal would too.
 * Amount is always integer cents from server `grandTotal` — never the client.
 */

export interface CreateIntentInput {
  amount: number;
  currency: string;
  orderId: string;
  tenantId: string;
  receiptEmail?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  id: string;
  clientSecret: string | null;
  status: string;
  amount: number;
  currency: string;
}

export interface PaymentGateway {
  readonly id: string;
  createIntent(input: CreateIntentInput): Promise<PaymentIntentResult>;
  retrieveIntent(id: string, tenantId: string): Promise<PaymentIntentResult>;
}
