/**
 * @file src/hooks/handle-content-initialization.ts
 * @description
 * Hardened multi-tenant content initialization with flight deduplication and request-scoped state.
 *
 * ### Features:
 * - Coalesced per-tenant `ensureContentInitialized` (stampede protection)
 * - Fresh-install redirects (admin → collectionbuilder, others → profile)
 * - Whitelist for zero-collection routes (setup, admin, config, …)
 * - Static imports only — no per-request dynamic import microtasks
 */

import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { contentSystem, ensureContentInitialized } from "@src/content/index.server";
import { logger } from "@utils/logger";
import { getDbInitPromise, isDbConnected } from "@src/databases/db";
import { getSetupState, SetupState } from "@utils/server/setup-check";

// Routes reachable with zero collections (fresh install / E2E after seed).
// /admin must be included so tenant management is not redirected to collectionbuilder.
// `(?:/|$)` boundary prevents prefix false-positives (e.g. /administrator must
// NOT match `admin`). The optional locale prefix is consumed BEFORE the check.
const WHITELIST_REGEX =
  /^(?:\/[a-z]{2,5}(?:-[a-zA-Z]+)?)?\/(api|config|user|dashboard|mediagallery|login|email-previews|admin|setup)(?:\/|$)/;

// Cache stampede containment: tracks active in-flight tenant initializations
const tenantInitializationFlights = new Map<string, Promise<void>>();

export const handleContentInitialization: Handle = async ({ event, resolve }) => {
  const { locals, url } = event;
  const { pathname } = url;
  const tenantId = locals.tenantId ? String(locals.tenantId) : null;

  // Phase 1: Gated initialization (static import — no per-request dynamic import)
  const setupState = (locals as any).__setupState || (await getSetupState());
  (locals as any).__setupConfigExists = setupState !== SetupState.MISSING_CONFIG;

  if (setupState !== SetupState.COMPLETE) {
    logger.debug("[handleContentInitialization] System in SETUP mode. Skipping content init.");
    return await resolve(event);
  }

  // Resolved-promise await still costs a microtask per request. Skip once booted.
  if (!isDbConnected()) {
    await getDbInitPromise(false, "CORE");
  }

  // Phase 2: Coalesced content system initialization (prevents thundering herd)
  if (tenantId && !contentSystem.isInitializedForTenant(tenantId)) {
    let initPromise = tenantInitializationFlights.get(tenantId);

    if (!initPromise) {
      initPromise = ensureContentInitialized(tenantId, false)
        .catch((err) => {
          logger.error(
            `[handleContentInitialization] Tenant init crashed for ${tenantId}: ${err.message}`,
          );
        })
        .finally(() => {
          tenantInitializationFlights.delete(tenantId!);
        });
      tenantInitializationFlights.set(tenantId, initPromise);
    }

    const isContentRoute =
      /^\/[a-z]{2,5}(?:-[a-zA-Z]+)?\//.test(pathname) || pathname.includes("/content");
    const isApi = pathname.startsWith("/api") && !pathname.includes("/system/");

    if (locals.user && (isContentRoute || isApi || pathname === "/")) {
      await initPromise;
    }
  }

  // Phase 3: Auth & fresh install redirects (no global store — request-scoped only)
  // API routes never redirect to collectionbuilder — skip the collection scan.
  if (locals.user && !WHITELIST_REGEX.test(pathname)) {
    let collections = contentSystem.getCollections(tenantId);

    if (collections.length === 0 && !contentSystem.isInitializedForTenant(tenantId)) {
      const flightKey = tenantId || "global";
      let activeFlight = tenantInitializationFlights.get(flightKey);
      if (!activeFlight) {
        activeFlight = contentSystem.initialize(tenantId, false).finally(() => {
          tenantInitializationFlights.delete(flightKey);
        });
        tenantInitializationFlights.set(flightKey, activeFlight);
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
