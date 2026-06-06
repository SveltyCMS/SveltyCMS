/**
 * @file src/routes/(admin)/admin/tenants/tenants.remote.ts
 * @description Tenant Management Remote Functions — SvelteKit command wrappers.
 *
 * ### Features:
 * - toggleTenantStatus — suspend or activate a tenant
 */

import { command } from "$app/server";

export const toggleTenantStatus = command(
  "unchecked",
  async ({ tenantId, status }: { tenantId: string; status: "active" | "suspended" }) => {
    const { TenantModel } = await import("@src/databases/mongodb/tenant");
    const { error } = await import("@sveltejs/kit");
    const { logger } = await import("@utils/logger");

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
);
