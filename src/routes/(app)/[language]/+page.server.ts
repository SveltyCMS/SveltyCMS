/**
 * @file src/routes/(app)/[language]/+page.server.ts
 * @description Redirect handler for language-only URLs.
 * Redirects /en (or any language) to the first available collection.
 * Usescontent-managerfor robust, canonical path resolution.
 */

import { contentSystem } from "@src/content";
import { redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { language } = params;
  const { tenantId } = locals;

  try {
    // Ensurecontent-manageris initialized (required for accurate collection list)
    await contentSystem.initialize(tenantId);

    // Get robust redirect URL for first collection
    // This returns /${language}/${collectionId}, which then canonically redirects
    // to the pretty path in [...collection]/+page.server.ts
    const redirectUrl = await contentSystem.getFirstCollectionRedirectUrl(language, tenantId);

    if (redirectUrl) {
      logger.info(`[Language Redirect] Redirecting to first collection: ${redirectUrl}`);
      throw redirect(302, redirectUrl);
    }

    // Fallback if no collections found - go to collection builder
    logger.warn("[Language Redirect] No collections found for redirection, using builder fallback");
    throw redirect(302, "/config/collectionbuilder");
  } catch (err) {
    // Re-throw SvelteKit's internal redirect and error exceptions
    const { isRedirect, isHttpError } = await import("@sveltejs/kit");
    if (isRedirect(err) || isHttpError(err)) {
      throw err;
    }

    logger.error("Error in language redirect, falling back to root", {
      error: err,
      language,
      tenantId,
    });
    throw redirect(302, "/");
  }
};
