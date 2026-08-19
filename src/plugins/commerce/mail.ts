/**
 * @file src/plugins/commerce/mail.ts
 * @description Transactional commerce mail via nodemailer + better-svelte-email.
 * Fail-open: SMTP gaps log and return; checkout never blocks on mail.
 *
 * ### Features:
 * - customer order received / shipped / refunded
 * - merchant new-order and low-stock
 * - tenant-aware from address
 */

import { sendMail } from "@utils/email.server";
import { logger } from "@utils/logger";
import { pluginRegistry } from "@src/plugins/registry";

export interface OrderMailPayload {
  orderNumber: string;
  email: string;
  total: string;
  status: string;
  items: string;
  hostLink?: string;
  trackingUrl?: string;
}

async function merchantInbox(tenantId: string): Promise<string | null> {
  const state = await pluginRegistry.getPluginState("commerce", tenantId);
  const fromSettings = (state?.settings as { merchantEmail?: string } | undefined)?.merchantEmail;
  return fromSettings?.trim() || null;
}

async function safeSend(
  templateName: string,
  recipientEmail: string,
  subject: string,
  props: Record<string, unknown>,
): Promise<void> {
  try {
    const result = await sendMail({
      recipientEmail,
      subject,
      templateName,
      props,
    });
    if (!result?.success) {
      logger.warn("[Commerce mail] skipped or failed", {
        templateName,
        message: (result as { message?: string })?.message,
      });
    }
  } catch (err) {
    logger.warn("[Commerce mail] send failed", {
      templateName,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendOrderReceived(
  tenantId: string,
  payload: OrderMailPayload,
): Promise<void> {
  await safeSend("order-received", payload.email, `Order ${payload.orderNumber} received`, payload);
  const merchant = await merchantInbox(tenantId);
  if (merchant) {
    await safeSend("merchant-new-order", merchant, `New order ${payload.orderNumber}`, payload);
  }
}

export async function sendOrderShipped(payload: OrderMailPayload): Promise<void> {
  await safeSend("order-shipped", payload.email, `Order ${payload.orderNumber} shipped`, payload);
}

export async function sendOrderRefunded(payload: OrderMailPayload): Promise<void> {
  await safeSend(
    "order-refunded",
    payload.email,
    `Refund for order ${payload.orderNumber}`,
    payload,
  );
}

export async function sendLowStock(
  tenantId: string,
  payload: { sku: string; title: string; qty: number; threshold: number },
): Promise<void> {
  const merchant = await merchantInbox(tenantId);
  if (!merchant) return;
  await safeSend("low-stock", merchant, `Low stock: ${payload.sku}`, payload);
}

export function formatOrderItems(
  items: Array<{ title?: string; sku?: string; qty?: number }>,
): string {
  return items.map((line) => `${line.qty ?? 1} × ${line.title || line.sku || "Item"}`).join(", ");
}
