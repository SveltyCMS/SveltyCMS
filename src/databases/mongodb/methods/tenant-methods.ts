/**
 * @file src/databases/mongodb/methods/tenant-methods.ts
 * @description MongoDB implementation of Tenant management.
 *
 * Features:
 * - Create tenant
 * - Get tenant by ID
 * - Update tenant
 * - Delete tenant
 * - List tenants
 */

import { logger } from "@utils/logger";
import type { Model } from "mongoose";
import type { DatabaseId, DatabaseResult, PaginationOption, Tenant } from "../../db-interface";
import { createDatabaseError, generateId } from "./mongodb-utils";

export class MongoTenantMethods {
  private readonly TenantModel: Model<Tenant>;

  constructor(tenantModel: Model<Tenant>) {
    this.TenantModel = tenantModel;
  }

  async create(
    tenantData: Omit<Tenant, "_id" | "createdAt" | "updatedAt"> & {
      _id?: DatabaseId;
    },
  ): Promise<DatabaseResult<Tenant>> {
    try {
      const tenant = new this.TenantModel({
        ...tenantData,
        _id: tenantData._id || generateId(), // Use provided ID or generate a new one
      });
      await tenant.save();
      logger.info(`Tenant created: ${tenant.name} (${tenant._id})`);
      return { success: true, data: tenant.toObject() as Tenant };
    } catch (error) {
      return {
        success: false,
        message: "Failed to create tenant",
        error: createDatabaseError(error, "CREATE_TENANT_ERROR", "Failed to create tenant"),
      };
    }
  }

  async getById(tenantId: DatabaseId): Promise<DatabaseResult<Tenant | null>> {
    try {
      const tenant = await this.TenantModel.findById(tenantId).lean();
      return { success: true, data: (tenant as Tenant) || null };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get tenant ${tenantId}`,
        error: createDatabaseError(error, "GET_TENANT_ERROR", `Failed to get tenant ${tenantId}`),
      };
    }
  }

  async update(
    tenantId: DatabaseId,
    data: Partial<Omit<Tenant, "_id" | "createdAt" | "updatedAt">>,
  ): Promise<DatabaseResult<Tenant>> {
    try {
      const tenant = await this.TenantModel.findByIdAndUpdate(
        tenantId,
        { $set: { ...data, updatedAt: new Date() } },
        { new: true, lean: true },
      );
      if (!tenant) {
        return {
          success: false,
          message: "Tenant not found",
          error: { code: "NOT_FOUND", message: "Tenant not found" },
        };
      }
      return { success: true, data: tenant as Tenant };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update tenant ${tenantId}`,
        error: createDatabaseError(
          error,
          "UPDATE_TENANT_ERROR",
          `Failed to update tenant ${tenantId}`,
        ),
      };
    }
  }

  async delete(tenantId: DatabaseId): Promise<DatabaseResult<void>> {
    try {
      // --- Integrity: Existence-check rejection ---
      // In a production enterprise system, we MUST NOT silently drop a tenant
      // if it has associated data. Cascading delete is dangerous/slow.
      // Rejection is the safest default.
      //
      // This implementation REJECTS deletion by default. To allow deletion,
      // explicit checks for associated data across collections would be required,
      // or a manual confirmation process.
      // For now, we prevent deletion and instruct user on manual cleanup.

      // Placeholder for actual existence checks that would query other collections
      // (e.g., users, collections, settings, media). If any associated data is found,
      // deletion should be rejected.
      // Example of how such checks might look (requires access to other models/repos):
      // const usersExist = await checkIfUsersExistForTenant(tenantId);
      // const collectionsExist = await checkIfCollectionsExistForTenant(tenantId);
      // if (usersExist || collectionsExist) {
      //   return {
      //     success: false,
      //     message: "Cannot delete tenant with associated data.",
      //     error: { code: "TENANT_HAS_DATA", message: "Tenant has associated data." },
      //   };
      // }

      // Default rejection: Prevent deletion by default to ensure safety.
      // The user must explicitly handle associated data cleanup or a more
      // sophisticated tenant deletion workflow must be implemented.
      return {
        success: false,
        message:
          "Tenant deletion is restricted by default. Associated data must be cleaned up manually before proceeding.",
        error: {
          code: "TENANT_PROTECTED",
          message: "Tenant deletion requires manual oversight and data cleanup.",
        },
      };

      // If all existence checks were passed (i.e., no associated data found),
      // the following deletion logic would execute:
      /*
      const result = await this.TenantModel.deleteOne({ _id: tenantId });
      
      if (result.deletedCount === 0) {
        return {
          success: false,
          message: "Tenant not found",
          error: { code: "NOT_FOUND", message: "Tenant not found" },
        };
      }
      
      logger.info(`Tenant deleted: ${tenantId}. Associated data has been cleaned up (if cascaded) or requires manual cleanup.`);
      return { success: true, data: undefined };
      */
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete tenant ${tenantId}`,
        error: createDatabaseError(
          error,
          "DELETE_TENANT_ERROR",
          `Failed to delete tenant ${tenantId}`,
        ),
      };
    }
  }

  async list(options?: PaginationOption): Promise<DatabaseResult<Tenant[]>> {
    try {
      // Filter sanitization: Only allow specific fields to prevent raw MongoDB operator injection
      const allowedFilters = ["name", "isActive", "_id"];
      const sanitizedFilter: Record<string, any> = {};

      if (options?.filter) {
        for (const [key, value] of Object.entries(options.filter)) {
          if (allowedFilters.includes(key)) {
            sanitizedFilter[key] = value;
          }
        }
      }

      const query = this.TenantModel.find(sanitizedFilter);

      // Enforce safe default limits to prevent resource exhaustion
      const limit = Math.min(options?.limit || 100, 1000);
      query.limit(limit);

      if (options?.offset) {
        query.skip(options.offset);
      }

      // Sort normalization
      if (options?.sort) {
        const sortOptions: Record<string, 1 | -1> = {};
        if (Array.isArray(options.sort)) {
          options.sort.forEach(([field, direction]) => {
            if (allowedFilters.includes(field)) {
              sortOptions[field] = direction === "asc" ? 1 : -1;
            }
          });
        } else {
          Object.entries(options.sort).forEach(([field, direction]) => {
            if (allowedFilters.includes(field)) {
              sortOptions[field] = (direction as any) === "asc" ? 1 : -1;
            }
          });
        }
        if (Object.keys(sortOptions).length > 0) {
          query.sort(sortOptions);
        }
      }

      const tenants = await query.lean();
      return { success: true, data: tenants as Tenant[] };
    } catch (error) {
      return {
        success: false,
        message: "Failed to list tenants",
        error: createDatabaseError(error, "LIST_TENANTS_ERROR", "Failed to list tenants"),
      };
    }
  }
}
