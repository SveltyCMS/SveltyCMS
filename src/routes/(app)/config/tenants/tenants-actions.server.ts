/**
 * @file src/routes/(app)/config/tenants/tenants-actions.server.ts
 * @description Tenant Management Actions.
 * Uses the database-agnostic adapter for multi-DB compatibility.
 *
 * ### Features:
 * - Create tenants with the free-plan quota
 * - Toggle tenant status between active and suspended
 * - Fail-closed validation before any adapter call
 */

import type {
  DatabaseId,
  DatabaseResult,
  EntityCreate,
  IDBAdapter,
  Tenant,
  TenantQuota,
} from "@src/databases/db-interface";
import { raise, rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { generateUUID } from "@utils/native-utils";

export interface ToggleTenantStatusInput {
  tenantId: string;
  status: Tenant["status"];
}

export interface CreateTenantInput {
  name: string;
  plan?: "free" | "pro" | "enterprise";
  quota?: Partial<TenantQuota>;
}

export interface UpdateTenantInput {
  tenantId: string;
  name?: string;
  plan?: "free" | "pro" | "enterprise";
  quota?: Partial<TenantQuota>;
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

export const updateTenant = async (data: UpdateTenantInput, dbAdapter: IDBAdapter) => {
  const { tenantId, name, plan, quota } = data;
  if (!tenantId) {
    raise(400, "Tenant ID is required", "BAD_REQUEST");
  }

  // Fetch current tenant to merge quota cleanly
  const existing = await dbAdapter.system.tenants.getById(tenantId as DatabaseId);
  if (!existing.success || !existing.data) {
    raise(404, "Tenant not found", "NOT_FOUND");
  }

  const patch: Partial<EntityCreate<Tenant>> = {};
  if (name && typeof name === "string" && name.trim()) {
    patch.name = name.trim();
  }
  if (plan && (plan === "free" || plan === "pro" || plan === "enterprise")) {
    patch.plan = plan;
  }
  if (quota && typeof quota === "object") {
    patch.quota = {
      ...existing.data.quota,
      ...quota,
    };
  }

  try {
    const result = await dbAdapter.system.tenants.update(tenantId as DatabaseId, patch);
    if (!result.success) {
      raise(500, result.message || "Failed to update tenant", "INTERNAL_SERVER_ERROR");
    }
    return { success: true, tenant: result.data };
  } catch (err) {
    rethrow(err);
    logger.error(`Failed to update tenant ${tenantId}`, err);
    raise(500, "Failed to update tenant", "INTERNAL_SERVER_ERROR");
  }
};

export const createTenant = async (data: CreateTenantInput, dbAdapter: IDBAdapter) => {
  if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
    raise(400, "Tenant name is required", "BAD_REQUEST");
  }

  const plan = data.plan || "free";
  const defaultQuotas: Record<string, TenantQuota> = {
    free: {
      maxUsers: 5,
      maxStorageBytes: 26214400, // 25 MB
      maxCollections: 10,
      maxApiRequestsPerMonth: 10000,
    },
    pro: {
      maxUsers: 25,
      maxStorageBytes: 10737418240, // 10 GB
      maxCollections: 50,
      maxApiRequestsPerMonth: 100000,
    },
    enterprise: {
      maxUsers: 100,
      maxStorageBytes: 107374182400, // 100 GB
      maxCollections: 200,
      maxApiRequestsPerMonth: 1000000,
    },
  };

  const chosenDefault = defaultQuotas[plan] || defaultQuotas.free;
  const mergedQuota: TenantQuota = {
    ...chosenDefault,
    ...data.quota,
  };

  let result: DatabaseResult<Tenant>;
  try {
    const ownerId = generateUUID() as DatabaseId;
    result = await dbAdapter.system.tenants.create({
      name: data.name.trim(),
      ownerId,
      plan,
      status: "active",
      quota: mergedQuota,
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
