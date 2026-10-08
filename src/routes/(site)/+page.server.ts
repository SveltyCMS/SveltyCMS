/**
 * @file src/routes/(site)/+page.server.ts
 * @description Homepage loader — public site for guests, CMS redirect for authenticated editors.
 */

import { contentSystem } from "@src/content/index.server";
import { dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { localizeSitePage, resolveSitePage } from "@src/services/site/page-resolver.server";
import { isSiteStarterEnabled } from "@src/services/site/site-config.server";
import { getPublicSettingSync } from "@src/services/core/settings-service";
import { loadSeoHeadForPage } from "@src/services/content/seo/seo-head.server";
import type { SeoHeadResult } from "@src/services/content/seo/seo-head";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import { isAdmin } from "@utils/hook-utils";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { error, isHttpError, isRedirect, redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { rethrow } from "@utils/error-handling";
import type { PageServerLoad } from "./$types";

async function redirectAuthenticatedUserToCms(locals: App.Locals, url: URL): Promise<never> {
  const user = locals.user!;
  const { tenantId } = locals as { tenantId?: string };

  const isGlobalAdmin = user.tenantId === null || user.tenantId === undefined;
  if (isMultiTenantEnabled() && !tenantId && !isGlobalAdmin) {
    throw error(400, "Tenant could not be identified for this operation.");
  }

  const redirectLanguage =
    url.searchParams.get("contentLanguage") ||
    user.locale ||
    publicEnv.DEFAULT_CONTENT_LANGUAGE ||
    "en";

  const redirectUrl = await contentSystem.getFirstCollectionRedirectUrl(redirectLanguage, tenantId);

  if (redirectUrl) {
    logger.info(`Redirecting editor from / to ${redirectUrl}`, { tenantId });
    throw redirect(302, redirectUrl);
  }

  if (isAdmin(user)) {
    throw redirect(302, "/config/collectionbuilder");
  }
  throw redirect(302, "/user/profile");
}

export const load: PageServerLoad = async ({
  locals,
  parent,
  url,
}): Promise<{
  page: ReturnType<typeof localizeSitePage>;
  localized: ReturnType<typeof localizeSitePage>;
  editable: boolean | undefined;
  seoHead?: SeoHeadResult;
}> => {
  const user = locals.user;

  if (!isSiteStarterEnabled()) {
    if (!user || (user as { isAnonymous?: boolean }).isAnonymous) {
      throw redirect(302, "/login");
    }
    return redirectAuthenticatedUserToCms(locals, url);
  }

  if (user && !(user as { isAnonymous?: boolean }).isAnonymous) {
    try {
      return await redirectAuthenticatedUserToCms(locals, url);
    } catch (err) {
      if (isRedirect(err) || isHttpError(err)) throw err;
      throw err;
    }
  }

  const parentData = await parent();
  const { tenantId } = locals as { tenantId?: string };
  const lang = parentData.contentLanguage || "en";

  const page = await resolveSitePage({
    pathname: "/",
    tenantId,
    draft: parentData.isDraft,
    entryId: parentData.previewEntryId || undefined,
    user: locals.user,
  });

  if (!page) {
    throw redirect(302, "/login");
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
    seoHead,
  };
};
