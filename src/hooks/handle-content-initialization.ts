/**
 * @file src/hooks/handle-content-initialization.ts
 * @description Initializes content manager per tenant + handles fresh-install redirects
 */

import { redirect, type Handle } from "@sveltejs/kit";
import { isBootstrapRoute, isSetupCompleteAsync } from "@utils/setup-check";
import { contentSystem } from "@src/content/index.server";
import { logger } from "@utils/logger.server";
import { getDbInitPromise } from "@src/databases/db";
import { app } from "@src/stores/store.svelte";

// 🚀 OPTIMIZATION: Compile Regex once globally.
// Matches unlocalized (e.g., /api) and localized (e.g., /en-US/api) paths.
const WHITELIST_REGEX =
  /^(?:\/[a-z]{2,5}(?:-[a-zA-Z]+)?)?\/(api|config|user|dashboard|mediagallery|login)/;

export const handleContentInitialization: Handle = async ({ event, resolve }) => {
  // Ensure system is fully initialized for content requests
  await getDbInitPromise(false, "FULL");

  const { locals, url } = event;
  const { pathname } = url;
  const tenantId = locals.tenantId ?? null;

  // --- Phase 1: Gated Initialization ---
  if (locals.__setupConfigExists === undefined) {
    locals.__setupConfigExists = await isSetupCompleteAsync();
  }

  if (!locals.__setupConfigExists) {
    logger.debug(
      "[handleContentInitialization] System in SETUP mode. Skipping content initialization.",
    );
    return await resolve(event);
  }

  // --- Phase 2: Content System Initialization ---
  if (!contentSystem.isInitializedForTenant(tenantId)) {
    // 🛡️ SAFETY: Use a shared promise to prevent initialization storms
    const initPromise = contentSystem.initialize(tenantId, false).catch((err) => {
      logger.error(`[handleContentInitialization] Init failed for tenant ${tenantId}:`, err);
    });

    // Await initialization for authenticated requests, API routes, or specific bootstrap routes
    if (
      locals.user ||
      pathname.startsWith("/api") ||
      (isBootstrapRoute(pathname) && pathname !== "/" && !pathname.includes("dashboard"))
    ) {
      logger.info(`[handleContentInitialization] Awaiting content system sync for ${pathname}...`);
      await initPromise;
    } else {
      logger.debug(`[handleContentInitialization] Fast-tracking bootstrap page: ${pathname}`);
    }
  }

  // --- Phase 3: Auth & Fresh Install Redirects ---
  if (locals.user) {
    const collections = contentSystem.getCollections(tenantId);

    // 1. Root Routing (Highest Priority)
    if (pathname === "/") {
      if (collections.length > 0) {
        const lang = (locals as any).language || app?.contentLanguage || "en";
        const firstUrl = await contentSystem.getFirstCollectionRedirectUrl(lang, tenantId);
        if (firstUrl) {
          logger.info(`[handleContentInitialization] Root -> first collection: ${firstUrl}`);
          throw redirect(302, firstUrl);
        }
      }
      // If no collections, we let it fall through to the fresh install logic below.
    }
    // 2. Fresh Install / No Collections logic
    else if (collections.length === 0 && !WHITELIST_REGEX.test(pathname)) {
      if (locals.isAdmin) {
        logger.info(
          `[handleContentInitialization] No collections for tenant: ${tenantId}. Redirecting Admin to builder.`,
        );
        throw redirect(302, "/config/collectionbuilder");
      } else {
        logger.info(
          `[handleContentInitialization] No collections for tenant: ${tenantId}. Redirecting to dashboard.`,
        );
        throw redirect(302, "/dashboard");
      }
    }
  }

  return resolve(event);
};
