/**
 * @file tests/unit/services/sitemap-builder.test.ts
 * @description Unit tests for the pure sitemap and robots.txt serializers.
 *
 * Covers XML escaping, W3C date conversion, locale discovery, per-entry
 * indexing controls (noindex / external canonical), site-starter URL mapping
 * with hreflang alternates, and robots.txt content.
 */

import { describe, expect, it } from "vitest";
import {
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  entryIsIndexable,
  entryLocales,
  escapeXml,
  publicEntryUrl,
  toW3CDateTime,
  type SitemapEntryInput,
} from "@src/services/content/seo/sitemap-builder";

const ORIGIN = "https://example.com";

describe("escapeXml", () => {
  it("escapes all XML-significant characters", () => {
    expect(escapeXml(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
  });
});

describe("toW3CDateTime", () => {
  it("passes valid ISO strings through and drops invalid values", () => {
    expect(toW3CDateTime("2026-10-08")).toBe("2026-10-08");
    expect(toW3CDateTime("2026-10-08T12:00:00.000Z")).toBe("2026-10-08T12:00:00.000Z");
    expect(toW3CDateTime("not a date")).toBeNull();
    expect(toW3CDateTime(undefined)).toBeNull();
    expect(toW3CDateTime(null)).toBeNull();
  });

  it("normalizes Date objects and numeric timestamps", () => {
    const date = new Date("2026-10-08T12:00:00.000Z");
    expect(toW3CDateTime(date)).toBe("2026-10-08T12:00:00.000Z");
    expect(toW3CDateTime(date.getTime())).toBe("2026-10-08T12:00:00.000Z");
    expect(toW3CDateTime(new Date("invalid"))).toBeNull();
    expect(toW3CDateTime(Number.NaN)).toBeNull();
  });
});

describe("entryLocales", () => {
  it("collects locales from SEO data, translations metadata and translated fields", () => {
    const entry: SitemapEntryInput = {
      collection: "pages",
      slug: "home",
      seo: { en: { title: "T" }, de: { title: "T" } },
      translations: [
        { languageTag: "fr", translationName: "Français" },
        { languageTag: "de", translationName: "Deutsch" },
      ],
      title: { en: "Home", "pt-BR": "Início" },
    };
    expect(entryLocales(entry)).toEqual(["de", "en", "fr", "pt-BR"]);
  });

  it("ignores non-locale record keys", () => {
    const entry: SitemapEntryInput = {
      collection: "pages",
      slug: "home",
      seo: { title: "Flat", description: "No locales here" },
      content: { blocks: ["a", "b"] },
    };
    expect(entryLocales(entry)).toEqual([]);
  });
});

describe("entryIsIndexable", () => {
  it("skips entries with noindex or none robots directives", () => {
    const noindex: SitemapEntryInput = {
      collection: "pages",
      slug: "hidden",
      seo: { en: { robotsMeta: "noindex, nofollow" } },
    };
    expect(entryIsIndexable(noindex, ORIGIN, "en")).toBe(false);

    const none: SitemapEntryInput = {
      collection: "pages",
      slug: "hidden2",
      seo: { en: { robotsMeta: "none" } },
    };
    expect(entryIsIndexable(none, ORIGIN, "en")).toBe(false);
  });

  it("keeps indexable entries and entries without SEO data", () => {
    expect(entryIsIndexable({ collection: "pages", slug: "about" }, ORIGIN, "en")).toBe(true);
    expect(
      entryIsIndexable(
        { collection: "pages", slug: "about", seo: { en: { robotsMeta: "index, follow" } } },
        ORIGIN,
        "en",
      ),
    ).toBe(true);
  });

  it("treats an external canonical URL as a duplicate and skips the entry", () => {
    const duplicate: SitemapEntryInput = {
      collection: "pages",
      slug: "copy",
      seo: { en: { canonicalUrl: "https://other-site.com/original" } },
    };
    expect(entryIsIndexable(duplicate, ORIGIN, "en")).toBe(false);
  });

  it("keeps same-origin canonical URLs", () => {
    const sameOrigin: SitemapEntryInput = {
      collection: "pages",
      slug: "canonical-target",
      seo: { en: { canonicalUrl: "https://example.com/other-page" } },
    };
    expect(entryIsIndexable(sameOrigin, ORIGIN, "en")).toBe(true);
  });
});

describe("buildSitemapXml", () => {
  const baseEntry: SitemapEntryInput = {
    collection: "pages",
    slug: "about",
    updatedAt: "2026-10-08T12:00:00.000Z",
  };

  it("maps pages entries to site-starter routes with hreflang alternates", () => {
    const entry: SitemapEntryInput = {
      ...baseEntry,
      seo: { en: { title: "T" }, de: { title: "T" } },
    };
    const xml = buildSitemapXml({
      origin: ORIGIN,
      entries: [entry],
      defaultLang: "en",
      siteStarterEnabled: true,
    });
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="de" href="https://example.com/about?lang=de" />',
    );
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://example.com/about" />',
    );
    expect(xml).toContain("<priority>0.8</priority>");
  });

  it("maps the home slug to the root with top priority", () => {
    const xml = buildSitemapXml({
      origin: ORIGIN,
      entries: [{ collection: "pages", slug: "home" }],
      defaultLang: "en",
      siteStarterEnabled: true,
    });
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<priority>1.0</priority>");
  });

  it("uses the generic collection/slug pattern when the site starter is disabled", () => {
    const xml = buildSitemapXml({
      origin: ORIGIN,
      entries: [{ collection: "posts", slug: "hello-world" }],
      defaultLang: "en",
      siteStarterEnabled: false,
    });
    expect(xml).toContain("<loc>https://example.com/posts/hello-world</loc>");
    expect(xml).not.toContain("hreflang");
  });

  it("omits noindex entries and entries without a slug", () => {
    const xml = buildSitemapXml({
      origin: ORIGIN,
      entries: [
        { collection: "pages", slug: "visible" },
        { collection: "pages", slug: "hidden", seo: { en: { robotsMeta: "noindex" } } },
        { collection: "pages", slug: "" },
      ],
      defaultLang: "en",
      siteStarterEnabled: true,
    });
    expect(xml).toContain("visible");
    expect(xml).not.toContain("hidden");
    expect(xml.match(/<url>/g)).toHaveLength(1);
  });

  it("omits lastmod when the timestamp is missing or invalid", () => {
    const xml = buildSitemapXml({
      origin: ORIGIN,
      entries: [{ collection: "pages", slug: "about", updatedAt: "garbage" }],
      defaultLang: "en",
      siteStarterEnabled: true,
    });
    expect(xml).not.toContain("<lastmod>");
  });

  it("escapes slugs and locale tags in URLs", () => {
    const xml = buildSitemapXml({
      origin: ORIGIN,
      entries: [
        {
          collection: "pages",
          slug: "a&b/c<d>",
          seo: { en: { title: "T" }, "pt-BR": { title: "T" } },
        },
      ],
      defaultLang: "en",
      siteStarterEnabled: true,
    });
    expect(xml).toContain("<loc>https://example.com/a%26b/c%3Cd%3E</loc>");
    expect(xml).toContain('hreflang="pt-BR"');
  });
});

describe("buildRobotsTxt", () => {
  it("advertises the sitemap and disallows the admin/auth/system routes", () => {
    const txt = buildRobotsTxt("https://example.com/sitemap.xml");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Disallow: /api/");
    expect(txt).toContain("Disallow: /login");
    expect(txt).toContain("Disallow: /setup");
    expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(txt).not.toContain("GPTBot");
  });

  it("block-training disallows training crawlers but keeps search surfaces", () => {
    const txt = buildRobotsTxt("https://example.com/sitemap.xml", "block-training");
    expect(txt).toContain("User-agent: GPTBot");
    expect(txt).toContain("User-agent: Google-Extended");
    expect(txt).toContain("User-agent: ClaudeBot");
    expect(txt).not.toContain("OAI-SearchBot");
    // Specific crawler groups are emitted before the global group.
    expect(txt.indexOf("User-agent: GPTBot")).toBeLessThan(txt.indexOf("User-agent: *"));
  });

  it("block-all additionally disallows search-surface AI crawlers", () => {
    const txt = buildRobotsTxt("https://example.com/sitemap.xml", "block-all");
    expect(txt).toContain("User-agent: OAI-SearchBot");
    expect(txt).toContain("User-agent: PerplexityBot");
    expect(txt).toContain("User-agent: GPTBot");
  });
});

describe("publicEntryUrl", () => {
  it("maps pages entries to site-starter routes", () => {
    expect(
      publicEntryUrl({
        origin: "https://example.com",
        collection: "pages",
        slug: "about",
        siteStarterEnabled: true,
      }),
    ).toBe("https://example.com/about");
    expect(
      publicEntryUrl({
        origin: "https://example.com",
        collection: "pages",
        slug: "home",
        siteStarterEnabled: true,
      }),
    ).toBe("https://example.com/");
  });

  it("falls back to the generic collection/slug pattern for headless collections", () => {
    expect(
      publicEntryUrl({
        origin: "https://example.com",
        collection: "posts",
        slug: "hello world",
        siteStarterEnabled: false,
      }),
    ).toBe("https://example.com/posts/hello%20world");
  });

  it("returns an empty string for empty slugs", () => {
    expect(publicEntryUrl({ origin: "https://example.com", collection: "pages", slug: "" })).toBe(
      "",
    );
    expect(publicEntryUrl({ origin: "https://example.com", collection: "pages", slug: "/" })).toBe(
      "",
    );
  });
});

describe("buildLlmsTxt", () => {
  it("builds an llmstxt.org-style document with sections and links", () => {
    const txt = buildLlmsTxt({
      siteName: "ACME",
      description: "A high-performance headless CMS.",
      sections: [
        {
          heading: "Pages",
          links: [
            { title: "Home", url: "https://example.com/", description: "Landing page" },
            { title: "About", url: "https://example.com/about" },
          ],
        },
      ],
    });
    expect(txt).toBe(
      [
        "# ACME",
        "",
        "> A high-performance headless CMS.",
        "",
        "## Pages",
        "",
        "- [Home](https://example.com/): Landing page",
        "- [About](https://example.com/about)",
        "",
      ].join("\n"),
    );
  });

  it("sanitizes newlines and link brackets so authored titles cannot inject structure", () => {
    const txt = buildLlmsTxt({
      siteName: "ACME",
      sections: [
        {
          heading: "Pages",
          links: [
            { title: "Evil ](https://evil.example)\n## Injected", url: "https://example.com/ok" },
          ],
        },
      ],
    });
    // The exact link-breakout pattern must never appear as markdown syntax,
    // and the header injection must never land on its own line.
    expect(txt).not.toContain("](https://evil.example)");
    expect(txt).not.toContain("\n## Injected");
    expect(txt).toContain("- [Evil (https://evil.example) ## Injected](https://example.com/ok)");
  });

  it("skips empty sections", () => {
    const txt = buildLlmsTxt({
      siteName: "ACME",
      sections: [{ heading: "Empty", links: [] }],
    });
    expect(txt).toBe("# ACME\n");
  });
});
