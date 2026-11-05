/**
 * @file src/routes/sitemap-images.xml/+server.ts
 * @description Specialized Google Image XML sitemap for indexed media assets across public collections.
 *
 * Features:
 * - Conforms to Google Image Sitemap specification (xmlns:image)
 * - Extracts images from SEO metadata, featuredImage, thumbnail, cover, and gallery media
 * - Paginated fetching across collections to avoid truncation
 * - 5-minute in-memory cache per tenant
 */

import type { RequestHandler } from "@sveltejs/kit";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { isSiteStarterEnabled } from "@src/services/site/site-config.server";
import {
  buildImageSitemapXml,
  type SitemapEntryInput,
} from "@src/services/content/seo/sitemap-builder";
import { getCachedSitemap, setCachedSitemap } from "@src/services/content/seo/sitemap-cache";

const PAGE_SIZE = 200;
const MAX_ENTRIES_PER_COLLECTION = 100_000;

export const GET: RequestHandler = async ({ locals, url }) => {
  const tenantId = (locals.tenantId as string | null | undefined) ?? undefined;
  if (!dbAdapter) return new Response("Database not initialized", { status: 500 });

  const cacheKey = `images:${tenantId ?? "global"}`;

  // Try cache first
  const cached = getCachedSitemap(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "max-age=300",
      },
    });
  }

  const cms = new LocalCMS(dbAdapter, { tenantId });

  // 1. Fetch public collections
  const collections = await cms.collections.list();
  const entries: SitemapEntryInput[] = [];

  for (const col of collections) {
    if (col.name.startsWith("system_") || col.name === "redirects") continue;

    try {
      let offset = 0;
      for (;;) {
        const result = await cms.collections.find(col.name, {
          publicationFilter: "published",
          tenantId,
          limit: PAGE_SIZE,
          offset,
        });

        const rows = Array.isArray(result?.data) ? result.data : [];
        for (const entry of rows) {
          entries.push({ ...(entry as Record<string, unknown>), collection: col.name });
        }

        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
        if (offset >= MAX_ENTRIES_PER_COLLECTION) break;
      }
    } catch {
      // Gracefully skip collections that fail to resolve
    }
  }

  const rawDefaultLang = getPublicSettingSync("DEFAULT_CONTENT_LANGUAGE");
  const defaultLang =
    typeof rawDefaultLang === "string" && rawDefaultLang.trim() ? rawDefaultLang.trim() : "en";

  // 2. Generate Google Image Sitemap XML
  const xml = buildImageSitemapXml({
    origin: url.origin,
    entries,
    defaultLang,
    siteStarterEnabled: isSiteStarterEnabled(),
  });

  // Update cache
  setCachedSitemap(cacheKey, xml);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "max-age=3600",
    },
  });
};
