/**
 * @file src/hooks/handle-content-initialization.ts
 * @description Hardened multi-tenant content initialization with flight deduplication and request-scoped state.
 */

import { redirect, type Handle } from "@sveltejs/kit";
import { contentSystem, ensureContentInitialized } from "@src/content/index.server";
import { logger } from "@utils/logger";
import { getDbInitPromise } from "@src/databases/db";
import { getSetupState, SetupState } from "@utils/server/setup-check";

const WHITELIST_REGEX =
  /^(?:\/[a-z]{2,5}(?:-[a-zA-Z]+)?)?\/(api|config|user|dashboard|mediagallery|login|email-previews)/;

// Cache stampede containment: tracks active in-flight tenant initializations
const tenantInitializationFlights = new Map<string, Promise<void>>();

export const handleContentInitialization: Handle = async ({ event, resolve }) => {
  const { locals, url } = event;
  const { pathname } = url;
  // NOTE: the in-memory content store (contentStore) keys tenant state by
  // `tenantId || "global"`. When multi-tenant is disabled, locals.tenantId is
  // null and the content system stores/reads collections under "global". We keep
  // the fallback below as "default-tenant" for init/flight keying, but the
  // builder-redirect at the bottom is gated off for content routes so the
  // [language]/[...collection] load function (which reads the tenant-agnostic
  // _schemas map) can resolve the collection itself.
  const tenantId = locals.tenantId ? String(locals.tenantId) : "default-tenant";
  // Content routes are language-prefixed (e.g. /en/<collection>) — the route
  // is [language]/[...collection]. Such routes must NOT be redirected to the
  // collection builder by the "fresh install" guard below; the route's own load
  // function resolves (or 404s) the collection.
  const isContentRoute =
    /^\/[a-z]{2,5}(?:-[a-zA-Z]+)?\//.test(pathname) || pathname.includes("/content");

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

    // isContentRoute is computed at the top of this hook (it also gates the
    // builder-redirect in Phase 3). The previous check here tested for the
    // literal string "/[language]/" (a route-pattern placeholder), which never
    // appears in real URLs, so content routes never awaited init.
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
    } else if (collections.length === 0 && !isContentRoute && !WHITELIST_REGEX.test(pathname)) {
      // Fresh-install UX: send admins with no collections to the builder. This
      // MUST NOT fire for content routes (/[language]/[...collection]) — those
      // resolve the collection themselves and would otherwise be hijacked to
      // the builder whenever the in-memory store lags behind the DB/files.
      if (locals.isAdmin) {
        throw redirect(302, "/config/collectionbuilder");
      } else {
        throw redirect(302, "/user/profile");
      }
    }
  }

  return resolve(event);
};
