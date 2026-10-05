/**
 * @file src/plugins/commerce/vat.ts
 * @description EU gross-price VAT, 30-day reference price, and withdrawal window.
 *
 * Catalog prices are gross. VAT is extracted per rate
 * (`gross * rate / (100 + rate)`), not added on top.
 */

export type TaxClass = "standard" | "reduced" | "zero";

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeTaxClass(value: unknown): TaxClass {
  if (value === "reduced" || value === "zero") return value;
  return "standard";
}

/** VAT included in a gross minor-unit amount. */
export function vatFromGross(
  grossCents: number,
  ratePercent: number,
): { net: number; vat: number } {
  const gross = Math.max(0, Math.round(grossCents));
  if (!(ratePercent > 0) || gross === 0) return { net: gross, vat: 0 };
  const vat = Math.round((gross * ratePercent) / (100 + ratePercent));
  return { net: gross - vat, vat };
}

export function rateForClass(taxClass: TaxClass, standard: number, reduced: number | null): number {
  if (taxClass === "zero") return 0;
  if (taxClass === "reduced") return reduced != null && reduced >= 0 ? reduced : standard;
  return standard;
}

export interface RatedGross {
  rate: number;
  gross: number;
}

/**
 * Goods gross after a cart-level discount, plus shipping.
 * Shipping follows the goods rates when it is taxable, and sits at 0% when it is not.
 */
export function taxableGroups(input: {
  lines: Array<{ gross: number; taxClass: TaxClass }>;
  discountCents: number;
  shippingGross: number;
  shippingTaxable: boolean;
  standardRate: number;
  reducedRate: number | null;
}): RatedGross[] {
  const buckets = new Map<number, number>();
  let goods = 0;
  for (const line of input.lines) {
    const rate = rateForClass(line.taxClass, input.standardRate, input.reducedRate);
    const gross = Math.max(0, Math.round(line.gross));
    goods += gross;
    buckets.set(rate, (buckets.get(rate) ?? 0) + gross);
  }

  const discount = Math.min(Math.max(0, Math.round(input.discountCents)), goods);
  if (discount > 0 && goods > 0) {
    let remaining = discount;
    const entries = [...buckets.entries()];
    entries.forEach(([rate, gross], index) => {
      const raw = index === entries.length - 1 ? remaining : Math.round((discount * gross) / goods);
      const share = Math.min(gross, remaining, Math.max(0, raw));
      buckets.set(rate, gross - share);
      remaining -= share;
    });
  }

  const shipping = Math.max(0, Math.round(input.shippingGross));
  if (shipping > 0) {
    if (!input.shippingTaxable) {
      buckets.set(0, (buckets.get(0) ?? 0) + shipping);
    } else {
      const base = [...buckets.values()].reduce((sum, gross) => sum + gross, 0);
      if (base <= 0) {
        buckets.set(input.standardRate, (buckets.get(input.standardRate) ?? 0) + shipping);
      } else {
        let remaining = shipping;
        const entries = [...buckets.entries()].filter(([, gross]) => gross > 0);
        entries.forEach(([rate, gross], index) => {
          const raw =
            index === entries.length - 1 ? remaining : Math.round((shipping * gross) / base);
          const share = Math.min(remaining, Math.max(0, raw));
          buckets.set(rate, (buckets.get(rate) ?? 0) + share);
          remaining -= share;
        });
      }
    }
  }

  return [...buckets.entries()]
    .filter(([, gross]) => gross > 0)
    .map(([rate, gross]) => ({ rate, gross }));
}

export interface PricePoint {
  amount: number;
  at: string;
}

/**
 * Lowest price charged in the previous 30 days, when the current price is lower.
 * Returns null when there is no reduction to announce.
 */
export function lowestPriorPrice30Days(
  current: number,
  history: PricePoint[],
  now = Date.now(),
): number | null {
  if (!Number.isFinite(current)) return null;
  const cutoff = now - 30 * DAY_MS;
  const amounts: number[] = [];
  for (const point of history) {
    const at = new Date(point.at).getTime();
    if (!Number.isFinite(at) || at < cutoff || at > now) continue;
    if (!Number.isFinite(point.amount)) continue;
    amounts.push(point.amount);
  }
  if (!amounts.length) return null;
  const low = Math.min(...amounts);
  return current < low ? low : null;
}

export function withPriceHistory(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
  nowIso: string,
): Record<string, unknown> {
  if (!("price" in incoming)) return incoming;
  const nextPrice = Number(incoming.price);
  if (!Number.isFinite(nextPrice)) return incoming;
  const next: Record<string, unknown> = { ...incoming };
  const history = Array.isArray(incoming.priceHistory)
    ? [...incoming.priceHistory]
    : Array.isArray(existing?.priceHistory)
      ? [...existing.priceHistory]
      : [];
  const prevPrice = Number(existing?.price);
  if (existing && Number.isFinite(prevPrice) && prevPrice !== nextPrice) {
    const at = String(
      existing.priceChangedAt || existing.updatedAt || existing.createdAt || nowIso,
    );
    history.push({ amount: prevPrice, recordedAt: at });
  }
  next.priceHistory = history.slice(-60);
  if (!existing || prevPrice !== nextPrice) next.priceChangedAt = nowIso;
  return next;
}

const EU_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

export function isEuCountry(code: string): boolean {
  return EU_COUNTRIES.has(code.trim().toUpperCase());
}

/** VIES uses EL for Greece. */
export function viesCountryCode(code: string): string {
  const upper = code.trim().toUpperCase();
  return upper === "GR" ? "EL" : upper;
}

const VAT_ID_PATTERNS: Record<string, RegExp> = {
  AT: /^ATU\d{8}$/,
  BE: /^BE[01]\d{9}$/,
  BG: /^BG\d{9,10}$/,
  CY: /^CY\d{8}[A-Z]$/,
  CZ: /^CZ\d{8,10}$/,
  DE: /^DE\d{9}$/,
  DK: /^DK\d{8}$/,
  EE: /^EE\d{9}$/,
  EL: /^EL\d{9}$/,
  ES: /^ES[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^FI\d{8}$/,
  FR: /^FR[A-Z0-9]{2}\d{9}$/,
  HR: /^HR\d{11}$/,
  HU: /^HU\d{8}$/,
  IE: /^IE\d{7}[A-Z]{1,2}$/,
  IT: /^IT\d{11}$/,
  LT: /^LT(\d{9}|\d{12})$/,
  LU: /^LU\d{8}$/,
  LV: /^LV\d{11}$/,
  MT: /^MT\d{8}$/,
  NL: /^NL\d{9}B\d{2}$/,
  PL: /^PL\d{10}$/,
  PT: /^PT\d{9}$/,
  RO: /^RO\d{2,10}$/,
  SE: /^SE\d{12}$/,
  SI: /^SI\d{8}$/,
  SK: /^SK\d{10}$/,
};

export function normalizeVatId(
  raw: string,
): { countryCode: string; number: string; id: string } | null {
  const compact = raw.replace(/[\s.-]/g, "").toUpperCase();
  if (compact.length < 4) return null;
  const countryCode = compact.slice(0, 2) === "GR" ? "EL" : compact.slice(0, 2);
  const storedCountry = compact.slice(0, 2) === "GR" ? "EL" : compact.slice(0, 2);
  const id = `${storedCountry}${compact.slice(2)}`;
  const pattern = VAT_ID_PATTERNS[countryCode];
  if (!pattern || !pattern.test(id)) return null;
  return { countryCode, number: id.slice(2), id };
}

export type WithdrawalDecision =
  | { open: true }
  | { open: false; reason: "waived" | "already" | "closed" | "expired" };

export function withdrawalDecision(
  order: {
    status?: unknown;
    items?: unknown;
    digitalWaiverAt?: unknown;
    withdrawalAt?: unknown;
    withdrawalInfoProvided?: unknown;
    deliveredAt?: unknown;
    updatedAt?: unknown;
    createdAt?: unknown;
  },
  now = Date.now(),
): WithdrawalDecision {
  if (order.withdrawalAt) return { open: false, reason: "already" };
  const status = String(order.status || "");
  if (status === "cancelled" || status === "refunded") return { open: false, reason: "closed" };

  const items = Array.isArray(order.items) ? order.items : [];
  const allDigital =
    items.length > 0 &&
    items.every((row) =>
      Boolean(row && typeof row === "object" && (row as { downloadable?: unknown }).downloadable),
    );
  if (allDigital && order.digitalWaiverAt) return { open: false, reason: "waived" };

  const deliveredRaw =
    order.deliveredAt || (status === "delivered" ? order.updatedAt || order.createdAt : null);
  if (!deliveredRaw) return { open: true };
  const delivered = new Date(String(deliveredRaw)).getTime();
  if (!Number.isFinite(delivered)) return { open: true };

  const limit =
    order.withdrawalInfoProvided === true
      ? delivered + 14 * DAY_MS
      : addMonths(delivered, 12) + 14 * DAY_MS;
  return now <= limit ? { open: true } : { open: false, reason: "expired" };
}

function addMonths(timestamp: number, months: number): number {
  const date = new Date(timestamp);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.getTime();
}
