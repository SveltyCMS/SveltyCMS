/**
 * @file src/routes/(admin)/admin/tenants/+page.server.ts
 * @description
 * Server-side logic for tenant management.
 * Enforces strict system administrative authorization on page load and status toggle actions.
 */

import { TenantModel } from "@src/databases/mongodb/tenant";
import { error, redirect } from "@sveltejs/kit";
import { logger } from "@utils/logger";

import type { Actions, PageServerLoad } from "./$types";

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

export const actions: Actions = {
  // Action to suspend/activate a tenant
  toggleStatus: async ({ request, locals }) => {
    const { user, isAdmin } = locals;

    if (!user || !isAdmin || user.tenantId) {
      throw error(403, "Forbidden");
    }

    const formData = await request.formData();
    const tenantId = formData.get("tenantId") as string;
    const status = formData.get("status") as string;

    if (!tenantId || !["active", "suspended"].includes(status)) {
      throw error(400, "Invalid parameters");
    }

    try {
      await TenantModel.updateOne({ _id: tenantId }, { status });
      return { success: true };
    } catch (err) {
      logger.error(`Failed to update tenant status ${tenantId}`, err);
      throw error(500, "Update failed");
    }
  },
};
