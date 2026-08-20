/**
 * @file src/plugins/commerce/cart-service.ts
 * @description Guest + logged-in carts. Every query includes tenantId.
 *
 * Line prices come from the products collection (never the client).
 * Merge on login: guest session cart items fold into the customer cart.
 *
 * ### Features:
 * - session cookie cart
 * - max items
 * - merge on login
 * - tenant isolation
 */

import { nowISODateString } from "@utils/date";
import { raise } from "@utils/error-handling";
import { add, money } from "@src/services/commerce/price";
import type { CommerceRow, CommerceStore } from "./store";
import { displayText, majorToPrice, priceToMajor } from "./money";

export const CART_MAX_ITEMS = 50;
const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CartLine {
  productId: string;
  variantSku?: string;
  title: string;
  sku: string;
  qty: number;
  unitAmount: number;
  currency: string;
  downloadable?: boolean;
}

export interface CartView {
  id: string;
  sessionId: string;
  customer: string | null;
  items: CartLine[];
  subtotal: number;
  currency: string;
  appliedCoupon: string | null;
  expiresAt: string;
}

function asLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row) => row && typeof row === "object") as CartLine[];
}

function expiresAt(): string {
  return new Date(Date.now() + CART_TTL_MS).toISOString();
}

function toView(row: CommerceRow, currency: string): CartView {
  const items = asLines(row.items);
  const subtotal = items.reduce(
    (sum, line) => add(sum, money(line.unitAmount * line.qty, line.currency || currency)),
    money(0, currency),
  );
  return {
    id: String(row._id ?? ""),
    sessionId: String(row.sessionId ?? ""),
    customer: row.customer ? String(row.customer) : null,
    items,
    subtotal: priceToMajor(subtotal),
    currency,
    appliedCoupon: row.appliedCoupon ? String(row.appliedCoupon) : null,
    expiresAt: String(row.expiresAt ?? ""),
  };
}

export async function getOrCreateCart(
  store: CommerceStore,
  input: { sessionId: string; customerId?: string | null; currency: string },
): Promise<CartView> {
  const { sessionId, customerId, currency } = input;
  if (customerId) {
    const owned = await store.findOne("carts", { customer: customerId });
    if (owned) return toView(owned, currency);
  }
  const guest = await store.findOne("carts", { sessionId });
  if (guest) return toView(guest, currency);

  const created = await store.create("carts", {
    sessionId,
    customer: customerId || null,
    items: [],
    subtotal: 0,
    appliedCoupon: null,
    expiresAt: expiresAt(),
    status: "publish",
  });
  return toView(created, currency);
}

export async function mergeCartOnLogin(
  store: CommerceStore,
  input: { sessionId: string; customerId: string; currency: string },
): Promise<CartView> {
  const { sessionId, customerId, currency } = input;
  const guest = await store.findOne("carts", { sessionId });
  const owned = await store.findOne("carts", { customer: customerId });

  if (!guest) {
    if (owned) return toView(owned, currency);
    return getOrCreateCart(store, { sessionId, customerId, currency });
  }

  if (!owned || String(owned._id) === String(guest._id)) {
    await store.update("carts", String(guest._id), {
      customer: customerId,
      expiresAt: expiresAt(),
    });
    const updated = await store.findOne("carts", { _id: guest._id });
    return toView(updated || guest, currency);
  }

  const merged = mergeLines(asLines(owned.items), asLines(guest.items));
  if (merged.length > CART_MAX_ITEMS) {
    raise(400, `Cart cannot exceed ${CART_MAX_ITEMS} lines.`, "CART_FULL");
  }
  await store.update("carts", String(owned._id), {
    items: merged,
    subtotal: priceToMajor(lineSubtotal(merged, currency)),
    expiresAt: expiresAt(),
  });
  await store.delete("carts", String(guest._id));
  const next = await store.findOne("carts", { _id: owned._id });
  return toView(next || owned, currency);
}

function mergeLines(base: CartLine[], extra: CartLine[]): CartLine[] {
  const out = [...base];
  for (const line of extra) {
    const idx = out.findIndex(
      (row) =>
        row.productId === line.productId && (row.variantSku || "") === (line.variantSku || ""),
    );
    if (idx >= 0) {
      out[idx] = { ...out[idx], qty: out[idx].qty + line.qty };
    } else {
      out.push(line);
    }
  }
  return out;
}

function lineSubtotal(items: CartLine[], currency: string) {
  return items.reduce(
    (sum, line) => add(sum, money(line.unitAmount * line.qty, line.currency || currency)),
    money(0, currency),
  );
}

export async function addCartItem(
  store: CommerceStore,
  input: {
    sessionId: string;
    customerId?: string | null;
    currency: string;
    productId: string;
    variantSku?: string;
    qty: number;
    allowBundles?: boolean;
  },
): Promise<CartView> {
  const qty = Math.floor(Number(input.qty));
  if (!Number.isFinite(qty) || qty < 1) raise(400, "Quantity must be at least 1.", "INVALID_QTY");

  const product = await store.findOne("products", { _id: input.productId });
  if (!product) raise(404, "Product not found.", "PRODUCT_NOT_FOUND");

  const cart = await getOrCreateCart(store, input);
  const lines = asLines((await store.findOne("carts", { _id: cart.id }))?.items);

  const priced = resolveProductLine(product, input.variantSku, qty, input.currency);
  const bundleItems = Array.isArray(product.bundleItems) ? product.bundleItems : [];
  const toAdd =
    input.allowBundles && bundleItems.length
      ? explodeBundle(product, bundleItems, qty, input.currency)
      : [priced];

  const next = mergeLines(lines, toAdd);
  if (next.length > CART_MAX_ITEMS) {
    raise(400, `Cart cannot exceed ${CART_MAX_ITEMS} lines.`, "CART_FULL");
  }

  await store.update("carts", cart.id, {
    items: next,
    subtotal: priceToMajor(lineSubtotal(next, input.currency)),
    expiresAt: expiresAt(),
    updatedAt: nowISODateString(),
  });
  const saved = await store.findOne("carts", { _id: cart.id });
  return toView(saved || { ...cart, items: next }, input.currency);
}

function explodeBundle(
  product: CommerceRow,
  bundleItems: unknown[],
  qty: number,
  currency: string,
): CartLine[] {
  const title = displayText(product.title) || displayText(product.name) || "Bundle";
  return bundleItems.map((raw, index) => {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const unit = majorToPrice(row.price ?? row.unitAmount ?? 0, currency);
    return {
      productId: String(row.productId ?? product._id ?? ""),
      variantSku: row.sku ? String(row.sku) : undefined,
      title: `${title} · ${displayText(row.title) || String(row.sku || index)}`,
      sku: String(row.sku ?? `${product.sku || "bundle"}-${index}`),
      qty: qty * (Number(row.qty) || 1),
      unitAmount: unit.amount,
      currency,
    };
  });
}

function resolveProductLine(
  product: CommerceRow,
  variantSku: string | undefined,
  qty: number,
  currency: string,
): CartLine {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const variant = variantSku
    ? variants.find((row) => {
        const rec = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
        return String(rec.sku ?? "") === variantSku;
      })
    : undefined;
  const source = (variant && typeof variant === "object" ? variant : product) as Record<
    string,
    unknown
  >;
  const unit = majorToPrice(source.price ?? product.price ?? 0, currency);
  return {
    productId: String(product._id ?? ""),
    variantSku: variantSku || undefined,
    title: displayText(product.title) || displayText(product.name) || "Untitled",
    sku: String(source.sku ?? product.sku ?? ""),
    qty,
    unitAmount: unit.amount,
    currency,
    downloadable: Boolean(source.downloadable ?? product.downloadable),
  };
}

export async function updateCartItem(
  store: CommerceStore,
  input: {
    sessionId: string;
    customerId?: string | null;
    currency: string;
    productId: string;
    variantSku?: string;
    qty: number;
  },
): Promise<CartView> {
  const cart = await getOrCreateCart(store, input);
  const qty = Math.floor(Number(input.qty));
  let items = asLines((await store.findOne("carts", { _id: cart.id }))?.items);
  if (qty <= 0) {
    items = items.filter(
      (line) =>
        !(
          line.productId === input.productId && (line.variantSku || "") === (input.variantSku || "")
        ),
    );
  } else {
    const idx = items.findIndex(
      (line) =>
        line.productId === input.productId && (line.variantSku || "") === (input.variantSku || ""),
    );
    if (idx < 0) raise(404, "Line not in cart.", "LINE_NOT_FOUND");
    items[idx] = { ...items[idx], qty };
  }
  await store.update("carts", cart.id, {
    items,
    subtotal: priceToMajor(lineSubtotal(items, input.currency)),
    expiresAt: expiresAt(),
    updatedAt: nowISODateString(),
  });
  const saved = await store.findOne("carts", { _id: cart.id });
  return toView(saved || { items }, input.currency);
}

export async function setCartCoupon(
  store: CommerceStore,
  input: { sessionId: string; customerId?: string | null; currency: string; code: string | null },
): Promise<CartView> {
  const cart = await getOrCreateCart(store, input);
  await store.update("carts", cart.id, {
    appliedCoupon: input.code,
    expiresAt: expiresAt(),
    updatedAt: nowISODateString(),
  });
  const saved = await store.findOne("carts", { _id: cart.id });
  return toView((saved || cart) as CommerceRow, input.currency);
}

export function cartSubtotalCents(cart: CartView): number {
  return cart.items.reduce((sum, line) => sum + line.unitAmount * line.qty, 0);
}
