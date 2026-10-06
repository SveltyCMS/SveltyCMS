/**
 * @file src/plugins/commerce/withdrawal.ts
 * @description Consumer withdrawal (§356a BGB): confirm, record, email, restock.
 */

import { nowISODateString } from "@utils/date";
import { raise } from "@utils/error-handling";
import type { CartView } from "./cart-service";
import { restoreStock } from "./inventory-service";
import { releaseCouponUse } from "./order-service";
import type { CommerceStore } from "./store";
import { withdrawalDecision } from "./vat";

export interface WithdrawalInput {
  orderNumber: string;
  name: string;
  email: string;
  confirm: boolean;
}

export async function declareWithdrawal(
  store: CommerceStore,
  input: WithdrawalInput,
): Promise<Record<string, unknown>> {
  const orderNumber = input.orderNumber.trim();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!orderNumber || !name || !email.includes("@")) {
    raise(400, "Name, order number, and email are required.", "WITHDRAWAL_REQUIRED");
  }
  if (!input.confirm) {
    raise(400, "Confirm the withdrawal to submit it.", "WITHDRAWAL_CONFIRM");
  }

  const order = await store.findOne("orders", { orderNumber });
  if (
    !order ||
    String(order.customerEmail || "")
      .trim()
      .toLowerCase() !== email
  ) {
    raise(404, "Order not found.", "ORDER_NOT_FOUND");
  }

  const decision = withdrawalDecision(order as Parameters<typeof withdrawalDecision>[0]);
  if (!decision.open) {
    const message =
      decision.reason === "waived"
        ? "The withdrawal right was waived for this digital order."
        : decision.reason === "already"
          ? "A withdrawal is already recorded for this order."
          : decision.reason === "expired"
            ? "The withdrawal period has ended."
            : "This order can no longer be withdrawn.";
    raise(409, message, "WITHDRAWAL_CLOSED");
  }

  const at = nowISODateString();
  const status = String(order.status || "pending");
  const patch: Record<string, unknown> = {
    withdrawalAt: at,
    withdrawalName: name,
    updatedAt: at,
  };
  if (status === "pending" || status === "processing") {
    patch.status = "cancelled";
  }
  await store.update("orders", String(order._id), patch);

  if (patch.status === "cancelled") {
    const items = Array.isArray(order.items) ? (order.items as CartView["items"]) : [];
    await restoreStock(store, items, String(order._id));
    await releaseCouponUse(store, order.couponCode);
  }

  const saved = await store.findOne("orders", { _id: order._id });
  return saved || { ...order, ...patch };
}
