/**
 * @file src/databases/db-adapter-wrapper.ts
 * @description Central wrapper to enforce strict tenant isolation across database calls.
 */

import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getPrivateEnv, loadPrivateConfig } from "../db";
import type { DatabaseId } from "@src/content/types";

/**
 * Options for tenant isolation wrapper.
 */
export interface TenantOptions {
  /**
   * Whether to allow access to global/system context when multi-tenancy is enabled but no tenantId is provided.
   */
  allowGlobal?: boolean;
  /**
   * Optional collection name for better error reporting.
   */
  collection?: string;
}

let isMultiTenantCached: boolean | undefined = undefined;

/**
 * Central wrapper to enforce strict tenant isolation across database calls.
 * Ensures operations are either scoped to a tenant or allowed in single-tenant/global mode.
 */
export async function withTenant<T>(
  tenantId: DatabaseId | string | null | undefined,
  operation: () => Promise<T>,
  options: TenantOptions = {},
): Promise<T> {
  // Guard against empty strings which might indicate a bug in tenant resolution
  if (tenantId === "") {
    throw new AppError("Invalid tenant context: empty string provided", 400, "INVALID_TENANT_ID");
  }

  // If tenantId is provided, we always allow (tenant context is active)
  if (tenantId) {
    return operation();
  }

  let isMultiTenant = isMultiTenantCached;
  if (isMultiTenant === undefined || process.env.TEST_MODE === "true") {
    let config = getPrivateEnv();
    if (!config) {
      config = await loadPrivateConfig();
    }
    isMultiTenant = config?.MULTI_TENANT === true;
    if (process.env.TEST_MODE !== "true") {
      isMultiTenantCached = isMultiTenant;
    }
  }

  // If multi-tenancy is disabled, we don't require a tenantId
  if (!isMultiTenant) {
    logger.debug(`Single-tenant mode: allowing operation on ${options.collection || "unknown"}`);
    return operation();
  }

  // If multi-tenancy is enabled but no tenantId provided, check if global access is allowed
  if (options.allowGlobal) {
    logger.debug(`Global/system context allowed for ${options.collection || "unknown"}`);
    return operation();
  }

  throw new AppError(
    `Tenant context required for this operation (collection: ${options.collection || "unknown"})`,
    403,
    "TENANT_REQUIRED",
  );
}
