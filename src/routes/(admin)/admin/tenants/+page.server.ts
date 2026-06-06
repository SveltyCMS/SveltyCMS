/**
 * @file src/routes/(admin)/admin/tenants/+page.server.ts
 * @description
 * Server-side logic for tenant management.
 * Enforces strict system administrative authorization on page load and status toggle actions.
 */

import { TenantModel } from "@src/databases/mongodb/tenant";
import { error, redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";

import type { PageServerLoad } from "./$types";

// Only System Admins can access this
export const load: PageServerLoad = async ({ locals }) => {
  const { user, isAdmin } = locals;

  if (!user) throw redirect(302, "/login");
  if (!isAdmin || user.tenantId) throw redirect(303, "/");

  try {
    const tenants = await TenantModel.find({}).sort({ createdAt: -1 }).lean();

    return {
      tenants: JSON.parse(JSON.stringify(tenants)),
    };
  } catch (err) {
    logger.error("Failed to load tenants", err);
    throw error(500, "Failed to load tenants");
  }
};
