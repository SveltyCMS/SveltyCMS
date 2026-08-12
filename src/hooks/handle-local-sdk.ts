/**
 * @file src/hooks/handle-local-sdk.ts
 * @description
 * Hardened SDK injection with error boundaries and static-asset short-circuiting.
 *
 * Injects `locals.cms` (LocalCMS) for zero-latency server-side SDK calls.
 * Prefers the request-scoped tenant adapter (`locals.dbAdapter`) when an
 * upstream hook (authentication) bound one, falling back to the global
 * adapter. API routes get JSON 503 when the DB adapter is unavailable;
 * page routes surface a soft error flag for UI recovery.
 */

import { getDbInitPromise, dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import type { Handle } from "@sveltejs/kit";
import { getRequestFlags } from "@utils/hook-utils";
import { logger } from "@utils/logger";

export const handleLocalSdk: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;
  const { locals } = event;

  // Short-circuit for static assets and health checks
  const flags = getRequestFlags(locals as any);
  if (flags.isStatic || pathname === "/api/system/health" || pathname === "/health") {
    return resolve(event);
  }

  try {
    // 🚀 FAST-PATH: if the adapter is already booted, skip the getDbInitPromise
    // await entirely (getDbInitPromise may still incur a microtask/promise hop).
    if (dbAdapter) {
      // Prefer the request-scoped tenant adapter bound by the authentication
      // hook — the global adapter would drop tenant isolation for this request.
      const activeAdapter = (locals as any).dbAdapter || dbAdapter;
      (locals as any).cms = LocalCMS.getLocals(activeAdapter, { ...locals });
      return resolve(event);
    }

    await getDbInitPromise();

    if (dbAdapter) {
      const activeAdapter = (locals as any).dbAdapter || dbAdapter;
      // Shallow copy to prevent cross-request reference bleed
      (locals as any).cms = LocalCMS.getLocals(activeAdapter, { ...locals });
    }
  } catch (dbError: any) {
    logger.error(`[LocalSDK] Database boot failed: ${dbError.message}`);

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

  return resolve(event);
};
