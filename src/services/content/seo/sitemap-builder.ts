/**
 * @file src/services/content/seo/sitemap-builder.ts
 * @description Pure serializers for the dynamic XML sitemap and robots.txt.
 *
 * ### Features
 * - Respects per-entry indexing controls: entries whose SEO widget data says
 *   `noindex` (or `none`) are omitted, and entries with an external canonical
 *   URL are treated as duplicates and skipped
 * - Site-starter aware: `pages` entries map to the real public routes
 *   (`/slug`, homepage → `/`) with hreflang alternates via `?lang=`
 * - Locale discovery from translated fields (locale-keyed records) and the
 *   legacy `translations` metadata
 * - W3C-safe `lastmod` (validated ISO string, never `new Date(...)` on
 *   arbitrary data) and XML-escaped URLs
 * - robots.txt with explicit disallows for the admin/auth/system routes
 */

import { isISODateString } from "@utils/date";
import { decodeStoredHtmlEntities, pickSeoLocaleData, type SeoWidgetStoredValue } from "./seo-head";

/** Matches BCP-47-ish language tags (`en`, `de`, `pt-BR`, `zh-Hant`). */
const LOCALE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export interface SitemapEntryInput {
  collection: string;
  slug?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  seo?: unknown;
  translations?: unknown;
  [key: string]: unknown;
}

export interface BuildSitemapOptions {
  /** Absolute base (request origin), e.g. `https://example.com`. */
  origin: string;
  entries: SitemapEntryInput[];
  defaultLang: string;
  /** When true, `pages` entries map to the site-starter routes (`/slug`). */
  siteStarterEnabled?: boolean;
}

/** Escapes text for XML element and attribute content. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Converts a stored timestamp to a W3C date-time (or date) string, or null
 * when the value is missing/invalid — callers omit `<lastmod>` in that case.
 */
export function toW3CDateTime(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    return isISODateString(value) ? value : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/**
 * Collects the locales an entry is translated into: keys of locale-keyed
 * record fields (SEO data, translated text fields) plus the legacy
 * `translations` metadata (`languageTag` entries or a locale-keyed record).
 */
export function entryLocales(entry: SitemapEntryInput): string[] {
  const locales = new Set<string>();

  const consider = (value: unknown): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    // Locale-keyed record (SEO data, translated flat fields).
    if (keys.length > 0 && keys.every((key) => LOCALE_TAG.test(key))) {
      for (const key of keys) locales.add(key);
      return;
    }
    // Nested shape: locale keys one level deeper (legacy translations records).
    for (const key of keys) {
      const inner = record[key];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        for (const langKey of Object.keys(inner)) {
          if (LOCALE_TAG.test(langKey)) locales.add(langKey);
        }
      }
    }
  };

  consider(entry.seo);

  if (Array.isArray(entry.translations)) {
    for (const item of entry.translations) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const tag = (item as { languageTag?: unknown }).languageTag;
        if (typeof tag === "string" && LOCALE_TAG.test(tag)) locales.add(tag);
      }
    }
  } else {
    consider(entry.translations);
  }

  // Translated flat fields: locale-keyed records at the entry top level.
  for (const key of Object.keys(entry)) {
    if (key === "seo" || key === "translations") continue;
    consider(entry[key]);
  }

  return [...locales].sort();
}

/**
 * Decides whether an entry belongs in the sitemap:
 * - omitted when its SEO robots directive contains `noindex` or `none`
 * - omitted when its canonical URL points to a different origin (the entry is
 *   a duplicate of a URL that lives elsewhere)
 */
export function entryIsIndexable(
  entry: SitemapEntryInput,
  origin: string,
  defaultLang: string,
): boolean {
  const data = pickSeoLocaleData(
    entry.seo as SeoWidgetStoredValue | null | undefined,
    defaultLang,
    defaultLang,
  );
  if (!data) return true;

  const robots = decodeStoredHtmlEntities(data.robotsMeta ?? "").trim();
  if (/\bnoindex\b|\bnone\b/i.test(robots)) return false;

  const canonical = data.canonicalUrl?.trim();
  if (canonical) {
    try {
      if (new URL(canonical).origin !== new URL(origin).origin) return false;
    } catch {
      // Unparseable canonical: the widget validates on save, ignore here.
    }
  }
  return true;
}

/** URL-encodes a slug's path segments (nested slugs stay nested). */
function encodeSlug(slug: string): string {
  return slug
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export interface PublicEntryUrlOptions {
  origin: string;
  collection: string;
  slug: string;
  siteStarterEnabled?: boolean;
}

/**
 * Resolves the public URL an entry is served at, using the same pattern the
 * sitemap lists: site-starter routes for `pages` (`/slug`, homepage → `/`),
 * the generic `/{collection}/{slug}` pattern for headless collections.
 * Returns "" when the slug is empty.
 */
export function publicEntryUrl(options: PublicEntryUrlOptions): string {
  const base = options.origin.replace(/\/+$/, "");
  const slug = encodeSlug(options.slug);
  if (!slug) return "";
  const isPage = options.siteStarterEnabled === true && options.collection === "pages";
  return isPage
    ? slug === "home"
      ? `${base}/`
      : `${base}/${slug}`
    : `${base}/${encodeURIComponent(options.collection)}/${slug}`;
}

/**
 * Builds the complete sitemap XML for the given entries.
 * Pure — no cache, no DB access; the route feeds it entries and caches the result.
 */
export function buildSitemapXml(options: BuildSitemapOptions): string {
  const { origin, entries, defaultLang, siteStarterEnabled } = options;

  const urls: string[] = [];
  for (const entry of entries) {
    if (typeof entry.slug !== "string" || !entry.slug.trim()) continue;
    if (!entryIsIndexable(entry, origin, defaultLang)) continue;

    const isPage = siteStarterEnabled === true && entry.collection === "pages";
    const slug = encodeSlug(entry.slug);
    const loc = publicEntryUrl({
      origin,
      collection: entry.collection,
      slug: entry.slug,
      siteStarterEnabled,
    });
    if (!loc) continue;

    const lastmod = toW3CDateTime(entry.updatedAt ?? entry.createdAt);
    const priority = isPage && slug === "home" ? "1.0" : isPage ? "0.8" : "0.7";

    // hreflang alternates only where the URL scheme is known (site starter).
    const alternates: string[] = [];
    if (isPage) {
      const locales = entryLocales(entry).filter((locale) => locale !== defaultLang);
      for (const locale of locales) {
        alternates.push(
          `\n    <xhtml:link rel="alternate" hreflang="${escapeXml(locale)}" href="${escapeXml(`${loc}?lang=${encodeURIComponent(locale)}`)}" />`,
        );
      }
      if (locales.length > 0) {
        alternates.push(
          `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(loc)}" />`,
        );
      }
    }

    urls.push(
      `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${escapeXml(lastmod)}</lastmod>` : ""}
    <changefreq>daily</changefreq>
    <priority>${priority}</priority>${alternates.join("")}
  </url>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>`;
}

export interface BuildImageSitemapOptions {
  /** Absolute base (request origin), e.g. `https://example.com`. */
  origin: string;
  entries: SitemapEntryInput[];
  defaultLang: string;
  siteStarterEnabled?: boolean;
}

export interface BuildNewsSitemapOptions {
  /** Absolute base (request origin), e.g. `https://example.com`. */
  origin: string;
  entries: SitemapEntryInput[];
  defaultLang: string;
  publicationName: string;
  siteStarterEnabled?: boolean;
  /** Max age of news in hours (default 48 hours per Google News guidelines). */
  maxAgeHours?: number;
}

/** Extracts image URLs and titles associated with an entry. */
export function extractEntryImages(
  entry: SitemapEntryInput,
  origin: string,
): Array<{ loc: string; title?: string }> {
  const images: Array<{ loc: string; title?: string }> = [];
  const base = origin.replace(/\/+$/, "");

  const addImg = (rawLoc: unknown, rawTitle?: unknown) => {
    if (typeof rawLoc !== "string" || !rawLoc.trim()) return;
    let loc = rawLoc.trim();
    if (!loc.startsWith("http://") && !loc.startsWith("https://")) {
      loc = `${base}${loc.startsWith("/") ? loc : `/${loc}`}`;
    }
    const title = typeof rawTitle === "string" ? rawTitle.trim() : undefined;
    if (!images.some((img) => img.loc === loc)) {
      images.push({ loc, ...(title ? { title } : {}) });
    }
  };

  // 1. Check SEO widget images
  if (entry.seo && typeof entry.seo === "object") {
    const seoRec = entry.seo as Record<string, any>;
    if (seoRec.ogImage) addImg(seoRec.ogImage, seoRec.title || entry.title);
    if (seoRec.twitterImage) addImg(seoRec.twitterImage, seoRec.title || entry.title);
  }

  // 2. Common image fields on CMS entries
  for (const field of ["image", "cover", "thumbnail", "featuredImage", "banner"]) {
    const val = entry[field];
    if (typeof val === "string") {
      addImg(val, entry.title || entry.name);
    } else if (val && typeof val === "object" && "url" in (val as Record<string, unknown>)) {
      addImg((val as any).url, (val as any).title || entry.title);
    }
  }

  // 3. Array of images
  if (Array.isArray(entry.images)) {
    for (const item of entry.images) {
      if (typeof item === "string") addImg(item);
      else if (item && typeof item === "object" && "url" in item) {
        addImg((item as any).url, (item as any).title || (item as any).alt);
      }
    }
  }

  return images;
}

/**
 * Builds Google-compliant Image Sitemap XML (`xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`).
 */
export function buildImageSitemapXml(options: BuildImageSitemapOptions): string {
  const { origin, entries, defaultLang, siteStarterEnabled } = options;
  const urls: string[] = [];

  for (const entry of entries) {
    if (typeof entry.slug !== "string" || !entry.slug.trim()) continue;
    if (!entryIsIndexable(entry, origin, defaultLang)) continue;

    const loc = publicEntryUrl({
      origin,
      collection: entry.collection,
      slug: entry.slug,
      siteStarterEnabled,
    });
    if (!loc) continue;

    const images = extractEntryImages(entry, origin);
    if (images.length === 0) continue;

    const imageTags = images.slice(0, 1000).map((img) => {
      const titleTag = img.title
        ? `\n      <image:title>${escapeXml(img.title)}</image:title>`
        : "";
      return `    <image:image>\n      <image:loc>${escapeXml(img.loc)}</image:loc>${titleTag}\n    </image:image>`;
    });

    urls.push(`  <url>\n    <loc>${escapeXml(loc)}</loc>\n${imageTags.join("\n")}\n  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join("\n")}
</urlset>`;
}

/**
 * Builds Google-compliant News Sitemap XML (`xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"`).
 * Filters entries published in the last 48 hours.
 */
export function buildNewsSitemapXml(options: BuildNewsSitemapOptions): string {
  const {
    origin,
    entries,
    defaultLang,
    publicationName,
    siteStarterEnabled,
    maxAgeHours = 48,
  } = options;
  const urls: string[] = [];
  const cutoffTime = Date.now() - maxAgeHours * 3600 * 1000;

  for (const entry of entries) {
    if (typeof entry.slug !== "string" || !entry.slug.trim()) continue;
    if (!entryIsIndexable(entry, origin, defaultLang)) continue;

    const pubDate = toW3CDateTime(entry.publishedAt ?? entry.createdAt ?? entry.updatedAt);
    if (!pubDate) continue;

    const timestamp = new Date(pubDate).getTime();
    if (Number.isNaN(timestamp) || timestamp < cutoffTime) continue;

    const loc = publicEntryUrl({
      origin,
      collection: entry.collection,
      slug: entry.slug,
      siteStarterEnabled,
    });
    if (!loc) continue;

    const title =
      typeof entry.title === "string" && entry.title.trim()
        ? entry.title.trim()
        : typeof entry.name === "string"
          ? entry.name.trim()
          : entry.slug;

    urls.push(
      `  <url>
    <loc>${escapeXml(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(publicationName)}</news:name>
        <news:language>${escapeXml(defaultLang)}</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(pubDate)}</news:publication_date>
      <news:title>${escapeXml(title)}</news:title>
    </news:news>
  </url>`,
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls.join("\n")}
</urlset>`;
}

/**
 * Builds robots.txt: admin/auth/system routes are never part of the public
 * site and are disallowed explicitly; the sitemap is advertised. When an
 * AI-crawler policy is set, per-crawler groups are emitted before the global
 * `*` group so search crawlers are never affected by training-data controls.
 */
export type AiCrawlerPolicy = "allow" | "block-training" | "block-all";

/**
 * Crawler groups per policy. `block-training` disallows the documented
 * training-data crawlers while leaving search-surface crawlers (e.g.
 * OAI-SearchBot, which powers ChatGPT Search) allowed; `block-all` also
 * disallows the search-surface and indexing crawlers.
 */
const AI_CRAWLER_GROUPS: Record<Exclude<AiCrawlerPolicy, "allow">, string[]> = {
  "block-training": ["GPTBot", "Google-Extended", "ClaudeBot", "CCBot"],
  "block-all": [
    "GPTBot",
    "OAI-SearchBot",
    "Google-Extended",
    "ClaudeBot",
    "anthropic-ai",
    "PerplexityBot",
    "Applebot-Extended",
    "Bytespider",
    "CCBot",
  ],
};

export function buildRobotsTxt(
  sitemapUrl: string,
  aiCrawlerPolicy: AiCrawlerPolicy = "allow",
): string {
  const lines: string[] = ["# SveltyCMS robots.txt — generated dynamically"];

  if (aiCrawlerPolicy !== "allow") {
    lines.push(
      "",
      `# AI crawler policy: ${aiCrawlerPolicy} (set via the AI_CRAWLER_POLICY public setting)`,
    );
    for (const agent of AI_CRAWLER_GROUPS[aiCrawlerPolicy]) {
      lines.push("", `User-agent: ${agent}`, "Disallow: /");
    }
  }

  lines.push(
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Administration, authentication and system routes are never part of the public site",
    "Disallow: /api/",
    "Disallow: /login",
    "Disallow: /setup",
    "Disallow: /share",
    "Disallow: /email-previews",
    "",
    `Sitemap: ${sitemapUrl}`,
    "",
  );
  return lines.join("\n");
}

export interface LlmsSection {
  heading: string;
  links: Array<{ title: string; url: string; description?: string }>;
}

export interface BuildLlmsTxtOptions {
  siteName: string;
  description?: string;
  sections: LlmsSection[];
}

/**
 * Builds an llms.txt document (https://llmstxt.org/) — the emerging
 * machine-readable site guide for LLM crawlers and agents.
 *
 * Defensive by design: titles are stripped of newlines and markdown link
 * brackets so an authored title can never inject sections or links, and
 * headings are sanitized the same way.
 */
export function buildLlmsTxt(options: BuildLlmsTxtOptions): string {
  const sanitizeText = (value: string): string =>
    value
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const sanitizeTitle = (value: string): string => sanitizeText(value).replace(/[[\]]/g, "");

  const lines: string[] = [`# ${sanitizeText(options.siteName)}`, ""];
  const description = sanitizeText(options.description ?? "");
  if (description) {
    lines.push(`> ${description}`, "");
  }
  for (const section of options.sections) {
    if (section.links.length === 0) continue;
    lines.push(`## ${sanitizeText(section.heading)}`, "");
    for (const link of section.links) {
      const title = sanitizeTitle(link.title) || "Untitled";
      const suffix = link.description ? `: ${sanitizeText(link.description)}` : "";
      lines.push(`- [${title}](${link.url})${suffix}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
