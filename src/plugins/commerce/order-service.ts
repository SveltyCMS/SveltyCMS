/**
 * @file src/plugins/commerce/order-service.ts
 * @description Cart → order and refund. Tenant-scoped. Status values match
 * the ecommerce preset: pending|processing|shipped|delivered|cancelled|refunded.
 */

import { generateUUID } from "@utils/native-utils";
import { nowISODateString } from "@utils/date";
import { raise } from "@utils/error-handling";
import type { PriceBreakdown } from "@src/services/commerce/types";
import type { OrderStatus } from "@src/services/commerce/types";
import type { CartView } from "./cart-service";
import { priceToMajor } from "./money";
import type { CommerceStore } from "./store";
import { decrementStock, restoreStock } from "./inventory-service";

const ALLOWED: Record<string, OrderStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export const OFFLINE_METHODS = ["cod", "bank_transfer"] as const;
export type PaymentMethod = "stripe" | (typeof OFFLINE_METHODS)[number];

export interface CheckoutInput {
  email: string;
  country?: string;
  state?: string;
  shippingAddress?: string;
  billingAddress?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
  trackingUrl?: string;
}

const CANCEL_WINDOW_MS = 60 * 60 * 1000;

export async function placeOrder(
  store: CommerceStore,
  cart: CartView,
  breakdown: PriceBreakdown,
  input: CheckoutInput,
): Promise<Record<string, unknown>> {
  if (!cart.items.length) raise(400, "Cart is empty.", "CART_EMPTY");
  const email = String(input.email || "").trim();
  if (!email || !email.includes("@"))
    raise(400, "A valid customer email is required.", "EMAIL_REQUIRED");

  const majors = {
    subtotal: priceToMajor(breakdown.subtotal),
    total: priceToMajor(breakdown.grandTotal),
    shippingTotal: priceToMajor(
      breakdown.adjustments.find((a) => a.type === "shipping")?.amount ?? {
        amount: 0,
        currency: breakdown.grandTotal.currency,
      },
    ),
    taxTotal: priceToMajor(
      breakdown.adjustments.find((a) => a.type === "tax")?.amount ?? {
        amount: 0,
        currency: breakdown.grandTotal.currency,
      },
    ),
    discountTotal: Math.abs(
      priceToMajor(
        breakdown.adjustments.find((a) => a.type === "promotion")?.amount ?? {
          amount: 0,
          currency: breakdown.grandTotal.currency,
        },
      ),
    ),
  };

  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${generateUUID().slice(0, 4).toUpperCase()}`;
  const created = await store.create("orders", {
    orderNumber,
    customer: cart.customer,
    customerEmail: email,
    items: cart.items,
    subtotal: majors.subtotal,
    shippingTotal: majors.shippingTotal,
    taxTotal: majors.taxTotal,
    discountTotal: majors.discountTotal,
    total: majors.total,
    totalCents: breakdown.grandTotal.amount,
    currency: breakdown.grandTotal.currency,
    status: "pending",
    couponCode: cart.appliedCoupon,
    shippingAddress: input.shippingAddress || "",
    billingAddress: input.billingAddress || "",
    notes: input.notes || "",
    inventoryCommitted: false,
    cartId: cart.id,
    paymentMethod: input.paymentMethod || "stripe",
    createdAt: nowISODateString(),
  });

  const orderId = String(created._id ?? "");
  const low = await decrementStock(store, cart.items, orderId);
  await store.update("carts", cart.id, { items: [], subtotal: 0, appliedCoupon: null });
  return {
    ...created,
    _id: orderId,
    orderNumber,
    totalCents: breakdown.grandTotal.amount,
    lowStock: low,
  };
}

export function canCancelOrder(order: Record<string, unknown>, now = Date.now()): boolean {
  if (String(order.status) !== "pending") return false;
  const created = new Date(String(order.createdAt || 0)).getTime();
  return Number.isFinite(created) && now - created <= CANCEL_WINDOW_MS;
}

export async function cancelOrder(
  store: CommerceStore,
  orderId: string,
): Promise<Record<string, unknown>> {
  const order = await store.findOne("orders", { _id: orderId });
  if (!order) raise(404, "Order not found.", "ORDER_NOT_FOUND");
  if (!canCancelOrder(order)) {
    raise(409, "This order can no longer be cancelled.", "CANCEL_WINDOW");
  }
  const updated = await transitionOrder(store, orderId, "cancelled");
  const items = Array.isArray(order.items) ? (order.items as CartView["items"]) : [];
  await restoreStock(store, items, orderId);
  return updated;
}

export async function transitionOrder(
  store: CommerceStore,
  orderId: string,
  next: OrderStatus,
): Promise<Record<string, unknown>> {
  const order = await store.findOne("orders", { _id: orderId });
  if (!order) raise(404, "Order not found.", "ORDER_NOT_FOUND");
  const current = String(order.status || "pending") as OrderStatus;
  if (!ALLOWED[current]?.includes(next)) {
    raise(409, `Cannot move order from ${current} to ${next}.`, "INVALID_STATUS");
  }
  await store.update("orders", orderId, { status: next, updatedAt: nowISODateString() });
  const saved = await store.findOne("orders", { _id: orderId });
  return saved || { ...order, status: next };
}

export async function refundOrder(
  store: CommerceStore,
  orderId: string,
): Promise<Record<string, unknown>> {
  const order = await store.findOne("orders", { _id: orderId });
  if (!order) raise(404, "Order not found.", "ORDER_NOT_FOUND");
  const updated = await transitionOrder(store, orderId, "refunded");
  const items = Array.isArray(order.items) ? (order.items as CartView["items"]) : [];
  await restoreStock(store, items, orderId);
  return updated;
}
