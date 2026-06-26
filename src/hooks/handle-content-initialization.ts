/**
 * @file src/hooks/handle-content-initialization.ts
 * @description Hardened multi-tenant content initialization with flight deduplication and request-scoped state.
 */

import { redirect, type Handle } from "@sveltejs/kit";
import { contentSystem, ensureContentInitialized } from "@src/content/index.server";
import { logger } from "@utils/logger";
import { getDbInitPromise } from "@src/databases/db";
import { getSetupState, SetupState } from "../utils/server/setup-check";

// Expose contentSystem on globalThis so server-side code (like db-init.ts)
// that can't statically import .server.ts files can access it
(globalThis as any).__contentSystem__ = contentSystem;

const WHITELIST_REGEX =
  /^(?:\/[a-z]{2,5}(?:-[a-zA-Z]+)?)?\/(api|config|user|dashboard|mediagallery|login|email-previews)/;

// Cache stampede containment: tracks active in-flight tenant initializations
const tenantInitializationFlights = new Map<string, Promise<void>>();

export const handleContentInitialization: Handle = async ({ event, resolve }) => {
  const { locals, url } = event;
  const { pathname } = url;
  const tenantId = locals.tenantId ? String(locals.tenantId) : "default-tenant";

  // Phase 1: Gated initialization (static import — no per-request dynamic import)
  const setupState = (locals as any).__setupState || (await getSetupState());
  (locals as any).__setupConfigExists = setupState !== SetupState.MISSING_CONFIG;

  if (setupState !== SetupState.COMPLETE) {
    logger.debug("[handleContentInitialization] System in SETUP mode. Skipping content init.");
    return await resolve(event);
  }

  await getDbInitPromise(false, "CORE");

  // Phase 2: Coalesced content system initialization (prevents thundering herd)
  if (!contentSystem.isInitializedForTenant(tenantId)) {
    let initPromise = tenantInitializationFlights.get(tenantId);

    if (!initPromise) {
      initPromise = ensureContentInitialized(tenantId, false)
        .catch((err) => {
          logger.error(
            `[handleContentInitialization] Tenant init crashed for ${tenantId}: ${err.message}`,
          );
        })
        .finally(() => {
          tenantInitializationFlights.delete(tenantId);
        });
      tenantInitializationFlights.set(tenantId, initPromise);
    }

    const isContentRoute = pathname.includes("/[language]/") || pathname.includes("/content");
    const isApi = pathname.startsWith("/api") && !pathname.includes("/system/");

    if (locals.user && (isContentRoute || isApi)) {
      await initPromise;
    }
  }

  // Phase 3: Auth & fresh install redirects (no global store — request-scoped only)
  if (locals.user) {
    let collections = contentSystem.getCollections(tenantId);

    if (collections.length === 0 && !contentSystem.isInitializedForTenant(tenantId)) {
      let activeFlight = tenantInitializationFlights.get(tenantId);
      if (!activeFlight) {
        activeFlight = contentSystem.initialize(tenantId, false).finally(() => {
          tenantInitializationFlights.delete(tenantId);
        });
        tenantInitializationFlights.set(tenantId, activeFlight);
      }
      await activeFlight;
      collections = contentSystem.getCollections(tenantId);
    }

    if (pathname === "/") {
      if (collections.length > 0) {
        const lang = (locals as any).language || "en";
        const firstUrl = await contentSystem.getFirstCollectionRedirectUrl(lang, tenantId);
        if (firstUrl) throw redirect(302, firstUrl);
      }
    } else if (collections.length === 0 && !WHITELIST_REGEX.test(pathname)) {
      if (locals.isAdmin) {
        throw redirect(302, "/config/collectionbuilder");
      } else {
        throw redirect(302, "/user/profile");
      }
    }
  }

  return resolve(event);
};
