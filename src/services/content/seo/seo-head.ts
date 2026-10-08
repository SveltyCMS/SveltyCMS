/**
 * @file src/services/content/seo/seo-head.ts
 * @description Pure, environment-agnostic helpers that turn the SEO widget's
 * stored per-locale data into renderable document-head metadata.
 *
 * ### Features
 * - Locale resolution with a default-locale fallback chain
 * - Safe entity round-trip: fields the widget HTML-escapes on save (title,
 *   description, focusKeyword, robotsMeta) are decoded here so the renderer
 *   escapes them exactly once — never double-escaped, never raw
 * - Canonical URL (self-referencing or widget override), robots meta,
 *   Open Graph, Twitter Card and JSON-LD assembly
 * - hreflang alternates derived from the translated locale keys of the stored
 *   record (site-starter URLs carry the locale as a `?lang=` query parameter)
 *
 * ### Security
 * - JSON-LD is re-parsed, re-stringified and `<` is emitted as `\u003c`, so a
 *   stored schema can never break out of the script element — defense in depth
 *   on top of the widget's save-time sanitizer
 * - The module never imports node-only APIs, so the pure helpers are also
 *   safe to import from client components (live preview title derivation)
 */

/**
 * One locale's data inside the SEO widget's stored value.
 *
 * All fields are optional: the widget strips premium fields (robotsMeta,
 * canonicalUrl, og/twitter fields, schemaMarkup) when no license is active,
 * and `translated: false` fields store a single flat object.
 */
export interface SeoLocaleData {
  /** HTML-escaped at save time by the widget schema. */
  title?: string;
  /** HTML-escaped at save time by the widget schema. */
  description?: string;
  /** HTML-escaped at save time by the widget schema. */
  focusKeyword?: string;
  /** HTML-escaped at save time by the widget schema. */
  robotsMeta?: string;
  /** Absolute URL validated by the widget schema. */
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  /** ID of a media file — resolved to a URL by the server loader. */
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image";
  twitterTitle?: string;
  twitterDescription?: string;
  /** ID of a media file — resolved to a URL by the server loader. */
  twitterImage?: string;
  /** JSON string; sanitized by the widget schema. */
  schemaMarkup?: string;
}

/**
 * Stored SEO widget value: a locale-keyed record for `translated: true`
 * fields, or a single flat object for `translated: false` fields.
 */
export type SeoWidgetStoredValue = SeoLocaleData | Record<string, SeoLocaleData | undefined>;

/** hreflang alternate for the rendered page. */
export interface SeoAlternate {
  hreflang: string;
  href: string;
}

/** Renderable document-head metadata. */
export interface SeoHeadResult {
  /** Plain text (decoded) — escape once in the renderer. */
  title: string;
  description?: string;
  keywords?: string;
  /** Absolute canonical URL (widget override or self-referencing). */
  canonicalUrl?: string;
  /** Meta robots directive (e.g. "noindex, nofollow"). */
  robots?: string;
  /** hreflang alternates for every translated locale (plus `x-default`). */
  alternates: SeoAlternate[];
  og?: {
    title: string;
    description?: string;
    image?: string;
    url: string;
    type: string;
  };
  twitter?: {
    card: "summary" | "summary_large_image";
    title: string;
    description?: string;
    image?: string;
  };
  /**
   * Fully safe `<script type="application/ld+json">…</script>` for the
   * widget's stored schemaMarkup — render with {@html}.
   */
  jsonLdScript?: string;
  /**
   * Site-level JSON-LD auto-generated from the CMS structure (WebSite on the
   * homepage, BreadcrumbList on nested paths) — each entry is a safe script
   * tag for {@html}.
   */
  autoJsonLd: string[];
}

export interface BuildSeoHeadOptions {
  /** Raw stored SEO widget value. */
  seo?: SeoWidgetStoredValue | null;
  /** Active content locale of the rendered page. */
  lang: string;
  /** Default content locale — fallback for missing translations and `x-default`. */
  defaultLang: string;
  /** Absolute canonical base (request origin), e.g. `https://example.com`. */
  origin: string;
  /** Request pathname, used for the self-referencing canonical URL. */
  pathname: string;
  /** Fallback title when the SEO data has none (usually the page title). */
  titleFallback?: string;
  /** Site name fallback. */
  siteName?: string;
  /** Force `noindex, nofollow` (draft/preview renders must never be indexed). */
  noindex?: boolean;
  /** Resolved absolute URL for the OG image (media id looked up beforehand). */
  ogImageUrl?: string | null;
  /** Resolved absolute URL for the Twitter image (media id looked up beforehand). */
  twitterImageUrl?: string | null;
}

/** Matches BCP-47-ish language tags (`en`, `de`, `pt-BR`, `zh-Hant`). */
const LOCALE_TAG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * True when `value` looks like one locale's SEO data (a flat object with
 * widget field names) rather than a locale-keyed record.
 */
export function isSeoLocaleData(value: unknown): value is SeoLocaleData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.title === "string" ||
    "description" in record ||
    "robotsMeta" in record ||
    "canonicalUrl" in record
  );
}

/**
 * Picks the SEO data for the requested locale.
 *
 * Fallback chain: exact locale → default locale → `en` → first available
 * locale. A flat (`translated: false`) object is returned as-is.
 */
export function pickSeoLocaleData(
  seo: SeoWidgetStoredValue | null | undefined,
  lang: string,
  defaultLang: string,
): SeoLocaleData | undefined {
  if (!seo) return undefined;
  if (isSeoLocaleData(seo)) return seo;

  const record = seo as Record<string, SeoLocaleData | undefined>;
  for (const candidate of [lang, defaultLang, "en"]) {
    const value = record[candidate];
    if (value && isSeoLocaleData(value)) return value;
  }
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value && isSeoLocaleData(value)) return value;
  }
  return undefined;
}

/**
 * Reverses the widget schema's save-time escaping
 * (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#039;`).
 *
 * Decoding order matters: `&amp;` is decoded last so a stored literal
 * `&amp;lt;` (user-typed `&lt;`) decodes to `&lt;` and never to `<`.
 */
export function decodeStoredHtmlEntities(value: string): string {
  return value
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

/**
 * Decodes the SEO title (widget-escaped at save) to plain text, so it can be
 * rendered with normal escaping. Returns "" when no SEO title is present.
 * Environment-agnostic on purpose — used by live preview on the client.
 */
export function pickSeoPageTitle(
  seo: SeoWidgetStoredValue | null | undefined,
  lang: string,
  defaultLang = "en",
): string {
  const data = pickSeoLocaleData(seo, lang, defaultLang);
  const title = data?.title?.trim();
  return title ? decodeStoredHtmlEntities(title) : "";
}

/** Builds the locale-specific URL for a site-starter path. */
function urlForLocale(
  origin: string,
  pathname: string,
  locale: string,
  defaultLang: string,
): string {
  const base = origin.replace(/\/+$/, "");
  const path = pathname === "/" ? "/" : pathname;
  return `${base}${path}${locale !== defaultLang ? `?lang=${encodeURIComponent(locale)}` : ""}`;
}

/** hreflang alternates from the translated locale keys of the stored record. */
function buildHreflangAlternates(
  seo: SeoWidgetStoredValue | null | undefined,
  lang: string,
  defaultLang: string,
  origin: string,
  pathname: string,
): SeoAlternate[] {
  if (!seo || isSeoLocaleData(seo)) return [];
  const locales = Object.keys(seo).filter((key) => LOCALE_TAG.test(key));
  if (locales.length === 0) return [];

  const alternates: SeoAlternate[] = [];
  for (const locale of locales.sort()) {
    if (locale === lang) continue;
    alternates.push({
      hreflang: locale,
      href: urlForLocale(origin, pathname, locale, defaultLang),
    });
  }
  if (locales.includes(defaultLang) && defaultLang !== lang) {
    alternates.push({
      hreflang: "x-default",
      href: urlForLocale(origin, pathname, defaultLang, defaultLang),
    });
  }
  return alternates;
}

/** Serializes sanitized JSON-LD into a break-out-proof script tag. */
function buildJsonLdScript(schemaMarkup: string | undefined): string | undefined {
  if (!schemaMarkup?.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(schemaMarkup);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    return serializeJsonLd(parsed);
  } catch {
    return undefined;
  }
}

/**
 * Serializes any object into a break-out-proof JSON-LD script tag:
 * `<` is emitted as `\u003c` so a stored string can never terminate the
 * script element; \u2028/\u2029 are legal JSON but not legal JS literals.
 */
export function serializeJsonLd(value: unknown): string {
  const json = JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<script type="application/ld+json">${json}</script>`;
}

/** Derives breadcrumb items from the request path (site-starter flat routes). */
function buildBreadcrumbJsonLd(origin: string, pathname: string): string | undefined {
  const segments = pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => decodeURIComponent(segment).trim())
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..")
    .slice(0, 6);
  if (segments.length === 0) return undefined;

  const base = origin.replace(/\/+$/, "");
  const items: Array<{ "@type": string; position: number; name: string; item?: string }> = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${base}/` },
  ];
  let accumulated = "";
  for (const [index, segment] of segments.entries()) {
    accumulated = `${accumulated}/${encodeURIComponent(segment)}`;
    const label = segment.replace(/[-_]+/g, " ").replace(/\b[a-z]/g, (char) => char.toUpperCase());
    items.push({
      "@type": "ListItem",
      position: index + 2,
      name: label,
      item: `${base}${accumulated}`,
    });
  }

  return serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  });
}

/** WebSite structured data for the homepage (per Google's WebSite markup docs). */
function buildWebSiteJsonLd(origin: string, siteName: string | undefined): string | undefined {
  let name = siteName?.trim();
  if (!name) {
    try {
      name = new URL(origin).hostname;
    } catch {
      return undefined;
    }
  }
  const base = origin.replace(/\/+$/, "");
  return serializeJsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: `${base}/`,
    name,
  });
}

/**
 * Builds the document-head metadata for a page from the SEO widget's stored
 * data. Pure and deterministic — no IO, no environment access.
 */
export function buildSeoHead(options: BuildSeoHeadOptions): SeoHeadResult {
  const {
    seo,
    lang,
    defaultLang,
    origin,
    pathname,
    titleFallback,
    siteName,
    noindex,
    ogImageUrl,
    twitterImageUrl,
  } = options;

  const data = pickSeoLocaleData(seo, lang, defaultLang);

  const clean = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  /** Fields the widget escapes at save: decode so the renderer escapes once. */
  const text = (value: string | undefined): string | undefined => {
    const trimmed = clean(value);
    return trimmed ? decodeStoredHtmlEntities(trimmed) : undefined;
  };
  /** Fields the widget never escapes: pass through (the renderer escapes). */
  const plain = (value: string | undefined): string | undefined => clean(value);

  const title = text(data?.title) || clean(titleFallback) || clean(siteName) || pathname || "";
  const description = text(data?.description);
  const keywords = text(data?.focusKeyword);

  // Canonical: explicit widget override, otherwise self-referencing with the
  // active locale (site-starter URLs carry the locale as `?lang=`).
  const canonicalUrl =
    clean(data?.canonicalUrl) || urlForLocale(origin, pathname, lang, defaultLang);

  // Robots: preview/draft renders are never indexable; otherwise the stored
  // directive (typically "index, follow").
  const robots = noindex ? "noindex, nofollow" : text(data?.robotsMeta);

  const ogTitle = plain(data?.ogTitle) || title;
  const ogDescription = plain(data?.ogDescription) || description;
  const ogImage = ogImageUrl ?? undefined;

  const twitterCard: "summary" | "summary_large_image" =
    data?.twitterCard === "summary_large_image" ? "summary_large_image" : "summary";
  const twitterTitle = plain(data?.twitterTitle) || ogTitle;
  const twitterDescription = plain(data?.twitterDescription) || ogDescription;
  const twitterImage = twitterImageUrl ?? ogImage;

  const alternates = buildHreflangAlternates(seo, lang, defaultLang, origin, pathname);
  const jsonLdScript = buildJsonLdScript(data?.schemaMarkup);

  // Site-level JSON-LD the CMS can generate itself (no per-entry authoring):
  // WebSite on the homepage, BreadcrumbList on nested paths.
  const autoJsonLd: string[] = [];
  const isHomepage = pathname === "/" || pathname === "/home";
  if (isHomepage) {
    const webSite = buildWebSiteJsonLd(origin, siteName);
    if (webSite) autoJsonLd.push(webSite);
  } else {
    const breadcrumbs = buildBreadcrumbJsonLd(origin, pathname);
    if (breadcrumbs) autoJsonLd.push(breadcrumbs);
  }

  return {
    title,
    description,
    keywords,
    canonicalUrl,
    robots,
    alternates,
    og: {
      title: ogTitle,
      description: ogDescription,
      image: ogImage,
      url: canonicalUrl,
      type: "website",
    },
    twitter: {
      card: twitterCard,
      title: twitterTitle,
      description: twitterDescription,
      image: twitterImage,
    },
    jsonLdScript,
    autoJsonLd,
  };
}
