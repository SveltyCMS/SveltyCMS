/**
 * @file src/hooks/handle-local-sdk.ts
 * @description Injects the database-agnostic SveltyCMS instance into locals
 * for zero-latency, full-stack SvelteKit integration.
 */

import { getDbInitPromise, dbAdapter } from "@src/databases/db";
import { LocalCMS } from "@src/services/local-cms";
import type { Handle } from "@sveltejs/kit";

export const handleLocalSdk: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // 🚀 PERFORMANCE: Skip SDK injection for health checks
  if (pathname === "/api/system/health" || pathname === "/health") {
    return resolve(event);
  }

  // Ensure DB is ready
  await getDbInitPromise();

  if (dbAdapter) {
    // Attach clean Local SDK using the new helper
    event.locals.cms = LocalCMS.getLocals(dbAdapter, event.locals) as any;
  }

  return resolve(event);
};
