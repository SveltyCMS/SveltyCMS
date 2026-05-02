/**
 * @file src/routes/sitemap.xml/+server.ts
 * @description Dynamic XML Sitemap generator.
 */

import type { RequestHandler } from "@sveltejs/kit";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/local-cms";
import { getCachedSitemap, setCachedSitemap } from "@src/services/seo/sitemap-cache";

export const GET: RequestHandler = async ({ locals, url }: { locals: any; url: URL }) => {
  const { tenantId } = locals;
  if (!dbAdapter) return new Response("Database not initialized", { status: 500 });

  // Try cache first
  const cached = getCachedSitemap(tenantId as string);
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
  const entries: any[] = [];

  for (const col of collections) {
    // Only include public collections (not system ones)
    if (col.name.startsWith("system_") || col.name === "redirects") continue;

    const result = await cms.collections.find(col.name, {
      status: "published",
      tenantId,
    } as any);

    if (result.success) {
      entries.push(
        ...result.data.map((e: any) => ({
          ...e,
          _collection: col.name,
        })),
      );
    }
  }

  // 2. Generate XML
  const baseUrl = `${url.protocol}//${url.host}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${entries
    .map((entry) => {
      const loc = `${baseUrl}/${entry._collection}/${entry.slug}`;
      const lastmod = entry.updatedAt || entry.createdAt;

      // Add hreflang alternate links if translations exist
      const alternates = entry.translations
        ? Object.keys(entry.translations)
            .map(
              (lang) =>
                `<xhtml:link rel="alternate" hreflang="${lang}" href="${baseUrl}/${lang}/${entry._collection}/${entry.slug}" />`,
            )
            .join("\n    ")
        : "";

      return `
  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
    ${alternates}
  </url>`;
    })
    .join("")}
    </urlset>`;

  // Update cache
  setCachedSitemap(tenantId as string, xml);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "max-age=3600",
    },
  });
};
