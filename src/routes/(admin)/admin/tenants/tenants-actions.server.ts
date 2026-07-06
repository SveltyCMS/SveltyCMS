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

export const createTenant = async (data: { name: string }, dbAdapter: IDBAdapter) => {
  const { error } = await import("@sveltejs/kit");
  const { logger } = await import("@utils/logger");
  const { generateUUID } = await import("@utils/native-utils");

  if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
    throw error(400, "Tenant name is required");
  }

  try {
    const ownerId = generateUUID();
    const result = await dbAdapter.system.tenants.create({
      name: data.name.trim(),
      ownerId,
      plan: "free",
      status: "active",
      quota: {
        maxApiRequestsPerMonth: 10000,
        maxCollections: 20,
        maxStorageBytes: 5368709120, // 5 GB
        maxUsers: 10,
      },
      usage: {
        apiRequestsMonth: 0,
        collectionsCount: 0,
        lastUpdated: new Date(),
        storageBytes: 0,
        usersCount: 0,
      },
    } as any);

    if (!result.success) {
      logger.error("Failed to create tenant", result.error);
      throw error(500, result.message || "Failed to create tenant");
    }

    return { success: true, tenant: result.data };
  } catch (err: any) {
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }
    logger.error("Failed to create tenant", err);
    throw error(500, "Failed to create tenant");
  }
};
