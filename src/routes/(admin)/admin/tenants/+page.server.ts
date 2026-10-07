/**
 * @file src/routes/(admin)/admin/tenants/+page.server.ts
 * @description
 * Server-side logic for tenant management.
 * Enforces strict system administrative authorization on page load and status toggle actions.
 * Uses the database-agnostic adapter (dbAdapter.system.tenants) for multi-DB compatibility.
 */

import { error, redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";

/** Cached lazy handle to the DB module — one module-registry lookup instead of one per call. */
let dbModulePromise: Promise<typeof import("@src/databases/db")> | undefined;
function loadDbModule(): Promise<typeof import("@src/databases/db")> {
  return (dbModulePromise ??= import("@src/databases/db"));
}

import type { PageServerLoad } from "./$types";

// Only System Admins can access this
export const load: PageServerLoad = async ({ locals }) => {
  const user = getAuthenticatedUser(locals);
  const { isAdmin } = locals;
  if (!isAdmin || user.tenantId) throw redirect(303, "/");

  try {
    // Resolve the CURRENT adapter + await boot: a mid-flight testing-API reset
    // replaces the adapter, so a stale `locals.dbAdapter` reference can be
    // mid-reconnect here ("Database connection not established" 500s).
    const { dbAdapter, getDbInitPromise } = await loadDbModule();
    await getDbInitPromise(false, "CORE");
    if (!dbAdapter) {
      logger.error("Database adapter not available");
      throw error(500, "Database adapter not available");
    }

    const result = await dbAdapter.system.tenants.list({
      sort: { createdAt: "desc" },
    });

    if (!result.success) {
      logger.error("Failed to list tenants", result.error);
      throw error(500, result.message || "Failed to load tenants");
    }

    return {
      tenants: result.data,
    };
  } catch (err) {
    // Re-throw redirects and HTTP errors
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    logger.error("Failed to load tenants", err);
    throw error(500, "Failed to load tenants");
  }
};
