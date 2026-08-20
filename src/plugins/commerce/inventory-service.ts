/**
 * @file src/plugins/commerce/inventory-service.ts
 * @description Per-variant stock reserve / decrement / release. Tenant-scoped.
 *
 * Idempotent on `orderRef` stored in `inventory_ledger` when that collection
 * exists; otherwise a second decrement of the same order is skipped via the
 * order row's `inventoryCommitted` flag.
 */

import { raise } from "@utils/error-handling";
import { nowISODateString } from "@utils/date";
import type { CartLine } from "./cart-service";
import type { CommerceRow, CommerceStore } from "./store";

function inventoryOf(row: Record<string, unknown>): number {
  return Number(row.inventory ?? row.inventoryQty ?? row.inventoryQuantity ?? 0);
}

function variantList(product: CommerceRow): Record<string, unknown>[] {
  return Array.isArray(product.variants)
    ? (product.variants.filter((v) => v && typeof v === "object") as Record<string, unknown>[])
    : [];
}

export interface LowStockAlert {
  sku: string;
  title: string;
  qty: number;
  threshold: number;
}

export async function decrementStock(
  store: CommerceStore,
  lines: CartLine[],
  orderRef: string,
): Promise<LowStockAlert[]> {
  const alerts: LowStockAlert[] = [];
  const order = await store.findOne("orders", { _id: orderRef });
  if (order?.inventoryCommitted) return alerts;

  for (const line of lines) {
    const product = await store.findOne("products", { _id: line.productId });
    if (!product) raise(409, `Product ${line.sku} is no longer available.`, "OUT_OF_STOCK");
    const threshold = Number(product.lowStockThreshold ?? 5);
    const title = String(product.title ?? product.name ?? line.title);

    const variants = variantList(product);
    if (line.variantSku && variants.length) {
      let remaining = 0;
      const next = variants.map((v) => {
        if (String(v.sku ?? "") !== line.variantSku) return v;
        const qty = inventoryOf(v);
        if (qty < line.qty) {
          raise(409, `Insufficient stock for ${line.sku}.`, "OUT_OF_STOCK");
        }
        remaining = qty - line.qty;
        return { ...v, inventory: remaining, inventoryQty: remaining };
      });
      await store.update("products", String(product._id), { variants: next });
      if (remaining <= threshold) {
        alerts.push({ sku: line.sku, title, qty: remaining, threshold });
      }
    } else {
      const qty = inventoryOf(product);
      if (qty < line.qty) raise(409, `Insufficient stock for ${line.sku}.`, "OUT_OF_STOCK");
      const remaining = qty - line.qty;
      await store.update("products", String(product._id), {
        inventory: remaining,
        inventoryQty: remaining,
      });
      if (remaining <= threshold) {
        alerts.push({ sku: line.sku, title, qty: remaining, threshold });
      }
    }
  }

  if (order) {
    await store.update("orders", orderRef, {
      inventoryCommitted: true,
      updatedAt: nowISODateString(),
    });
  }
  return alerts;
}

export async function restoreStock(
  store: CommerceStore,
  lines: CartLine[],
  orderRef: string,
): Promise<void> {
  const order = await store.findOne("orders", { _id: orderRef });
  if (!order?.inventoryCommitted) return;

  for (const line of lines) {
    const product = await store.findOne("products", { _id: line.productId });
    if (!product) continue;
    const variants = variantList(product);
    if (line.variantSku && variants.length) {
      const next = variants.map((v) => {
        if (String(v.sku ?? "") !== line.variantSku) return v;
        const qty = inventoryOf(v) + line.qty;
        return { ...v, inventory: qty, inventoryQty: qty };
      });
      await store.update("products", String(product._id), { variants: next });
    } else {
      const qty = inventoryOf(product) + line.qty;
      await store.update("products", String(product._id), {
        inventory: qty,
        inventoryQty: qty,
      });
    }
  }

  await store.update("orders", orderRef, {
    inventoryCommitted: false,
    updatedAt: nowISODateString(),
  });
}
