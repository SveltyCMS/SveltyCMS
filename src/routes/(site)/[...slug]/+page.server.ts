/**
 * @file src/routes/(site)/[...slug]/+page.server.ts
 * @description Catch-all public page loader for the site starter.
 */

import { error, redirect } from "@sveltejs/kit";
import { localizeSitePage, resolveSitePage } from "@src/services/site/page-resolver.server";
import { isSiteStarterEnabled, pathToPageSlug } from "@src/services/site/site-config.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
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
  });

  if (!page) {
    throw error(404, `Page not found: ${pathToPageSlug(pathname)}`);
  }

  if (page.status && page.status !== "publish" && !parentData.isDraft) {
    throw error(404, "Page not found");
  }

  return {
    page,
    localized: localizeSitePage(page, lang),
    editable: parentData.isPreview,
    slug: pathToPageSlug(pathname),
  };
};
