/**
 * @file src/services/content/seo/seo-head.server.ts
 * @description Server-side SEO head assembly for the site starter: resolves
 * the media IDs stored in the SEO widget (`ogImage`/`twitterImage`) to
 * absolute public URLs, then builds the full document-head metadata.
 *
 * ### Features
 * - Media ID → public URL resolution via the LocalCMS media namespace
 * - Cloud/CDN URLs pass through untouched; storage paths are prefixed with
 *   the request origin
 * - Soft-fails: a missing or unresolvable image omits its tag, never the page
 */

import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId, MediaItem } from "@src/databases/db-interface";
import { logger } from "@utils/logger";
import { rethrow } from "@utils/error-handling";
import { resolveMediaPublicPath } from "@utils/media/media-utils";
import {
  buildSeoHead,
  pickSeoLocaleData,
  type SeoHeadResult,
  type SeoWidgetStoredValue,
} from "./seo-head";

export interface LoadSeoHeadForPageOptions {
  /** The resolved site page entry (may carry the SEO widget's stored value). */
  page: { seo?: unknown; title?: unknown };
  cms: LocalCMS;
  url: URL;
  lang: string;
  defaultLang: string;
  tenantId?: string | null;
  siteName?: string;
  /** Force `noindex` (draft/preview renders must never be indexed). */
  noindex?: boolean;
}

/** Resolves a media file ID to an absolute public URL (best effort). */
export async function resolveSeoMediaUrl(
  cms: LocalCMS,
  mediaId: string | undefined,
  tenantId: string | null | undefined,
  origin: string,
): Promise<string | undefined> {
  if (!mediaId) return undefined;
  try {
    const result = await cms.media.findById(mediaId, {
      tenantId: tenantId ? (tenantId as DatabaseId) : undefined,
    });
    if (!result.success || !result.data) return undefined;

    // The media namespace enriches records with a public `url` property.
    const item = result.data as MediaItem & { url?: string | null };
    const publicPath = resolveMediaPublicPath({
      path: item.path,
      hash: item.hash,
      filename: item.filename,
      url: item.url,
    });
    if (!publicPath) return undefined;
    if (publicPath.startsWith("http://") || publicPath.startsWith("https://")) {
      return publicPath;
    }
    const base = origin.replace(/\/+$/, "");
    return `${base}${publicPath.startsWith("/") ? publicPath : `/${publicPath}`}`;
  } catch (err) {
    rethrow(err);
    logger.debug("[SEO] Could not resolve media image for head tags", { mediaId, error: err });
    return undefined;
  }
}

/** Resolves a possibly i18n-keyed title field to a single string. */
function localizedTitle(title: unknown, lang: string, defaultLang: string): string | undefined {
  if (typeof title === "string") {
    const trimmed = title.trim();
    return trimmed || undefined;
  }
  if (title && typeof title === "object") {
    const record = title as Record<string, unknown>;
    for (const candidate of [lang, defaultLang, "en"]) {
      const value = record[candidate];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    for (const value of Object.values(record)) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return undefined;
}

/**
 * Builds the full SEO head metadata for a resolved site page — resolves the
 * widget's image media IDs, then delegates to the pure `buildSeoHead`.
 */
export async function loadSeoHeadForPage(
  options: LoadSeoHeadForPageOptions,
): Promise<SeoHeadResult> {
  const { page, cms, url, lang, defaultLang, tenantId, siteName, noindex } = options;
  const seo = (page?.seo ?? null) as SeoWidgetStoredValue | null;
  const data = pickSeoLocaleData(seo, lang, defaultLang);

  const [ogImageUrl, twitterImageUrl] = await Promise.all([
    resolveSeoMediaUrl(cms, data?.ogImage, tenantId, url.origin),
    resolveSeoMediaUrl(cms, data?.twitterImage, tenantId, url.origin),
  ]);

  return buildSeoHead({
    seo,
    lang,
    defaultLang,
    origin: url.origin,
    pathname: url.pathname,
    titleFallback: localizedTitle(page?.title, lang, defaultLang),
    siteName,
    noindex,
    ogImageUrl,
    twitterImageUrl,
  });
}
