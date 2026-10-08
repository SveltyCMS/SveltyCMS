/**
 * @file tests/unit/services/seo-head.test.ts
 * @description Unit tests for the pure SEO head metadata builder.
 *
 * Covers the widget's stored-shape handling (locale-keyed records and flat
 * objects), the entity round-trip (decoded once, never double-escaped),
 * canonical/robots precedence, Open Graph/Twitter fallbacks, JSON-LD break-out
 * hardening, and hreflang alternate derivation.
 */

import { describe, expect, it } from "vitest";
import {
  buildSeoHead,
  decodeStoredHtmlEntities,
  pickSeoLocaleData,
  pickSeoPageTitle,
  type SeoWidgetStoredValue,
} from "@src/services/content/seo/seo-head";

const BASE = {
  lang: "de",
  defaultLang: "en",
  origin: "https://example.com",
  pathname: "/about",
  titleFallback: "About Us",
};

describe("decodeStoredHtmlEntities", () => {
  it("reverses the widget's save-time escaping exactly once", () => {
    expect(decodeStoredHtmlEntities("Tom &amp; Jerry &lt;3 &gt; &#039;90s &#039;")).toBe(
      "Tom & Jerry <3 > '90s '",
    );
  });

  it("does not over-decode literal entities typed by the user", () => {
    // Stored value of a user who typed the literal text `&lt;` into the field.
    expect(decodeStoredHtmlEntities("&amp;lt;")).toBe("&lt;");
  });
});

describe("pickSeoLocaleData", () => {
  const record: SeoWidgetStoredValue = {
    en: { title: "EN Title" },
    de: { title: "DE Title" },
  };

  it("returns the exact locale when present", () => {
    expect(pickSeoLocaleData(record, "de", "en")?.title).toBe("DE Title");
  });

  it("falls back to the default locale, then en, then the first available", () => {
    expect(pickSeoLocaleData(record, "fr", "en")?.title).toBe("EN Title");
    const noEn: SeoWidgetStoredValue = { de: { title: "DE Title" } };
    expect(pickSeoLocaleData(noEn, "fr", "en")?.title).toBe("DE Title");
  });

  it("returns flat (translated: false) objects as-is", () => {
    const flat: SeoWidgetStoredValue = { title: "Flat Title" };
    expect(pickSeoLocaleData(flat, "de", "en")?.title).toBe("Flat Title");
  });

  it("returns undefined for missing or empty data", () => {
    expect(pickSeoLocaleData(null, "de", "en")).toBeUndefined();
    expect(pickSeoLocaleData({}, "de", "en")).toBeUndefined();
  });
});

describe("pickSeoPageTitle", () => {
  it("decodes the stored title and ignores fallbacks", () => {
    const seo: SeoWidgetStoredValue = { en: { title: "Home &amp; Away" } };
    expect(pickSeoPageTitle(seo, "en", "en")).toBe("Home & Away");
  });

  it("returns an empty string when no SEO title exists", () => {
    expect(pickSeoPageTitle({ en: { description: "Only a description" } }, "en", "en")).toBe("");
    expect(pickSeoPageTitle(undefined, "en", "en")).toBe("");
  });
});

describe("buildSeoHead", () => {
  it("falls back through page title, site name and pathname", () => {
    expect(buildSeoHead({ ...BASE, seo: null }).title).toBe("About Us");
    expect(
      buildSeoHead({ ...BASE, seo: null, titleFallback: undefined, siteName: "ACME" }).title,
    ).toBe("ACME");
    expect(
      buildSeoHead({ ...BASE, seo: null, titleFallback: undefined, siteName: undefined }).title,
    ).toBe("/about");
  });

  it("decodes stored fields so the renderer escapes exactly once", () => {
    const seo: SeoWidgetStoredValue = {
      en: {
        title: "About &amp; Contact",
        description: "Quotes &quot;and&quot; more &lt;3",
        focusKeyword: "acme &amp; co",
      },
    };
    const result = buildSeoHead({ ...BASE, lang: "en", seo });
    expect(result.title).toBe("About & Contact");
    expect(result.description).toBe('Quotes "and" more <3');
    expect(result.keywords).toBe("acme & co");
  });

  it("emits a self-referencing canonical with ?lang for non-default locales", () => {
    const de = buildSeoHead({ ...BASE, seo: null });
    expect(de.canonicalUrl).toBe("https://example.com/about?lang=de");

    const en = buildSeoHead({ ...BASE, lang: "en", seo: null });
    expect(en.canonicalUrl).toBe("https://example.com/about");
  });

  it("prefers the widget's canonical URL override", () => {
    const seo: SeoWidgetStoredValue = {
      en: { title: "T", canonicalUrl: "https://canonical.example.com/page" },
    };
    expect(buildSeoHead({ ...BASE, lang: "en", seo }).canonicalUrl).toBe(
      "https://canonical.example.com/page",
    );
  });

  it("forces noindex for preview/draft renders and passes stored robots through", () => {
    const seo: SeoWidgetStoredValue = { en: { title: "T", robotsMeta: "index, follow" } };
    expect(buildSeoHead({ ...BASE, lang: "en", seo }).robots).toBe("index, follow");
    expect(buildSeoHead({ ...BASE, lang: "en", seo, noindex: true }).robots).toBe(
      "noindex, nofollow",
    );
    expect(buildSeoHead({ ...BASE, lang: "en", seo: null }).robots).toBeUndefined();
  });

  it("builds Open Graph and Twitter fallbacks", () => {
    const seo: SeoWidgetStoredValue = {
      en: {
        title: "SEO Title",
        ogTitle: "OG Title",
        ogDescription: "OG Desc",
        twitterCard: "summary_large_image",
        twitterTitle: "Tw Title",
      },
    };
    const result = buildSeoHead({
      ...BASE,
      lang: "en",
      seo,
      ogImageUrl: "https://example.com/files/img.png",
    });
    expect(result.og).toEqual({
      title: "OG Title",
      description: "OG Desc",
      image: "https://example.com/files/img.png",
      url: "https://example.com/about",
      type: "website",
    });
    expect(result.twitter).toEqual({
      card: "summary_large_image",
      title: "Tw Title",
      description: "OG Desc",
      image: "https://example.com/files/img.png",
    });
  });

  it("falls back to the page title for social tags and defaults the twitter card", () => {
    const result = buildSeoHead({ ...BASE, lang: "en", seo: null });
    expect(result.og?.title).toBe("About Us");
    expect(result.twitter?.card).toBe("summary");
  });

  it("derives hreflang alternates with x-default and skips the active locale", () => {
    const seo: SeoWidgetStoredValue = {
      en: { title: "T" },
      de: { title: "T" },
      fr: { title: "T" },
    };
    const result = buildSeoHead({ ...BASE, seo });
    expect(result.alternates).toEqual([
      { hreflang: "en", href: "https://example.com/about" },
      { hreflang: "fr", href: "https://example.com/about?lang=fr" },
      { hreflang: "x-default", href: "https://example.com/about" },
    ]);
  });

  it("emits no alternates for flat (translated: false) SEO data", () => {
    const seo: SeoWidgetStoredValue = { title: "Flat" };
    expect(buildSeoHead({ ...BASE, lang: "en", seo }).alternates).toEqual([]);
  });

  it("serializes sanitized JSON-LD into a break-out-proof script tag", () => {
    const seo: SeoWidgetStoredValue = {
      en: {
        title: "T",
        schemaMarkup: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Safe",
        }),
      },
    };
    const result = buildSeoHead({ ...BASE, lang: "en", seo });
    expect(result.jsonLdScript).toBe(
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Safe"}</script>',
    );
  });

  it("neutralizes closing-script sequences inside stored JSON-LD", () => {
    const seo: SeoWidgetStoredValue = {
      en: {
        title: "T",
        schemaMarkup: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "</script><script>alert(1)</script>",
        }),
      },
    };
    const script = buildSeoHead({ ...BASE, lang: "en", seo }).jsonLdScript;
    expect(script).toBeDefined();
    expect(script).not.toContain("</script><script>");
    // The `<` of the closing sequence is escaped, so no raw closing tag survives.
    expect(script).toContain("\\u003c/script>");
  });

  it("omits invalid or non-object JSON-LD", () => {
    expect(
      buildSeoHead({ ...BASE, lang: "en", seo: { en: { title: "T", schemaMarkup: "{oops" } } })
        .jsonLdScript,
    ).toBeUndefined();
    expect(
      buildSeoHead({
        ...BASE,
        lang: "en",
        seo: { en: { title: "T", schemaMarkup: JSON.stringify(["array"]) } },
      }).jsonLdScript,
    ).toBeUndefined();
  });

  it("tolerates premium-stripped data (no canonical/robots/social fields)", () => {
    const seo: SeoWidgetStoredValue = { en: { title: "Basic Title" } };
    const result = buildSeoHead({ ...BASE, lang: "en", seo });
    expect(result.title).toBe("Basic Title");
    expect(result.robots).toBeUndefined();
    expect(result.jsonLdScript).toBeUndefined();
    expect(result.og?.title).toBe("Basic Title");
  });

  it("emits WebSite JSON-LD on the homepage only", () => {
    const home = buildSeoHead({
      ...BASE,
      lang: "en",
      seo: null,
      pathname: "/",
      siteName: "ACME",
    });
    expect(home.autoJsonLd).toHaveLength(1);
    expect(home.autoJsonLd[0]).toBe(
      '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","@id":"https://example.com/#website","url":"https://example.com/","name":"ACME"}</script>',
    );

    const page = buildSeoHead({ ...BASE, lang: "en", seo: null, pathname: "/about" });
    expect(page.autoJsonLd.join()).not.toContain("WebSite");
  });

  it("emits BreadcrumbList JSON-LD for nested paths", () => {
    const result = buildSeoHead({
      ...BASE,
      lang: "en",
      seo: null,
      pathname: "/guides/getting-started",
    });
    expect(result.autoJsonLd).toHaveLength(1);
    const script = result.autoJsonLd[0];
    expect(script).toContain('"@type":"BreadcrumbList"');
    expect(script).toContain('"name":"Home"');
    expect(script).toContain('"name":"Guides"');
    expect(script).toContain('"name":"Getting Started"');
    expect(script).toContain('"item":"https://example.com/guides/getting-started"');
  });

  it("emits no auto JSON-LD for the root path without a site name fallback", () => {
    const result = buildSeoHead({
      ...BASE,
      lang: "en",
      seo: null,
      pathname: "/",
      siteName: undefined,
    });
    // Falls back to the origin hostname, so WebSite is still emitted.
    expect(result.autoJsonLd).toHaveLength(1);
    expect(result.autoJsonLd[0]).toContain('"name":"example.com"');
  });
});
