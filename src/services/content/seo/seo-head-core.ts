/**
 * @file src/services/content/seo/seo-head-core.ts
 * @description Leaf helpers that resolve the SEO widget's stored per-locale
 * data to plain values. Split out of `seo-head.ts` so the site pages — which
 * only need the live-preview title — never pull the JSON-LD, Open Graph and
 * hreflang assembly into the client graph.
 *
 * ### Features
 * - Locale resolution with a default-locale fallback chain
 * - Safe entity round-trip: fields the widget HTML-escapes on save (title,
 *   description, focusKeyword, robotsMeta) are decoded here so the renderer
 *   escapes them exactly once — never double-escaped, never raw
 * - Flat (`translated: false`) and locale-keyed stored values are both handled
 */

import type { SeoLocaleData, SeoWidgetStoredValue } from "./seo-head";

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
