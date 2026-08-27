/**
 * @file src/hooks/handle-local-context.ts
 * @description
 * Unified local context middleware combining zero-latency SDK binding (`locals.cms`)
 * and multi-tenant content system initialization into a single atomic middleware step.
 *
 * Consolidates `handleLocalSdk` + `handleContentInitialization` into one async handle,
 * eliminating redundant middleware promise-wrapping and microtask hopping per request.
 */

import { redirect } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { getDbInitPromise, dbAdapter, isDbConnected } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import { contentSystem, ensureContentInitialized } from "@src/content/index.server";
import { getRequestFlags } from "@utils/hook-utils";
import { logger } from "@utils/logger";
import { getSetupState, SetupState } from "@utils/server/setup-check";

const WHITELIST_REGEX =
  /^(?:\/[a-z]{2,5}(?:-[a-zA-Z]+)?)?\/(api|config|user|dashboard|mediagallery|login|email-previews|admin|setup)(?:\/|$)/;

const tenantInitializationFlights = new Map<string, Promise<void>>();

export const handleLocalContext: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;
  const { locals } = event;
  const flags = getRequestFlags(locals as any);

  // Short-circuit for static assets and health checks
  if (flags.isStatic || pathname === "/api/system/health" || pathname === "/health") {
    return resolve(event);
  }

  // 1. Bind LocalCMS SDK (locals.cms)
  if (!(locals as any).cms) {
    try {
      if (dbAdapter) {
        const activeAdapter = (locals as any).dbAdapter || dbAdapter;
        (locals as any).cms = LocalCMS.getLocals(activeAdapter, locals);
      } else {
        await getDbInitPromise();
        if (dbAdapter) {
          const activeAdapter = (locals as any).dbAdapter || dbAdapter;
          (locals as any).cms = LocalCMS.getLocals(activeAdapter, locals);
        }
      }
    } catch (dbError: any) {
      logger.error(`[LocalContext] Database boot failed: ${dbError.message}`);
      if (!pathname.startsWith("/api/")) {
        (locals as any).dbInitializationError = dbError.message || String(dbError);
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Database adapter unavailable",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
    }
  }

  // 2. Content System Initialization
  const tenantId = locals.tenantId ? String(locals.tenantId) : null;
  const setupState = (locals as any).__setupState || (await getSetupState());
  (locals as any).__setupConfigExists = setupState !== SetupState.MISSING_CONFIG;

  if (setupState !== SetupState.COMPLETE) {
    return resolve(event);
  }

  if (!isDbConnected()) {
    await getDbInitPromise(false, "CORE");
  }

  if (tenantId && !contentSystem.isInitializedForTenant(tenantId)) {
    let initPromise = tenantInitializationFlights.get(tenantId);
    if (!initPromise) {
      initPromise = ensureContentInitialized(tenantId, false)
        .catch((err) => {
          logger.error(`[LocalContext] Tenant init crashed for ${tenantId}: ${err.message}`);
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

  // Auth & fresh install redirects for SSR page routes
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
