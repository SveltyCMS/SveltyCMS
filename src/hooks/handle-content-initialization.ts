/**
 * @file src/hooks/handle-content-initialization.ts
 * @description Initializes content manager per tenant + handles fresh-install redirects
 */

import { redirect, type Handle } from "@sveltejs/kit";
import { isSetupCompleteAsync } from "@utils/setup-check";
import { contentSystem } from "@src/content/index.server";
import { logger } from "@utils/logger.server";
import { getDbInitPromise } from "@src/databases/db";
import { app } from "@src/stores/store.svelte";

// 🚀 OPTIMIZATION: Compile Regex once globally.
// Matches unlocalized (e.g., /api) and localized (e.g., /en-US/api) paths.
const WHITELIST_REGEX =
  /^(?:\/[a-z]{2,5}(?:-[a-zA-Z]+)?)?\/(api|config|user|dashboard|mediagallery|login)/;

export const handleContentInitialization: Handle = async ({ event, resolve }) => {
  // Ensure system is ready for core operations (Login/Auth)
  // FULL phase is now handled in the background by db.ts
  await getDbInitPromise(false, "CORE");

  const { locals, url } = event;
  const { pathname } = url;
  const tenantId = locals.tenantId ?? null;

  // --- Phase 1: Gated Initialization ---
  const setupState = (locals as any).__setupState || (await isSetupCompleteAsync());
  locals.__setupConfigExists = setupState !== "MISSING_CONFIG";

  if (setupState !== "COMPLETE") {
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

    // Await initialization ONLY for content-specific routes or API calls
    // Dashboard and Config Builder are fast-tracked to improve perceived performance
    const isContentRoute = pathname.includes("/[language]/") || pathname.includes("/content");
    const isApi = pathname.startsWith("/api") && !pathname.includes("/system/");

    if (locals.user && (isContentRoute || isApi)) {
      logger.info(`[handleContentInitialization] Awaiting content system sync for ${pathname}...`);
      await initPromise;
    } else {
      logger.debug(`[handleContentInitialization] Fast-tracking initialization for: ${pathname}`);
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
        throw redirect(302, "/user/profile");
      }
    }
  }

  return resolve(event);
};
