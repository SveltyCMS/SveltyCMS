/**
 * @file src/services/site/page-resolver.server.ts
 * @description Resolves public site pages from the `pages` collection via LocalCMS.
 */

import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { logger } from "@utils/logger";
import { sanitizeHtml } from "@src/utils/sanitize-html.server";
import { pathToPageSlug } from "./site-config.server";
import type { SiteContentBlock, SitePage, SitePageContent } from "./types";

export interface ResolveSitePageOptions {
  pathname: string;
  tenantId?: string | null;
  draft?: boolean;
  entryId?: string;
  user?: any;
}

function localizeField(value: string | Record<string, string> | undefined, lang: string): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[lang] || value.en || (Object.values(value)[0] as string) || "";
}

/**
 * Sanitize rich-text block bodies before they reach the renderer's `{@html}`
 * sink. The client never parses authored HTML (the parser is server-only), so
 * this is the render-side trust boundary; the write path already sanitizes
 * persisted values.
 */
function sanitizeContent(content: SitePage["content"]): SitePage["content"] {
  if (!content) return content;

  const sanitizeBlocks = (document: SitePageContent): SitePageContent => ({
    ...document,
    blocks: document.blocks?.map((block: SiteContentBlock) =>
      block.type === "richtext" && block.body
        ? { ...block, body: sanitizeHtml(block.body) }
        : block,
    ),
  });

  if (typeof content === "string") {
    try {
      return JSON.stringify(sanitizeBlocks(JSON.parse(content) as SitePageContent));
    } catch {
      // Unparsable content renders nothing in the client parser; keep it as-is.
      return content;
    }
  }

  return sanitizeBlocks(content);
}

export function localizeSitePage(page: SitePage, lang: string): SitePage {
  return {
    ...page,
    title: localizeField(page.title, lang),
    heroHeading: localizeField(page.heroHeading, lang),
    heroSubheading: localizeField(page.heroSubheading, lang),
    body: sanitizeHtml(localizeField(page.body, lang)),
    content: sanitizeContent(page.content),
    ctaText: localizeField(page.ctaText, lang),
  };
}

/**
 * Fetches a site page entry by URL path or preview entry id.
 */
export async function resolveSitePage(options: ResolveSitePageOptions): Promise<SitePage | null> {
  if (!dbAdapter) return null;

  const { pathname, tenantId, draft = false, entryId, user } = options;
  const cms = new LocalCMS(dbAdapter, { tenantId: tenantId ?? undefined });
  const slug = pathToPageSlug(pathname);

  try {
    const filter: Record<string, unknown> = entryId ? { _id: entryId } : { slug };

    const result = await cms.collections.find("pages", {
      filter,
      limit: 1,
      tenantId,
      publicationFilter: draft ? "all" : "published",
      user,
      system: draft ? true : undefined,
    });

    if (!result?.success || !Array.isArray(result.data) || result.data.length === 0) {
      return null;
    }

    return result.data[0] as SitePage;
  } catch (err) {
    // An install with no `pages` collection is the normal empty homepage
    // (the loader then redirects). That is not a failed resolve.
    const code = (err as { code?: string } | null)?.code;
    if (code === "COLLECTION_NOT_FOUND") {
      logger.debug("[Site] Pages collection is not installed", { slug, entryId });
      return null;
    }
    logger.warn("[Site] Page resolve failed", { slug, entryId, error: err });
    return null;
  }
}
