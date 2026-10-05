/**
 * @file src/plugins/commerce/quotes.ts
 * @description Coupon / tax / shipping quotes. All lookups are tenant-scoped
 * via CommerceStore (tenantId injected on every find).
 *
 * Preset field names: coupons.code/discountType/amount/minSpend/usageLimit/expiresAt;
 * tax_rates.country/state/rate/shippingTaxable; shipping_zones.countries/rate/freeThreshold.
 * Live UPS/FedEx/DHL + TaxJar are paid plugins via fulfillment.ts (table rates stay free).
 */

import { money, multiply } from "@src/services/commerce/price";
import { computeTotals } from "@src/services/commerce/adjustment-engine";
import type { Adjustment, Price, PriceBreakdown } from "@src/services/commerce/types";
import { raise } from "@utils/error-handling";
import type { CartView } from "./cart-service";
import { cartSubtotalCents } from "./cart-service";
import { majorToPrice, priceToMajor } from "./money";
import type { CommerceStore } from "./store";
import { quoteLiveShipping, quoteLiveTax } from "./fulfillment";
import { normalizeTaxClass, taxableGroups, vatFromGross } from "./vat";

export interface QuoteInput {
  country?: string;
  state?: string;
  postal?: string;
  giftCardCode?: string;
}

export function cartIsDigitalOnly(cart: { items: Array<{ downloadable?: boolean }> }): boolean {
  return cart.items.length > 0 && cart.items.every((line) => line.downloadable);
}

export async function quoteCart(
  store: CommerceStore,
  cart: CartView,
  input: QuoteInput,
  opts?: { allowGiftCards?: boolean; pricesIncludeTax?: boolean; reverseCharge?: boolean },
): Promise<PriceBreakdown> {
  const currency = cart.currency;
  const subtotal = money(cartSubtotalCents(cart), currency);
  const adjustments: Adjustment[] = [];

  if (cart.appliedCoupon) {
    adjustments.push(await couponAdjustment(store, cart, subtotal));
  }

  const digitalOnly = cart.items.length > 0 && cart.items.every((line) => line.downloadable);
  const liveCtx = {
    tenantId: String(store.tenantId),
    country: input.country,
    state: input.state,
    postal: input.postal,
    currency,
    subtotal,
  };
  const shipping = digitalOnly
    ? null
    : ((await quoteLiveShipping(liveCtx)) ??
      (await shippingAdjustment(store, cart, input.country, subtotal)));
  if (shipping) adjustments.push(shipping);

  const pricesIncludeTax = opts?.pricesIncludeTax !== false;
  const liveTax = await quoteLiveTax(liveCtx, shipping);
  let taxKnown = false;
  if (opts?.reverseCharge) {
    adjustments.push({
      type: "tax",
      label: "Reverse charge",
      weight: 30,
      amount: money(0, currency),
      included: true,
      ratePercent: 0,
    });
    taxKnown = true;
  } else if (liveTax) {
    adjustments.push(liveTax);
    taxKnown = true;
  } else if (pricesIncludeTax) {
    const extracted = await includedVatAdjustments(store, cart, input, shipping, adjustments);
    adjustments.push(...extracted.adjustments);
    taxKnown = extracted.taxKnown;
  } else {
    const tax = await taxAdjustment(store, input.country, input.state, subtotal, shipping);
    if (tax) adjustments.push(tax);
    taxKnown = Boolean(tax) || !input.country;
  }

  if (input.giftCardCode) {
    if (!opts?.allowGiftCards) {
      raise(403, "Gift cards require Commerce Pro.", "LICENSE_REQUIRED");
    }
    adjustments.push(await giftCardAdjustment(store, input.giftCardCode, subtotal));
  }

  return { ...computeTotals(subtotal, adjustments), taxKnown, pricesIncludeTax };
}

async function includedVatAdjustments(
  store: CommerceStore,
  cart: CartView,
  input: QuoteInput,
  shipping: Adjustment | null,
  current: Adjustment[],
): Promise<{ adjustments: Adjustment[]; taxKnown: boolean }> {
  if (!input.country) return { adjustments: [], taxKnown: false };
  const rates = await store.findMany(
    "tax_rates",
    { country: input.country.toUpperCase() },
    { limit: 50 },
  );
  const rateRow =
    rates.find(
      (row) => String(row.state || "").toUpperCase() === String(input.state || "").toUpperCase(),
    ) ||
    rates.find((row) => !row.state) ||
    null;
  if (!rateRow) return { adjustments: [], taxKnown: false };

  const standard = Number(rateRow.rate || 0);
  const reducedRaw = Number(rateRow.reducedRate);
  const reduced = Number.isFinite(reducedRaw) ? reducedRaw : null;
  const discountCents = current
    .filter((row) => row.type === "promotion" && row.amount.amount < 0)
    .reduce((sum, row) => sum + -row.amount.amount, 0);
  const groups = taxableGroups({
    lines: cart.items.map((line) => ({
      gross: line.unitAmount * line.qty,
      taxClass: normalizeTaxClass(line.taxClass),
    })),
    discountCents,
    shippingGross: shipping?.amount.amount ?? 0,
    shippingTaxable: Boolean(rateRow.shippingTaxable),
    standardRate: standard,
    reducedRate: reduced,
  });
  const adjustments: Adjustment[] = groups.map((group) => {
    const split = vatFromGross(group.gross, group.rate);
    return {
      type: "tax" as const,
      label: group.rate > 0 ? `VAT ${group.rate}%` : "VAT 0%",
      weight: 30,
      amount: money(split.vat, cart.currency),
      included: true,
      ratePercent: group.rate,
    };
  });
  return { adjustments, taxKnown: true };
}

async function couponAdjustment(
  store: CommerceStore,
  cart: CartView,
  subtotal: Price,
): Promise<Adjustment> {
  const coupon = await store.findOne("coupons", { code: cart.appliedCoupon });
  if (!coupon) raise(400, "Coupon is not valid.", "COUPON_INVALID");

  if (coupon.expiresAt && new Date(String(coupon.expiresAt)).getTime() < Date.now()) {
    raise(400, "Coupon has expired.", "COUPON_EXPIRED");
  }
  const minSpend = majorToPrice(coupon.minSpend ?? 0, subtotal.currency);
  if (minSpend.amount > 0 && subtotal.amount < minSpend.amount) {
    raise(400, "Order does not meet the coupon minimum spend.", "COUPON_MIN_SPEND");
  }
  const usageLimit = Number(coupon.usageLimit ?? 0);
  const used = Number(coupon.usedCount ?? coupon.usageCount ?? 0);
  if (usageLimit > 0 && used >= usageLimit) {
    raise(400, "Coupon usage limit reached.", "COUPON_LIMIT");
  }

  const type = String(coupon.discountType || "percentage");
  let discount = money(0, subtotal.currency);
  if (type === "percentage") {
    discount = multiply(subtotal, -Number(coupon.amount || 0) / 100);
  } else if (type === "fixed_cart") {
    const off = majorToPrice(coupon.amount ?? 0, subtotal.currency);
    discount = money(-Math.min(off.amount, subtotal.amount), subtotal.currency);
  } else if (type === "fixed_product") {
    const off = majorToPrice(coupon.amount ?? 0, subtotal.currency);
    const units = cart.items.reduce((n, line) => n + line.qty, 0);
    discount = money(-Math.min(off.amount * units, subtotal.amount), subtotal.currency);
  } else if (type === "free_shipping") {
    discount = money(0, subtotal.currency);
  }

  return {
    type: "promotion",
    label: `Coupon ${cart.appliedCoupon}`,
    weight: 10,
    amount: discount,
  };
}

async function shippingAdjustment(
  store: CommerceStore,
  cart: CartView,
  country: string | undefined,
  subtotal: Price,
): Promise<Adjustment | null> {
  if (!country) return null;
  const zones = await store.findMany("shipping_zones", {}, { limit: 50 });
  const zone = zones.find((row) => {
    const list = String(row.countries || "")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    return list.length === 0 || list.includes(country.toUpperCase());
  });
  if (!zone) return null;

  const coupon = cart.appliedCoupon
    ? await store.findOne("coupons", { code: cart.appliedCoupon })
    : null;
  const freeFromCoupon = String(coupon?.discountType || "") === "free_shipping";
  const threshold = majorToPrice(zone.freeThreshold ?? 0, subtotal.currency);
  const free = freeFromCoupon || (threshold.amount > 0 && subtotal.amount >= threshold.amount);
  const rate = free ? money(0, subtotal.currency) : majorToPrice(zone.rate ?? 0, subtotal.currency);

  return {
    type: "shipping",
    label: String(zone.name || zone.method || "Shipping"),
    weight: 20,
    amount: rate,
  };
}

async function taxAdjustment(
  store: CommerceStore,
  country: string | undefined,
  state: string | undefined,
  subtotal: Price,
  shipping: Adjustment | null,
): Promise<Adjustment | null> {
  if (!country) return null;
  const rates = await store.findMany(
    "tax_rates",
    { country: country.toUpperCase() },
    { limit: 50 },
  );
  const rateRow =
    rates.find(
      (row) => String(row.state || "").toUpperCase() === String(state || "").toUpperCase(),
    ) ||
    rates.find((row) => !row.state) ||
    rates[0];
  if (!rateRow) return null;
  const pct = Number(rateRow.rate || 0) / 100;
  let base = subtotal.amount;
  if (rateRow.shippingTaxable && shipping) base += shipping.amount.amount;
  const tax = money(Math.round(base * pct), subtotal.currency);
  return {
    type: "tax",
    label: String(rateRow.label || "Tax"),
    weight: 30,
    amount: tax,
  };
}

async function giftCardAdjustment(
  store: CommerceStore,
  code: string,
  subtotal: Price,
): Promise<Adjustment> {
  const card = await store.findOne("gift_cards", { code });
  if (!card) raise(400, "Gift card is not valid.", "GIFT_CARD_INVALID");
  const balance = majorToPrice(card.balance ?? card.amount ?? 0, subtotal.currency);
  const applied = money(-Math.min(balance.amount, subtotal.amount), subtotal.currency);
  return {
    type: "promotion",
    label: "Gift card",
    weight: 40,
    amount: applied,
  };
}

export function breakdownToMajors(breakdown: PriceBreakdown): {
  subtotal: number;
  shipping: number;
  tax: number;
  net: number;
  discount: number;
  grandTotal: number;
  currency: string;
  taxKnown: boolean;
  pricesIncludeTax: boolean;
  vatLines: Array<{ rate: number; vat: number }>;
} {
  const currency = breakdown.grandTotal.currency;
  const sumType = (type: Adjustment["type"]) =>
    breakdown.adjustments.filter((a) => a.type === type).reduce((n, a) => n + a.amount.amount, 0);
  const taxCents = sumType("tax");
  const vatLines = breakdown.adjustments
    .filter((row) => row.type === "tax")
    .map((row) => ({
      rate: row.ratePercent ?? 0,
      vat: priceToMajor(row.amount),
    }));
  return {
    subtotal: priceToMajor(breakdown.subtotal),
    shipping: priceToMajor(money(sumType("shipping"), currency)),
    tax: priceToMajor(money(taxCents, currency)),
    net: priceToMajor(money(breakdown.grandTotal.amount - taxCents, currency)),
    discount: priceToMajor(money(sumType("promotion"), currency)),
    grandTotal: priceToMajor(breakdown.grandTotal),
    currency,
    taxKnown: breakdown.taxKnown !== false,
    pricesIncludeTax: breakdown.pricesIncludeTax !== false,
    vatLines,
  };
}
