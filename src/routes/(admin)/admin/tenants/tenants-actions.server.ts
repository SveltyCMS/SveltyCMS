/**
 * @file src/routes/(admin)/admin/tenants/tenants-actions.server.ts
 * @description Tenant Management Actions.
 * Uses the database-agnostic adapter for multi-DB compatibility.
 */

import type { IDBAdapter } from "@src/databases/db-interface";

export const toggleTenantStatus = async (data: any, dbAdapter: IDBAdapter) => {
  const { error } = await import("@sveltejs/kit");
  const { logger } = await import("@utils/logger");
  const { tenantId, status } = data;

  if (!tenantId || !["active", "suspended"].includes(status)) {
    throw error(400, "Invalid parameters");
  }

  try {
    const result = await dbAdapter.system.tenants.update(tenantId, {
      status,
    } as any);
    if (!result.success) {
      logger.error(`Failed to update tenant status ${tenantId}`, result.error);
      throw error(500, result.message || "Update failed");
    }
    return { success: true };
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    logger.error(`Failed to update tenant status ${tenantId}`, err);
    throw error(500, "Update failed");
  }
};
