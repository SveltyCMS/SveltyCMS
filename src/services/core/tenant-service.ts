/**
 * @file src/services/core/tenant-service.ts
 * @description specialized service for managing Multi-Tenancy operations
 *
 * Responsibilities:
 * - Creating new tenants (linked to an owner)
 * - Cascade-deleting a tenant and all of its associated data
 * - Reading a tenant and seeding the in-memory plan registry
 */
import { withSystemScope } from "@src/databases/system-tenant-scope";

/** Cached lazy handle to the DB module — one module-registry lookup instead of one per call. */
let dbModulePromise: Promise<typeof import("@src/databases/db")> | undefined;
function loadDbModule(): Promise<typeof import("@src/databases/db")> {
  return (dbModulePromise ??= import("@src/databases/db"));
}

import type { Tenant, TenantQuota } from "@src/databases/db-interface";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { seedTenantPlan } from "@utils/rate-limit/tenant-plan";

// Default quotas for new tenants
const DEFAULT_QUOTAS: TenantQuota = {
  maxUsers: 5,
  maxStorageBytes: 25 * 1024 * 1024, // 25MB limit for Demo Mode
  maxCollections: 10,
  maxApiRequestsPerMonth: 10_000,
};

/**
 * Multi-Tenancy Management Service
 */
export class TenantService {
  constructor() {}

  private async getDbAdapter() {
    const { dbAdapter } = await loadDbModule();
    return dbAdapter;
  }

  /**
   * Create a new Tenant for a user.
   * Typically called during Registration when MULTI_TENANT=true.
   */
  public async createTenant(name: string, ownerId: string, fixedId?: string): Promise<Tenant> {
    try {
      const tenantData = {
        name,
        ownerId,
        status: "active" as const,
        plan: "free" as const,
        quota: DEFAULT_QUOTAS,
        usage: {
          usersCount: 1, // Owner is the first user
          storageBytes: 0,
          collectionsCount: 0,
          apiRequestsMonth: 0,
          lastUpdated: new Date(),
        },
      };

      const dataToSave = fixedId ? { ...tenantData, _id: fixedId } : tenantData;

      const dbAdapter = await this.getDbAdapter();
      if (!dbAdapter) {
        throw new Error("Database adapter not initialized");
      }
      const result = await dbAdapter.system.tenants.create(dataToSave as any);

      if (!result.success) {
        throw result.error || new Error("Failed to create tenant");
      }
      if (!result.data) {
        throw new Error("Failed to create tenant: No data returned");
      }

      logger.info(`New Tenant created: ${name} (${result.data._id}) for owner ${ownerId}`);
      seedTenantPlan(String(result.data._id), result.data.plan);
      return result.data;
    } catch (err) {
      logger.error("Failed to create tenant", err);
      throw new AppError("Failed to create organization", 500, "CREATE_TENANT_ERROR");
    }
  }

  /**
   * Delete a tenant and all its associated data (cascade delete).
   * Ensures data sovereignty by completely purging the tenant's footprint.
   */
  public async deleteTenant(tenantId: string): Promise<void> {
    if (!tenantId) return;
    const dbAdapter = await this.getDbAdapter();
    if (!dbAdapter) throw new Error("Database adapter not initialized");

    try {
      // Execute a cascade delete of all data matching this tenant ID via CRUD layer
      const options = withSystemScope("bootstrap");

      const tablesToDelete = [
        "auth_users",
        "auth_sessions",
        "auth_tokens",
        "roles",
        "content_nodes",
        "content_drafts",
        "content_revisions",
        "themes",
        "widgets",
        "media_items",
        "system_virtual_folders",
        "system_preferences",
        "svelty_jobs",
        "website_tokens",
        "plugin_pagespeed_results",
        "plugin_states",
        "plugin_migrations",
        "plugin_storage",
        "audit_logs",
      ];

      // Note: we run deletions in parallel for efficiency
      await Promise.allSettled(
        tablesToDelete.map((table) =>
          dbAdapter.crud.deleteMany(table, { tenantId } as any, options),
        ),
      );

      // Finally, delete the tenant record itself
      await dbAdapter.system.tenants.delete(tenantId as any);

      logger.info(`Tenant ${tenantId} and all associated data successfully deleted.`);
    } catch (err) {
      logger.error(`Failed to cascade delete tenant ${tenantId}`, err);
      throw new AppError("Failed to delete organization and its data", 500, "DELETE_TENANT_ERROR");
    }
  }

  /**
   * Get a tenant by its ID.
   */
  public async getTenant(tenantId: string): Promise<Tenant | null> {
    if (!tenantId) {
      return null;
    }
    const dbAdapter = await this.getDbAdapter();
    if (!dbAdapter) {
      return null;
    }
    const result = await dbAdapter.system.tenants.getById(tenantId as any);
    if (!result.success) {
      return null;
    }
    if (result.data) seedTenantPlan(String(result.data._id), result.data.plan);
    return result.data;
  }
}

export const tenantService = new TenantService();
