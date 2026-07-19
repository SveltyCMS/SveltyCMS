/**
 * @file src/routes/(site)/+page.server.ts
 * @description Homepage loader — public site for guests, CMS redirect for authenticated editors.
 */

import { contentSystem } from "@src/content/index.server";
import { localizeSitePage, resolveSitePage } from "@src/services/site/page-resolver.server";
import { isSiteStarterEnabled } from "@src/services/site/site-config.server";
import { isMultiTenantEnabled } from "@utils/tenant";
import { publicEnv } from "@src/stores/global-settings.svelte";
import { error, isHttpError, isRedirect, redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";
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

  const isAdmin = Boolean(user?.isAdmin || user?.role === "admin");
  if (isAdmin) {
    throw redirect(302, "/config/collectionbuilder");
  }
  throw redirect(302, "/user/profile");
}

export const load: PageServerLoad = async ({ locals, parent, url }) => {
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
  });

  if (!page) {
    throw redirect(302, "/login");
  }

  if (page.status && page.status !== "publish" && !parentData.isDraft) {
    throw error(404, "Page not found");
  }

  return {
    page,
    localized: localizeSitePage(page, lang),
    editable: parentData.isPreview,
  };
};
