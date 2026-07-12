/**
 * @file src/services/site/page-resolver.server.ts
 * @description Resolves public site pages from the `pages` collection via LocalCMS.
 */

import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { logger } from "@utils/logger";
import { pathToPageSlug } from "./site-config.server";
import type { SitePage } from "./types";

export interface ResolveSitePageOptions {
  pathname: string;
  tenantId?: string | null;
  draft?: boolean;
  entryId?: string;
}

function localizeField(value: string | Record<string, string> | undefined, lang: string): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[lang] || value.en || (Object.values(value)[0] as string) || "";
}

export function localizeSitePage(page: SitePage, lang: string): SitePage {
  return {
    ...page,
    title: localizeField(page.title, lang),
    heroHeading: localizeField(page.heroHeading, lang),
    heroSubheading: localizeField(page.heroSubheading, lang),
    body: localizeField(page.body, lang),
    ctaText: localizeField(page.ctaText, lang),
  };
}

/**
 * Fetches a site page entry by URL path or preview entry id.
 */
export async function resolveSitePage(options: ResolveSitePageOptions): Promise<SitePage | null> {
  if (!dbAdapter) return null;

  const { pathname, tenantId, draft = false, entryId } = options;
  const cms = new LocalCMS(dbAdapter, { tenantId: tenantId ?? undefined });
  const slug = pathToPageSlug(pathname);

  try {
    const filter: Record<string, unknown> = entryId ? { _id: entryId } : { slug };

    const result = await cms.collections.find("pages", {
      filter,
      limit: 1,
      tenantId,
      publicationFilter: draft ? "all" : "published",
    });

    if (!result?.success || !Array.isArray(result.data) || result.data.length === 0) {
      return null;
    }

    return result.data[0] as SitePage;
  } catch (err) {
    logger.debug("[Site] Page resolve failed", { slug, entryId, error: err });
    return null;
  }
}
