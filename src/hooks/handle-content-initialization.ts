/**
 * @file src/hooks/handle-content-initialization.ts
 * @description Initializes content manager per tenant + handles fresh-install redirects
 */

import { redirect, type Handle } from "@sveltejs/kit";
import { contentSystem } from "@src/content/index.server";
import { logger } from "@utils/logger";
import { getDbInitPromise } from "@src/databases/db";
import { app } from "@src/stores/store.svelte";

// 🚀 OPTIMIZATION: Compile Regex once globally.
// Matches unlocalized (e.g., /api) and localized (e.g., /en-US/api) paths.
const WHITELIST_REGEX =
  /^(?:\/[a-z]{2,5}(?:-[a-zA-Z]+)?)?\/(api|config|user|dashboard|mediagallery|login)/;

// Module-level cache for initialization promises to prevent "storms"
const initPromises = new Map<string | null, Promise<void>>();

export const handleContentInitialization: Handle = async ({
  event,
  resolve,
}) => {
  const { locals, url } = event;
  const { pathname } = url;
  const tenantId = locals.tenantId ?? null;

  // --- Phase 1: Gated Initialization ---
  const { getSetupState, SetupState } = await import("@utils/setup-check");
  const setupState = (locals as any).__setupState || (await getSetupState());
  locals.__setupConfigExists = setupState !== SetupState.MISSING_CONFIG;

  if (setupState !== SetupState.COMPLETE) {
    logger.debug(
      "[handleContentInitialization] System in SETUP mode. Skipping content initialization.",
    );
    return await resolve(event);
  }

  // Ensure system is ready for core operations (Login/Auth)
  // FULL phase is now handled in the background by db.ts
  await getDbInitPromise(false, "CORE");

  // --- Phase 2: Content System Initialization ---
  if (!contentSystem.isInitializedForTenant(tenantId)) {
    // 🛡️ SAFETY: Use a shared promise to prevent initialization storms
    let initPromise = initPromises.get(tenantId);

    if (!initPromise) {
      initPromise = (async () => {
        try {
          // Give the DB a moment to finish its OWN internal warm-up if we're coming from a fresh restart
          await getDbInitPromise(false, "CORE");
          await contentSystem.initialize(tenantId, false);
        } catch (err) {
          logger.error(
            `[handleContentInitialization] Init failed for tenant ${tenantId}:`,
            err,
          );
          initPromises.delete(tenantId); // Allow retry on failure
          throw err;
        }
      })().catch((err) => {
        // Prevent unhandled rejection since this promise might not be awaited immediately
        logger.debug(
          `[handleContentInitialization] Background init failed (suppressed unhandled): ${err.message}`,
        );
      }) as Promise<void>;
      initPromises.set(tenantId, initPromise);
    }

    // Await initialization ONLY for content-specific routes or API calls
    // Dashboard and Config Builder are fast-tracked to improve perceived performance
    const isContentRoute =
      pathname.includes("/[language]/") || pathname.includes("/content");
    const isApi = pathname.startsWith("/api") && !pathname.includes("/system/");

    if (locals.user && (isContentRoute || isApi)) {
      logger.info(
        `[handleContentInitialization] Awaiting content system sync for ${pathname}...`,
      );
      await initPromise;
    }
    // else: Fast-tracking initialization (no log in production)
  }

  // --- Phase 3: Auth & Fresh Install Redirects ---
  if (locals.user) {
    let collections = contentSystem.getCollections(tenantId);

    // 🛡️ RECOVERY: If no collections found, double check if we are still initializing
    if (
      collections.length === 0 &&
      !contentSystem.isInitializedForTenant(tenantId)
    ) {
      logger.info(
        `[handleContentInitialization] No collections found yet for ${pathname}. Awaiting sync...`,
      );
      await contentSystem.initialize(tenantId, false);
      collections = contentSystem.getCollections(tenantId);
    }

    // 1. Root Routing (Highest Priority)
    if (pathname === "/") {
      if (collections.length > 0) {
        const lang = (locals as any).language || app?.contentLanguage || "en";
        const firstUrl = await contentSystem.getFirstCollectionRedirectUrl(
          lang,
          tenantId,
        );
        if (firstUrl) {
          logger.info(
            `[handleContentInitialization] Root -> first collection: ${firstUrl}`,
          );
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
