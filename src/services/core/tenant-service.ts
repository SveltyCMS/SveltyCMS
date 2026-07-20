/**
 * @file src/services/tenant-service.ts
 * @description specialized service for managing Multi-Tenancy operations
 *
 * Responsibilities:
 * - Creating new tenants (linked to an owner)
 * - Enforcing Resource Quotas (limit checks)
 * - Tracking Usage (incrementing counters)
 * - Managing Tenant Lifecycle (suspend/activate)
 */

import type { Tenant, TenantQuota } from "@src/databases/db-interface";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

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
    const { dbAdapter } = await import("@src/databases/db");
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
      const options = { bypassTenantCheck: true };

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
    return result.data;
  }

  /**
   * Check if a tenant has exceeded a specific resource quota.
   * Throws AppError if quota exceeded.
   */
  public async checkQuota(
    tenantId: string,
    resource: keyof TenantQuota,
    currentIncrement = 1,
  ): Promise<void> {
    const dbAdapter = await this.getDbAdapter();
    if (!dbAdapter) {
      return;
    }
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      return;
    }

    // Skip checks for Enterprise plans
    if (tenant.plan === "enterprise") {
      return;
    }

    let usageVal = 0;
    let limitVal = 0;

    switch (resource) {
      case "maxUsers":
        usageVal = tenant.usage.usersCount;
        limitVal = tenant.quota.maxUsers;
        break;
      case "maxStorageBytes":
        usageVal = tenant.usage.storageBytes;
        limitVal = tenant.quota.maxStorageBytes;
        break;
      case "maxCollections":
        usageVal = tenant.usage.collectionsCount;
        limitVal = tenant.quota.maxCollections;
        break;
      case "maxApiRequestsPerMonth":
        usageVal = tenant.usage.apiRequestsMonth;
        limitVal = tenant.quota.maxApiRequestsPerMonth;
        break;
    }

    if (usageVal + currentIncrement > limitVal) {
      logger.warn(`Quota Exceeded for Tenant ${tenantId}: ${resource} (${usageVal}/${limitVal})`);
      throw new AppError(
        `Resource limit reached: ${resource}. Please upgrade your plan.`,
        403,
        "QUOTA_EXCEEDED",
      );
    }
  }

  /**
   * Increment usage stats for a tenant.
   */
  public async incrementUsage(
    tenantId: string,
    resource: keyof TenantQuota,
    amount = 1,
  ): Promise<void> {
    if (!tenantId) {
      return;
    }

    const fieldMap: Record<keyof TenantQuota, string> = {
      maxUsers: "usage.usersCount",
      maxStorageBytes: "usage.storageBytes",
      maxCollections: "usage.collectionsCount",
      maxApiRequestsPerMonth: "usage.apiRequestsMonth",
    };

    const updateField = fieldMap[resource];
    if (!updateField) {
      return;
    }

    try {
      const tenant = await this.getTenant(tenantId);
      if (!tenant) {
        return;
      }

      const newUsage = { ...tenant.usage };

      if (resource === "maxUsers") {
        newUsage.usersCount += amount;
      }
      if (resource === "maxStorageBytes") {
        newUsage.storageBytes += amount;
      }
      if (resource === "maxCollections") {
        newUsage.collectionsCount += amount;
      }
      if (resource === "maxApiRequestsPerMonth") {
        newUsage.apiRequestsMonth += amount;
      }
      newUsage.lastUpdated = new Date();

      const dbAdapter = await this.getDbAdapter();
      if (!dbAdapter) {
        return;
      }
      await dbAdapter.system.tenants.update(tenantId as any, {
        usage: newUsage,
      });
    } catch (err) {
      logger.error(`Failed to update usage for tenant ${tenantId}`, err);
    }
  }

  /**
   * Decrement usage (e.g. deleting users/files)
   */
  public async decrementUsage(
    tenantId: string,
    resource: keyof TenantQuota,
    amount = 1,
  ): Promise<void> {
    return this.incrementUsage(tenantId, resource, -amount);
  }
}

export const tenantService = new TenantService();
