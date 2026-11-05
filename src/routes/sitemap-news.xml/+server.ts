/**
 * @file src/routes/sitemap-news.xml/+server.ts
 * @description Specialized Google News XML sitemap for recent news/editorial articles (≤48h).
 *
 * Features:
 * - Conforms to Google News Sitemap specification (xmlns:news)
 * - Restricts to articles published in the last 48 hours per Google News indexing rules
 * - Supports news/article collections
 * - 5-minute in-memory cache per tenant
 */

import type { RequestHandler } from "@sveltejs/kit";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { isSiteStarterEnabled } from "@src/services/site/site-config.server";
import {
  buildNewsSitemapXml,
  type SitemapEntryInput,
} from "@src/services/content/seo/sitemap-builder";
import { getCachedSitemap, setCachedSitemap } from "@src/services/content/seo/sitemap-cache";

const PAGE_SIZE = 200;

export const GET: RequestHandler = async ({ locals, url }) => {
  const tenantId = (locals.tenantId as string | null | undefined) ?? undefined;
  if (!dbAdapter) return new Response("Database not initialized", { status: 500 });

  const cacheKey = `news:${tenantId ?? "global"}`;

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

  // 1. Fetch collections likely to contain news/articles
  const collections = await cms.collections.list();
  const entries: SitemapEntryInput[] = [];

  for (const col of collections) {
    if (col.name.startsWith("system_") || col.name === "redirects") continue;

    try {
      const result = await cms.collections.find(col.name, {
        publicationFilter: "published",
        tenantId,
        limit: PAGE_SIZE,
      });

      const rows = Array.isArray(result?.data) ? result.data : [];
      for (const entry of rows) {
        entries.push({ ...(entry as Record<string, unknown>), collection: col.name });
      }
    } catch {
      // Gracefully skip collections that fail to resolve
    }
  }

  const rawSiteName = getPublicSettingSync("SITE_NAME");
  const siteName =
    typeof rawSiteName === "string" && rawSiteName.trim() ? rawSiteName.trim() : "SveltyCMS";

  const rawDefaultLang = getPublicSettingSync("DEFAULT_CONTENT_LANGUAGE");
  const defaultLang =
    typeof rawDefaultLang === "string" && rawDefaultLang.trim() ? rawDefaultLang.trim() : "en";

  // 2. Generate Google News Sitemap XML (last 48 hours)
  const xml = buildNewsSitemapXml({
    origin: url.origin,
    entries,
    defaultLang,
    publicationName: siteName,
    siteStarterEnabled: isSiteStarterEnabled(),
    maxAgeHours: 48,
  });

  // Update cache
  setCachedSitemap(cacheKey, xml);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "max-age=300",
    },
  });
};
