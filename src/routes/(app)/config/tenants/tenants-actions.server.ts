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

export interface DeleteTenantInput {
  tenantId: string;
  currentTenantId?: string | null;
}

/** Only these statuses may be toggled from the admin UI. */
const TOGGLEABLE_STATUSES: ReadonlySet<Tenant["status"]> = new Set(["active", "suspended"]);

const PLAN_QUOTAS: Record<"free" | "pro" | "enterprise", TenantQuota> = {
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

async function runTenantMutation<T>(
  failureLabel: string,
  fn: () => Promise<DatabaseResult<T>>,
  fallbackMessage = failureLabel,
): Promise<T> {
  let result: DatabaseResult<T>;
  try {
    result = await fn();
  } catch (err) {
    rethrow(err);
    logger.error(failureLabel, err);
    raise(500, fallbackMessage, "INTERNAL_SERVER_ERROR");
  }

  if (!result.success) {
    logger.error(failureLabel, result.error);
    raise(500, result.message || fallbackMessage, "INTERNAL_SERVER_ERROR");
  }

  return result.data as T;
}

export const toggleTenantStatus = async (data: ToggleTenantStatusInput, dbAdapter: IDBAdapter) => {
  const { tenantId, status } = data;

  if (!tenantId || !TOGGLEABLE_STATUSES.has(status)) {
    raise(400, "Invalid parameters", "BAD_REQUEST");
  }

  await runTenantMutation(
    `Failed to update tenant status ${tenantId}`,
    () => dbAdapter.system.tenants.update(tenantId as DatabaseId, { status }),
    "Update failed",
  );

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

  const tenant = await runTenantMutation(
    `Failed to update tenant ${tenantId}`,
    () => dbAdapter.system.tenants.update(tenantId as DatabaseId, patch),
    "Failed to update tenant",
  );

  return { success: true, tenant };
};

export const createTenant = async (data: CreateTenantInput, dbAdapter: IDBAdapter) => {
  if (!data.name || typeof data.name !== "string" || data.name.trim().length === 0) {
    raise(400, "Tenant name is required", "BAD_REQUEST");
  }

  const plan = data.plan || "free";
  const chosenDefault = PLAN_QUOTAS[plan] ?? PLAN_QUOTAS.free;
  const mergedQuota: TenantQuota = {
    ...chosenDefault,
    ...data.quota,
  };

  const tenant = await runTenantMutation(
    "Failed to create tenant",
    () => {
      const ownerId = generateUUID() as DatabaseId;
      return dbAdapter.system.tenants.create({
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
    },
    "Failed to create tenant",
  );

  return { success: true, tenant };
};

export const deleteTenant = async (data: DeleteTenantInput, dbAdapter: IDBAdapter) => {
  const tenantId = typeof data?.tenantId === "string" ? data.tenantId.trim() : "";
  if (!tenantId) {
    raise(400, "Tenant ID is required", "BAD_REQUEST");
  }

  if (data.currentTenantId && tenantId === String(data.currentTenantId)) {
    raise(400, "Cannot delete the active tenant workspace", "BAD_REQUEST");
  }

  const existing = await dbAdapter.system.tenants.getById(tenantId as DatabaseId);
  if (!existing.success || !existing.data) {
    raise(404, "Tenant not found", "NOT_FOUND");
  }

  try {
    const { tenantService } = await import("@src/services/core/tenant-service");
    await tenantService.deleteTenant(tenantId, dbAdapter);
    return { success: true };
  } catch (err) {
    rethrow(err);
    logger.error(`Failed to delete tenant ${tenantId}`, err);
    raise(500, "Failed to delete tenant", "INTERNAL_SERVER_ERROR");
  }
};
