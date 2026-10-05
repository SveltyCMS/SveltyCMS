/**
 * @file src/plugins/commerce/vies.ts
 * @description EU VAT ID check. Reverse charge runs only after VIES confirms the ID.
 * A network failure keeps domestic VAT on the order.
 */

import { safeFetch } from "@utils/egress-guard";
import { logger } from "@utils/logger";
import { normalizeVatId } from "./vat";

export type VatCheck =
  | { status: "absent" }
  | { status: "invalid" }
  | { status: "valid"; id: string; countryCode: string }
  | { status: "unavailable"; id: string };

const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number";

export async function verifyEuVatId(raw: string, timeoutMs = 4000): Promise<VatCheck> {
  const parsed = normalizeVatId(raw);
  if (!parsed) {
    const compact = raw.replace(/[\s.-]/g, "");
    return compact ? { status: "invalid" } : { status: "absent" };
  }
  try {
    const result = await safeFetch(VIES_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ countryCode: parsed.countryCode, vatNumber: parsed.number }),
      timeoutMs,
    });
    if (!result.success || !result.body) return { status: "unavailable", id: parsed.id };
    const body = JSON.parse(result.body) as { valid?: boolean };
    if (body.valid === true)
      return { status: "valid", id: parsed.id, countryCode: parsed.countryCode };
    if (body.valid === false) return { status: "invalid" };
    return { status: "unavailable", id: parsed.id };
  } catch (err) {
    logger.warn("[Commerce] VIES check unavailable", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { status: "unavailable", id: parsed.id };
  }
}
