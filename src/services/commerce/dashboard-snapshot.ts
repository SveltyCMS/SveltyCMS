/**
 * @file src/services/commerce/dashboard-snapshot.ts
 * @description
 * Pure helpers that turn ecommerce-preset collection rows into dashboard
 * widget payloads. No DB I/O — the dashboard handler fetches via LocalCMS
 * and maps here so widgets stay collection-schema-agnostic.
 *
 * Field names match `src/routes/setup/presets.ts` (`inventory`, `orderNumber`,
 * `customerEmail`, `lowStockThreshold`, `variants`) plus aliases used by
 * Smart Importer / the commerce plan (`inventoryQty`).
 *
 * ### Features:
 * - unwrap LocalCMS `{ data }` / `{ items }` find results
 * - order status mix + recent list
 * - variant-aware low-stock / out-of-stock inventory
 * - localized title unwrapping
 */

export interface CommerceOrderRow {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  createdAt: string;
  customerEmail: string;
}

export interface CommerceOrdersSnapshot {
  available: boolean;
  total: number;
  byStatus: Record<string, number>;
  recent: CommerceOrderRow[];
}

export interface CommerceStockRow {
  id: string;
  title: string;
  sku: string;
  qty: number;
  threshold: number;
}

export interface CommerceInventorySnapshot {
  available: boolean;
  tracked: number;
  outOfStock: number;
  lowStock: CommerceStockRow[];
}

/** Unwrap LocalCMS / adapter find envelopes into plain row objects. */
export function commerceRows(
  found: { success?: boolean; data?: unknown } | unknown[] | null | undefined,
): Record<string, unknown>[] {
  if (!found) return [];
  if (Array.isArray(found)) return found as Record<string, unknown>[];
  if (typeof found !== "object") return [];
  const envelope = found as { success?: boolean; data?: unknown };
  if (envelope.success === false) return [];
  const raw = "data" in envelope ? envelope.data : found;
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: Record<string, unknown>[] }).items;
  }
  return [];
}

/** First displayable string from a translated field or nested title object. */
export function displayText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return displayText(value[0]);
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const key of ["en", "de", "default", "title", "name", "label"]) {
      if (typeof rec[key] === "string" && rec[key].trim()) return rec[key] as string;
    }
    for (const nested of Object.values(rec)) {
      if (typeof nested === "string" && nested.trim()) return nested;
    }
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numericQty(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Product or variant quantity — preset `inventory`, plan/import aliases. */
export function inventoryQty(row: Record<string, unknown>): number {
  return numericQty(row.inventory ?? row.inventoryQty ?? row.inventoryQuantity);
}

export function summarizeOrders(
  rows: Record<string, unknown>[],
  recentLimit = 5,
): CommerceOrdersSnapshot {
  const byStatus: Record<string, number> = {};
  const recent: CommerceOrderRow[] = [];
  const cap = Math.max(1, recentLimit);

  for (const row of rows) {
    const status = displayText(row.status) || "pending";
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (recent.length < cap) {
      recent.push({
        id: String(row._id ?? row.id ?? ""),
        orderNumber: displayText(row.orderNumber) || String(row._id ?? "—"),
        total: numericQty(row.total),
        status,
        createdAt: String(row.createdAt || ""),
        customerEmail: displayText(row.customerEmail) || displayText(row.createdBy) || "",
      });
    }
  }

  return {
    available: true,
    total: rows.length,
    byStatus,
    recent,
  };
}

export function summarizeInventory(
  rows: Record<string, unknown>[],
  lowStockLimit = 8,
): CommerceInventorySnapshot {
  const lowStock: CommerceStockRow[] = [];
  let outOfStock = 0;
  let tracked = 0;

  for (const row of rows) {
    const productTitle = displayText(row.title) || displayText(row.name) || "Untitled";
    const productSku = displayText(row.sku);
    const productThreshold = numericQty(row.lowStockThreshold) || 5;
    const variants = Array.isArray(row.variants) ? row.variants : [];
    const productId = String(row._id ?? row.id ?? "");

    if (variants.length) {
      variants.forEach((raw, index) => {
        const variant = asRecord(raw);
        if (!variant) return;
        tracked += 1;
        const qty = inventoryQty(variant);
        const threshold = numericQty(variant.lowStockThreshold) || productThreshold;
        const sku = displayText(variant.sku) || productSku;
        const variantLabel = displayText(variant.title) || displayText(variant.name) || sku;
        if (qty <= 0 || variant.stockStatus === "out_of_stock") outOfStock += 1;
        if (qty <= threshold || variant.stockStatus === "out_of_stock") {
          lowStock.push({
            id: `${productId}:${sku || index}`,
            title:
              variantLabel && variantLabel !== productTitle
                ? `${productTitle} · ${variantLabel}`
                : productTitle,
            sku,
            qty,
            threshold,
          });
        }
      });
      continue;
    }

    tracked += 1;
    const qty = inventoryQty(row);
    const out = qty <= 0 || row.stockStatus === "out_of_stock";
    if (out) outOfStock += 1;
    if (qty <= productThreshold || out) {
      lowStock.push({
        id: productId,
        title: productTitle,
        sku: productSku,
        qty,
        threshold: productThreshold,
      });
    }
  }

  lowStock.sort((a, b) => a.qty - b.qty);

  return {
    available: true,
    tracked,
    outOfStock,
    lowStock: lowStock.slice(0, Math.max(1, lowStockLimit)),
  };
}

export function emptyOrdersSnapshot(): CommerceOrdersSnapshot {
  return { available: false, total: 0, byStatus: {}, recent: [] };
}

export function emptyInventorySnapshot(): CommerceInventorySnapshot {
  return { available: false, tracked: 0, outOfStock: 0, lowStock: [] };
}
