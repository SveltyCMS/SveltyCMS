/**
 * @file src/hooks/handle-local-sdk.ts
 * @description Hardened SDK injection with error boundaries and static-asset short-circuiting.
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
    await getDbInitPromise();

    if (dbAdapter) {
      // Shallow copy to prevent cross-request reference bleed
      (locals as any).cms = LocalCMS.getLocals(dbAdapter, { ...locals });
    }
  } catch (dbError: any) {
    if (process.env.NODE_ENV !== "test") {
      logger.error(`[LocalSDK] Database boot failed: ${dbError.message}`);
    }

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
