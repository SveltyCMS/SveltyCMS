/**
 * @file src/routes/(admin)/admin/tenants/tenants-actions.server.ts
 * @description Tenant Management Actions.
 * Uses the database-agnostic adapter for multi-DB compatibility.
 *
 * ### Features:
 * - Create tenants with the free-plan quota
 * - Toggle tenant status between active and suspended
 * - Fail-closed validation before any adapter call
 */

import type { DatabaseId, DatabaseResult, IDBAdapter, Tenant } from "@src/databases/db-interface";
import { raise, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { generateUUID } from "@utils/native-utils";

export interface ToggleTenantStatusInput {
  tenantId: string;
  status: Tenant["status"];
}

export interface CreateTenantInput {
  name: string;
}

/** Only these statuses may be toggled from the admin UI. */
const TOGGLEABLE_STATUSES: ReadonlySet<Tenant["status"]> = new Set(["active", "suspended"]);

export const toggleTenantStatus = async (data: ToggleTenantStatusInput, dbAdapter: IDBAdapter) => {
  const { tenantId, status } = data;

  if (!tenantId || !TOGGLEABLE_STATUSES.has(status)) {
    raise(400, "Invalid parameters", "BAD_REQUEST");
  }

  let result: DatabaseResult<Tenant>;
  try {
    result = await dbAdapter.system.tenants.update(tenantId as DatabaseId, { status });
  } catch (err) {
    rethrow(err);
    logger.error(`Failed to update tenant status ${tenantId}`, err);
    raise(500, "Update failed", "INTERNAL_SERVER_ERROR");
  }

  if (!result.success) {
    logger.error(`Failed to update tenant status ${tenantId}`, result.error);
    raise(500, result.message || "Update failed", "INTERNAL_SERVER_ERROR");
  }

  return { success: true };
};

export const createTenant = async (data: CreateTenantInput, dbAdapter: IDBAdapter) => {
  if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
    raise(400, "Tenant name is required", "BAD_REQUEST");
  }

  let result: DatabaseResult<Tenant>;
  try {
    const ownerId = generateUUID() as DatabaseId;
    result = await dbAdapter.system.tenants.create({
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
    });
  } catch (err) {
    rethrow(err);
    logger.error("Failed to create tenant", err);
    raise(500, "Failed to create tenant", "INTERNAL_SERVER_ERROR");
  }

  if (!result.success) {
    logger.error("Failed to create tenant", result.error);
    raise(500, result.message || "Failed to create tenant", "INTERNAL_SERVER_ERROR");
  }

  return { success: true, tenant: result.data };
};
