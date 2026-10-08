/**
 * @file src/routes/(site)/[...slug]/+page.server.ts
 * @description Catch-all public page loader for the site starter.
 */

import { error, redirect } from "@sveltejs/kit";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { localizeSitePage, resolveSitePage } from "@src/services/site/page-resolver.server";
import { isSiteStarterEnabled, pathToPageSlug } from "@src/services/site/site-config.server";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { loadSeoHeadForPage } from "@src/services/content/seo/seo-head.server";
import type { SeoHeadResult } from "@src/services/content/seo/seo-head";
import { logger } from "@utils/logger";
import { rethrow } from "@utils/error-handling";
import type { PageServerLoad } from "./$types";

interface SlugPageData {
  page: ReturnType<typeof localizeSitePage>;
  localized: ReturnType<typeof localizeSitePage>;
  editable: boolean | undefined;
  slug: string;
  seoHead?: SeoHeadResult;
}

export const load: PageServerLoad = async ({
  params,
  locals,
  parent,
  url,
}): Promise<SlugPageData> => {
  if (!isSiteStarterEnabled()) {
    throw redirect(302, "/login");
  }

  const slugPath = params.slug || "";
  const pathname = `/${slugPath}`;
  const parentData = await parent();
  const { tenantId } = locals as { tenantId?: string };
  const lang = parentData.contentLanguage || "en";

  const page = await resolveSitePage({
    pathname,
    tenantId,
    draft: parentData.isDraft,
    entryId: parentData.previewEntryId || url.searchParams.get("entryId") || undefined,
    user: locals.user,
  });

  if (!page) {
    throw error(404, `Page not found: ${pathToPageSlug(pathname)}`);
  }

  if (page.status && page.status !== "publish" && !parentData.isDraft) {
    throw error(404, "Page not found");
  }

  // SEO head metadata from the SEO widget's stored data (media IDs resolved).
  let seoHead: Awaited<ReturnType<typeof loadSeoHeadForPage>> | undefined;
  try {
    if (dbAdapter) {
      const cms = new LocalCMS(dbAdapter, { tenantId: tenantId ?? undefined });
      const defaultLang = getPublicSettingSync("DEFAULT_CONTENT_LANGUAGE") || "en";
      seoHead = await loadSeoHeadForPage({
        page,
        cms,
        url,
        lang,
        defaultLang,
        tenantId,
        siteName: parentData.siteName,
        noindex: parentData.isPreview || parentData.isDraft,
      });
    }
  } catch (err) {
    rethrow(err);
    logger.warn("[Site] SEO head assembly failed — rendering title-only head", { error: err });
  }

  return {
    page,
    localized: localizeSitePage(page, lang),
    editable: parentData.isPreview,
    slug: pathToPageSlug(pathname),
    seoHead,
  };
};
