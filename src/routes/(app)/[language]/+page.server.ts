/**
 * @file src/routes/(app)/[language]/+page.server.ts
 * @description Redirect handler for language-only URLs.
 * Redirects /en (or any language) to the first available collection.
 * Usescontent-managerfor robust, canonical path resolution.
 */

import { contentSystem } from "@src/content/index.server";
import { isSystemReady } from "@src/stores/system/state.svelte";
import { error, isHttpError, isRedirect, redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

// Cache the first collection URL per language (TTL: 5 minutes in production)
const _redirectCache = new Map<string, { url: string; ts: number }>();
const REDIRECT_CACHE_TTL = 5 * 60_000;

export const load: PageServerLoad = async ({ params, locals, url }) => {
  getAuthenticatedUser(locals, url.pathname + url.search);
  const { language } = params;
  const { tenantId } = locals;

  const availableLanguages = (
    await import("@src/services/core/settings-service")
  ).getPublicSettingSync("AVAILABLE_CONTENT_LANGUAGES") || ["en"];
  if (!availableLanguages.includes(language)) {
    throw error(404, "Not Found");
  }

  try {
    // Check redirect cache first (production only)
    if (process.env.NODE_ENV === "production") {
      const cached = _redirectCache.get(language);
      if (cached && Date.now() - cached.ts < REDIRECT_CACHE_TTL) {
        throw redirect(302, cached.url);
      }
    }

    // Only initialize if system isn't ready yet
    if (!isSystemReady()) {
      await contentSystem.initialize(tenantId);
    }

    // Get robust redirect URL for first collection
    // This returns /${language}/${collectionId}, which then canonically redirects
    // to the pretty path in [...collection]/+page.server.ts
    const redirectUrl = await contentSystem.getFirstCollectionRedirectUrl(language, tenantId);

    if (redirectUrl) {
      _redirectCache.set(language, { url: redirectUrl, ts: Date.now() });
      throw redirect(302, redirectUrl);
    }

    // Fallback if no collections found - go to collection builder
    logger.warn("[Language Redirect] No collections found for redirection, using builder fallback");
    throw redirect(302, "/config/collectionbuilder");
  } catch (err) {
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
