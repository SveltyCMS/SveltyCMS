/**
 * @file src/routes/llms.txt/+server.ts
 * @description Dynamic llms.txt generator for LLM crawlers and agents
 * (https://llmstxt.org/): site name + description, then curated per-collection
 * sections linking the published entries. Served as text/plain with a short
 * in-memory cache per tenant.
 */

import type { RequestHandler } from "@sveltejs/kit";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { isSiteStarterEnabled } from "@src/services/site/site-config.server";
import { buildLlmsTxt, type LlmsSection } from "@src/services/content/seo/sitemap-builder";
import { getCachedSitemap, setCachedSitemap } from "@src/services/content/seo/sitemap-cache";

const MAX_LINKS_PER_COLLECTION = 50;
const MAX_COLLECTIONS = 20;
const MAX_TOTAL_LINKS = 500;

export const GET: RequestHandler = async ({ locals, url }) => {
  const tenantId = (locals.tenantId as string | null | undefined) ?? undefined;
  if (!dbAdapter) return new Response("Database not initialized", { status: 500 });

  // The sitemap cache module is a generic keyed document cache; llms.txt
  // entries use a namespaced key.
  const cacheKey = `llms:${tenantId ?? "global"}`;
  const cached = getCachedSitemap(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "max-age=300",
      },
    });
  }

  const cms = new LocalCMS(dbAdapter, { tenantId });
  const collections = (await cms.collections.list()) as Array<{
    name: string;
    label?: string;
  }>;
  const siteStarter = isSiteStarterEnabled();
  const siteName = getPublicSettingSync("SITE_NAME") || "SveltyCMS";
  const description = getPublicSettingSync("SITE_SLOGAN") || "";
  const defaultLang = getPublicSettingSync("DEFAULT_CONTENT_LANGUAGE") || "en";

  const publicCollections = collections.filter(
    (col) => !col.name.startsWith("system_") && col.name !== "redirects",
  );
  // Site pages first when the site starter owns the public routes.
  const ordered = [...publicCollections].sort((a, b) => {
    const aPage = siteStarter && a.name === "pages" ? 0 : 1;
    const bPage = siteStarter && b.name === "pages" ? 0 : 1;
    return aPage - bPage;
  });

  const sections: LlmsSection[] = [];
  let totalLinks = 0;

  for (const col of ordered.slice(0, MAX_COLLECTIONS)) {
    if (totalLinks >= MAX_TOTAL_LINKS) break;
    try {
      const result = await cms.collections.find(col.name, {
        publicationFilter: "published",
        tenantId,
        limit: MAX_LINKS_PER_COLLECTION,
      });
      const rows = Array.isArray(result?.data) ? result.data : [];

      const links: LlmsSection["links"] = [];
      for (const entry of rows) {
        const slug = typeof entry.slug === "string" ? entry.slug.trim() : "";
        if (!slug) continue;
        const isPage = siteStarter && col.name === "pages";
        const path = isPage
          ? slug === "home"
            ? "/"
            : `/${encodeURIComponent(slug)}`
          : `/${encodeURIComponent(col.name)}/${encodeURIComponent(slug)}`;

        const rawTitle = entry.title;
        const title =
          typeof rawTitle === "string"
            ? rawTitle
            : rawTitle && typeof rawTitle === "object"
              ? String(
                  (rawTitle as Record<string, unknown>)[defaultLang] ??
                    (rawTitle as Record<string, unknown>).en ??
                    Object.values(rawTitle as Record<string, unknown>)[0] ??
                    "",
                )
              : String(entry.name ?? slug);
        const description = typeof entry.description === "string" ? entry.description : "";

        links.push({ title, url: `${url.origin}${path}`, description });
        totalLinks += 1;
        if (totalLinks >= MAX_TOTAL_LINKS) break;
      }

      if (links.length > 0) {
        sections.push({ heading: String(col.label ?? col.name), links });
      }
    } catch {
      // Gracefully skip collections that fail to resolve (e.g., schema cache mismatch)
    }
  }

  const txt = buildLlmsTxt({ siteName, description, sections });
  setCachedSitemap(cacheKey, txt);

  return new Response(txt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "max-age=3600",
    },
  });
};
