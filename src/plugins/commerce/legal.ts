/**
 * @file src/plugins/commerce/legal.ts
 * @description Trader identity shown before a consumer order (Impressum / CRD).
 */

import { raise } from "@utils/error-handling";

export interface CommerceLegal {
  storeLanguage: "de" | "en";
  pricesIncludeTax: boolean;
  homeCountry: string;
  currency: string;
  legalName: string;
  legalAddress: string;
  legalEmail: string;
  phone: string;
  vatId: string;
  taxNumber: string;
  registerCourt: string;
  registerNumber: string;
  representative: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readCommerceLegal(
  settings: Record<string, unknown> | null | undefined,
): CommerceLegal {
  const lang = text(settings?.storeLanguage).toLowerCase();
  return {
    storeLanguage: lang.startsWith("en") ? "en" : "de",
    pricesIncludeTax: settings?.pricesIncludeTax !== false,
    homeCountry: (text(settings?.homeCountry) || "DE").toUpperCase(),
    currency: (text(settings?.currency) || "EUR").toUpperCase(),
    legalName: text(settings?.legalName),
    legalAddress: text(settings?.legalAddress),
    legalEmail: text(settings?.legalEmail),
    phone: text(settings?.phone),
    vatId: text(settings?.vatId),
    taxNumber: text(settings?.taxNumber),
    registerCourt: text(settings?.registerCourt),
    registerNumber: text(settings?.registerNumber),
    representative: text(settings?.representative),
  };
}

export function traderIdentityReady(legal: CommerceLegal): boolean {
  return Boolean(
    legal.legalName &&
    legal.legalAddress &&
    legal.legalEmail.includes("@") &&
    legal.phone &&
    (legal.vatId || legal.taxNumber),
  );
}

/** A consumer order needs a reachable trader and a tax number or VAT ID. */
export function assertTraderIdentity(legal: CommerceLegal): void {
  if (!legal.legalName || !legal.legalAddress || !legal.legalEmail || !legal.phone) {
    raise(
      409,
      "Set the trader name, address, email, and phone in the Commerce plugin before checkout.",
      "TRADER_IDENTITY",
    );
  }
  if (!legal.legalEmail.includes("@")) {
    raise(409, "The trader email in Commerce settings is not usable.", "TRADER_IDENTITY");
  }
  if (!legal.vatId && !legal.taxNumber) {
    raise(
      409,
      "Set a VAT ID or tax number in the Commerce plugin before checkout.",
      "TRADER_TAX_ID",
    );
  }
}
