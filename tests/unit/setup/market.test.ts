/**
 * @file tests/unit/setup/market.test.ts
 * @description Unit tests for first-run country suggestions.
 */

import {
  dbConfigForHint,
  legalPageBody,
  marketFromForm,
  suggestMarket,
} from "@src/routes/setup/market";
import { describe, expect, it } from "vitest";

describe("suggestMarket", () => {
  it("fills a German shop from DE", () => {
    expect(suggestMarket("de", "en")).toMatchObject({
      currency: "EUR",
      pricesIncludeTax: true,
      storeLanguage: "de",
      taxRate: 19,
      reducedRate: 7,
      legalTitle: "Impressum",
      legalSlug: "impressum",
    });
  });

  it("fills a French shop in French legal wording and English store copy", () => {
    expect(suggestMarket("FR", "fr")).toMatchObject({
      currency: "EUR",
      storeLanguage: "en",
      taxRate: 20,
      reducedRate: 5.5,
      legalTitle: "Mentions légales",
      legalSlug: "mentions-legales",
    });
  });

  it("leaves tax empty for the United States and for a blank country", () => {
    expect(suggestMarket("US", "en")).toMatchObject({
      currency: "USD",
      pricesIncludeTax: false,
      storeLanguage: "en",
      taxRate: null,
      legalTitle: "Legal notice",
    });
    expect(suggestMarket("", "en").taxRate).toBeNull();
    expect(suggestMarket("", "de").storeLanguage).toBe("de");
  });

  it("keeps an edited rate and an English shop on a German country", () => {
    const market = marketFromForm({
      homeCountry: "de",
      currency: "eur",
      pricesIncludeTax: true,
      storeLanguage: "en",
      taxRate: "19",
      reducedRate: "",
      defaultContentLanguage: "de",
    });
    expect(market).toMatchObject({
      homeCountry: "DE",
      currency: "EUR",
      storeLanguage: "en",
      taxRate: 19,
      reducedRate: null,
      legalSlug: "impressum",
    });
  });
});

describe("legalPageBody", () => {
  it("adds a French line for France and stays English when no country is set", () => {
    expect(legalPageBody("Acme", "FR")).toContain("l'éditeur");
    expect(legalPageBody("Acme", "")).not.toContain("Ersetzen Sie");
  });
});

describe("dbConfigForHint", () => {
  it("maps the scaffold database flag onto wizard fields", () => {
    expect(dbConfigForHint("postgresql")).toEqual({
      type: "postgresql",
      host: "localhost",
      port: "5432",
      name: "sveltycms",
    });
    expect(dbConfigForHint("nope")).toBeNull();
  });
});
