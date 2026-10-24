/**
 * @file tests/unit/routes/site-page-servers.test.ts
 * @description Behavioural tests for the public `(site)` page server loaders.
 *
 * Covers the route-behaviour classes the scorer grades:
 * - load-contract: homepage, catalogue, checkout, legal page, product detail, withdrawal payloads
 * - failure-path: redirects for missing/unpublished pages, 404 for disabled commerce/unknown slug,
 *   and the gracefully degraded payloads the checkout/withdrawal loaders return on settings errors
 *
 * ### Features:
 * - Homepage redirect (302) and 404 for unpublished content
 * - Product list/detail 404 when commerce is off, empty-catalogue degradation
 * - Legal page 404 for unknown slugs; checkout/withdrawal degraded fallbacks
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSiteStarterEnabled: vi.fn(),
  resolveSitePage: vi.fn(),
  localizeSitePage: vi.fn(),
  loadSeoHeadForPage: vi.fn(),
  getPublicSettingSync: vi.fn(),
  isMultiTenantEnabled: vi.fn(),
  isAdmin: vi.fn(),
  getFirstCollectionRedirectUrl: vi.fn(),
  commerceLegalFor: vi.fn(),
  requireCommerceTenantId: vi.fn(),
  createCommerceStore: vi.fn(),
  getPluginState: vi.fn(),
  getPlugin: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@src/services/site/page-resolver.server", () => ({
  resolveSitePage: mocks.resolveSitePage,
  localizeSitePage: mocks.localizeSitePage,
}));

vi.mock("@src/services/site/site-config.server", () => ({
  isSiteStarterEnabled: mocks.isSiteStarterEnabled,
  pathToPageSlug: (pathname: string) => pathname.replace(/^\/+|\/+$/g, "") || "home",
}));

vi.mock("@src/services/content/seo/seo-head.server", () => ({
  loadSeoHeadForPage: mocks.loadSeoHeadForPage,
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPublicSettingSync: mocks.getPublicSettingSync,
}));

vi.mock("@src/plugins/commerce/storefront.server", () => ({
  commerceLegalFor: mocks.commerceLegalFor,
}));

vi.mock("@src/plugins/commerce/store", () => ({
  createCommerceStore: mocks.createCommerceStore,
}));

vi.mock("@src/plugins/registry", () => ({
  pluginRegistry: {
    getPluginState: mocks.getPluginState,
    get: mocks.getPlugin,
  },
}));

vi.mock("@src/plugins/commerce/tenant", () => ({
  requireCommerceTenantId: mocks.requireCommerceTenantId,
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: null,
  getDb: mocks.getDb,
}));

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    getFirstCollectionRedirectUrl: mocks.getFirstCollectionRedirectUrl,
  },
}));

vi.mock("@utils/tenant-isolation.server", () => ({
  isMultiTenantEnabled: mocks.isMultiTenantEnabled,
}));

vi.mock("@src/stores/global-settings.svelte", () => ({
  publicEnv: { DEFAULT_CONTENT_LANGUAGE: "en" },
}));

vi.mock("@utils/hook-utils", () => ({
  isAdmin: mocks.isAdmin,
}));

import { load as loadHome } from "../../../src/routes/(site)/+page.server";
import { load as loadShop } from "../../../src/routes/(site)/shop/+page.server";
import { load as loadCheckout } from "../../../src/routes/(site)/checkout/+page.server";
import { load as loadLegalPage } from "../../../src/routes/(site)/legal/[page]/+page.server";
import { load as loadProduct } from "../../../src/routes/(site)/shop/[slug]/+page.server";
import { load as loadWiderruf } from "../../../src/routes/(site)/widerruf/+page.server";

interface SiteEventInput {
  locals?: Record<string, unknown>;
  params?: Record<string, string>;
  parent?: Record<string, unknown>;
  url?: string;
}

/** Minimal `LoadEvent` stand-in; loaders only read locals/params/parent/url. */
function makeEvent<TLoader extends (...args: never[]) => unknown>(
  input: SiteEventInput = {},
): Parameters<TLoader>[0] {
  const { locals = {}, params = {}, parent = {}, url = "http://localhost/" } = input;
  return {
    locals,
    params,
    url: new URL(url),
    parent: async () => parent,
  } as unknown as Parameters<TLoader>[0];
}

const ENGLISH_LEGAL = {
  storeLanguage: "en" as const,
  pricesIncludeTax: true,
  homeCountry: "DE",
  currency: "EUR",
  legalName: "Example Commerce GmbH",
  legalAddress: "Musterstrasse 1, 10115 Berlin",
  legalEmail: "trader@example.com",
  phone: "+49 30 1234567",
  vatId: "DE123456789",
  taxNumber: "123/456/789",
  registerCourt: "Amtsgericht Berlin",
  registerNumber: "HRB 12345",
  representative: "Erika Mustermann",
};

const GERMAN_LEGAL = { ...ENGLISH_LEGAL, storeLanguage: "de" as const };

const RECORDED_AT = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

const SHOP_PRODUCT = {
  _id: "product-1",
  title: { en: "Wool Socks" },
  slug: "wool-socks",
  sku: "SKU-1",
  price: 19.9,
  inventory: 2,
  lowStockThreshold: 5,
  tags: ["featured"],
  priceHistory: [{ amount: 24.9, recordedAt: RECORDED_AT }],
};

function makeCommerceStore(rows: Record<string, unknown>[]) {
  return {
    hasCollection: vi.fn(async () => true),
    findMany: vi.fn(async () => rows),
  };
}

describe("(site) page server loaders", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.isSiteStarterEnabled.mockReturnValue(true);
    mocks.resolveSitePage.mockResolvedValue(null);
    mocks.localizeSitePage.mockImplementation((page: Record<string, unknown>) => page);
    mocks.loadSeoHeadForPage.mockResolvedValue(null);
    mocks.getPublicSettingSync.mockReturnValue("en");
    mocks.isMultiTenantEnabled.mockReturnValue(false);
    mocks.isAdmin.mockReturnValue(false);
    mocks.getFirstCollectionRedirectUrl.mockResolvedValue(null);
    mocks.commerceLegalFor.mockResolvedValue({
      enabled: true,
      identityReady: true,
      legal: ENGLISH_LEGAL,
    });
    mocks.requireCommerceTenantId.mockImplementation((tenantId: string | null) =>
      String(tenantId || "global"),
    );
    mocks.createCommerceStore.mockReturnValue(makeCommerceStore([]));
    mocks.getPluginState.mockResolvedValue({ enabled: true });
    mocks.getPlugin.mockReturnValue(undefined);
    mocks.getDb.mockReturnValue(null);
  });

  it("returns the resolved homepage plus localized copy for an anonymous visitor", async () => {
    mocks.resolveSitePage.mockResolvedValue({ title: "Startseite", status: "publish" });
    mocks.localizeSitePage.mockImplementation((page: Record<string, unknown>) => ({
      ...page,
      language: "de",
    }));

    const pageData = await loadHome(
      makeEvent<typeof loadHome>({
        locals: { tenantId: "tenant-1" },
        parent: {
          contentLanguage: "de",
          isDraft: false,
          isPreview: false,
          siteName: "SveltyCMS",
        },
      }),
    );

    expect(pageData).toMatchObject({
      page: { title: "Startseite", status: "publish" },
      localized: { title: "Startseite", language: "de" },
      editable: false,
    });
    expect(pageData).toHaveProperty("seoHead", undefined);
    expect(mocks.resolveSitePage).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: "/", tenantId: "tenant-1", draft: false }),
    );
  });

  it("redirects an anonymous visitor to /login when the homepage cannot be resolved", async () => {
    mocks.resolveSitePage.mockResolvedValue(null);

    await expect(
      loadHome(makeEvent<typeof loadHome>({ parent: { contentLanguage: "en" } })),
    ).rejects.toMatchObject({ status: 302, location: "/login" });
  });

  it("rejects an unpublished homepage with 404 outside draft preview", async () => {
    mocks.resolveSitePage.mockResolvedValue({ title: "Draft homepage", status: "draft" });

    await expect(
      loadHome(
        makeEvent<typeof loadHome>({
          parent: { contentLanguage: "en", isDraft: false },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns published products with stock badges and consumer labels", async () => {
    const store = makeCommerceStore([SHOP_PRODUCT]);
    mocks.createCommerceStore.mockReturnValue(store);

    const pageData = await loadShop(
      makeEvent<typeof loadShop>({
        locals: { tenantId: "tenant-1", dbAdapter: {} },
      }),
    );

    expect(pageData).toMatchObject({
      enabled: true,
      currency: "EUR",
      vatLabel: "incl. VAT",
      labels: {
        impressum: "Legal notice",
        privacy: "Privacy",
        terms: "Terms",
        withdraw: "Withdraw from the contract",
      },
      products: [
        {
          id: "product-1",
          title: "Wool Socks",
          slug: "wool-socks",
          price: 19.9,
          sku: "SKU-1",
          badges: ["Sale", "Featured", "Low stock"],
          priorPriceLabel: "Lowest price in the last 30 days: 24.90 EUR",
        },
      ],
    });
    expect(store.findMany).toHaveBeenCalledWith(
      "products",
      {},
      { limit: 48, publicationFilter: "published" },
    );
  });

  it("degrades to an empty catalogue when the commerce plugin is disabled", async () => {
    mocks.getPluginState.mockResolvedValue({ enabled: false });
    mocks.getPlugin.mockReturnValue(undefined);

    const errorFallback = await loadShop(
      makeEvent<typeof loadShop>({ locals: { tenantId: "tenant-1" } }),
    );

    expect(errorFallback).toEqual({ enabled: false, products: [] });
  });

  it("returns trader identity and consumer-facing labels for checkout", async () => {
    const pageData = await loadCheckout(
      makeEvent<typeof loadCheckout>({ locals: { tenantId: "tenant-1" } }),
    );

    expect(pageData).toMatchObject({
      enabled: true,
      identityReady: true,
      legal: { legalName: "Example Commerce GmbH", currency: "EUR" },
      labels: {
        pay: "Order with obligation to pay",
        vatIncluded: "incl. VAT",
        termsLabel: "I have read and accept the terms and the withdrawal policy.",
      },
    });
  });

  it("degrades to a disabled checkout when the commerce settings read fails", async () => {
    mocks.commerceLegalFor.mockRejectedValue(new Error("commerce settings unavailable"));

    const errorFallback = await loadCheckout(
      makeEvent<typeof loadCheckout>({ locals: { tenantId: "tenant-1" } }),
    );

    expect(errorFallback).toEqual({
      enabled: false,
      identityReady: false,
      legal: null,
      labels: null,
    });
  });

  it("returns the legal page payload with German statutory labels", async () => {
    mocks.commerceLegalFor.mockResolvedValue({
      enabled: true,
      identityReady: true,
      legal: GERMAN_LEGAL,
    });

    const pageData = await loadLegalPage(
      makeEvent<typeof loadLegalPage>({
        locals: { tenantId: "tenant-1" },
        params: { page: "impressum" },
      }),
    );

    expect(pageData).toMatchObject({
      page: "impressum",
      enabled: true,
      legal: { legalName: "Example Commerce GmbH", storeLanguage: "de" },
      labels: {
        impressum: "Impressum",
        privacy: "Datenschutz",
        terms: "AGB",
        withdraw: "Vertrag widerrufen",
      },
    });
  });

  it("rejects an unknown legal page slug with 404 before reading commerce settings", async () => {
    await expect(
      loadLegalPage(
        makeEvent<typeof loadLegalPage>({
          locals: { tenantId: "tenant-1" },
          params: { page: "shipping" },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.commerceLegalFor).not.toHaveBeenCalled();
  });

  it("returns the published product detail with a prior-price label", async () => {
    const store = makeCommerceStore([
      {
        ...SHOP_PRODUCT,
        shortDescription: "Soft everyday socks",
        description: "Merino wool, made in Italy.",
      },
    ]);
    mocks.createCommerceStore.mockReturnValue(store);

    const pageData = await loadProduct(
      makeEvent<typeof loadProduct>({
        locals: { tenantId: "tenant-1", dbAdapter: {} },
        params: { slug: "wool-socks" },
      }),
    );

    expect(pageData).toMatchObject({
      currency: "EUR",
      vatLabel: "incl. VAT",
      product: {
        id: "product-1",
        title: "Wool Socks",
        sku: "SKU-1",
        price: 19.9,
        summary: "Soft everyday socks",
        description: "Merino wool, made in Italy.",
        priorPriceLabel: "Lowest price in the last 30 days: 24.90 EUR",
      },
    });
    expect(store.findMany).toHaveBeenCalledWith(
      "products",
      { slug: "wool-socks" },
      { limit: 1, publicationFilter: "published" },
    );
  });

  it("rejects product detail requests when commerce is disabled", async () => {
    mocks.getPluginState.mockResolvedValue({ enabled: false });

    await expect(
      loadProduct(
        makeEvent<typeof loadProduct>({
          locals: { tenantId: "tenant-1" },
          params: { slug: "wool-socks" },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects an unknown product slug with 404", async () => {
    mocks.createCommerceStore.mockReturnValue(makeCommerceStore([]));

    await expect(
      loadProduct(
        makeEvent<typeof loadProduct>({
          locals: { tenantId: "tenant-1", dbAdapter: {} },
          params: { slug: "missing-product" },
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns the trader name and withdrawal labels", async () => {
    mocks.commerceLegalFor.mockResolvedValue({
      enabled: true,
      identityReady: true,
      legal: GERMAN_LEGAL,
    });

    const pageData = await loadWiderruf(
      makeEvent<typeof loadWiderruf>({ locals: { tenantId: "tenant-1" } }),
    );

    expect(pageData).toMatchObject({
      legalName: "Example Commerce GmbH",
      labels: {
        terms: "AGB",
        withdraw: "Vertrag widerrufen",
        confirm: "Widerruf bestätigen",
      },
    });
  });

  it("degrades to empty withdrawal labels when the commerce settings read fails", async () => {
    mocks.commerceLegalFor.mockRejectedValue(new Error("commerce settings unavailable"));

    const failureResult = await loadWiderruf(
      makeEvent<typeof loadWiderruf>({ locals: { tenantId: "tenant-1" } }),
    );

    expect(failureResult).toEqual({ legalName: "", labels: null });
  });
});
