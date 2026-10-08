/**
 * @file src/routes/sitemap.xml/+server.ts
 * @description Dynamic XML sitemap for all public collections.
 *
 * ### Features
 * - Publishes published entries of every non-system collection, paginated so
 *   the SDK's page-size clamp never truncates the sitemap
 * - Respects per-entry indexing controls (SEO widget `noindex`, external
 *   canonical URLs) via the shared sitemap builder
 * - Maps `pages` entries to the real site-starter routes with hreflang
 *   alternates when the site starter is enabled
 * - 5-minute in-memory cache per tenant
 */

import type { RequestHandler } from "@sveltejs/kit";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { isSiteStarterEnabled } from "@src/services/site/site-config.server";
import { buildSitemapXml, type SitemapEntryInput } from "@src/services/content/seo/sitemap-builder";
import { getCachedSitemap, setCachedSitemap } from "@src/services/content/seo/sitemap-cache";

const PAGE_SIZE = 200;
const MAX_ENTRIES_PER_COLLECTION = 100_000;

export const GET: RequestHandler = async ({ locals, url }) => {
  const tenantId = (locals.tenantId as string | null | undefined) ?? undefined;
  if (!dbAdapter) return new Response("Database not initialized", { status: 500 });

  const cacheKey = `${tenantId ?? "global"}`;

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

  // 1. Fetch all collections
  const collections = await cms.collections.list();
  const entries: SitemapEntryInput[] = [];

  for (const col of collections) {
    // Only include public collections (not system ones)
    if (col.name.startsWith("system_") || col.name === "redirects") continue;

    try {
      // Paginate: the SDK clamps the list size, so a single find() call would
      // silently truncate large collections out of the sitemap.
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
      // Gracefully skip collections that fail to resolve (e.g., schema cache mismatch)
    }
  }

  // 2. Generate XML
  const xml = buildSitemapXml({
    origin: url.origin,
    entries,
    defaultLang: getPublicSettingSync("DEFAULT_CONTENT_LANGUAGE") || "en",
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
