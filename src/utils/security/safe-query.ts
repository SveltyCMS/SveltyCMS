/**
 * @file src/utils/security/safeQuery.ts
 * @description Utility to enforce strict tenant isolation in database queries.
 *
 * Prevents "Data Leakage" bugs by ensuring every query has a tenantId
 * when running in Multi-Tenant mode.
 */

import { getPrivateEnv } from "@src/databases/config-state";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

interface SafeQueryOptions {
  bypassTenantCheck?: boolean; // Bypass check (e.g. for System Admin queries)
  includeDeleted?: boolean; // Whether to include soft-deleted items
}

/**
 * Validates that a query object includes a tenantId if Multi-Tenancy is enabled.
 * Also enforces Soft Delete boundaries by default.
 *
 * @param query - The query object (e.g. Mongoose filter)
 * @param tenantId - The tenantId from the context (Event/Session)
 * @param options - Options to bypass checks
 */
export function safeQuery<T extends Record<string, any>>(
  query: T,
  tenantId?: string | null | null,
  options: SafeQueryOptions = {},
): T {
  // 1. Get private config
  const privateEnv = getPrivateEnv();

  // 2. Prepare the base query with tenantId if needed
  let secureQuery: any = { ...query };

  const isMultiTenant =
    (privateEnv as any)?.MULTI_TENANT === true || (privateEnv as any)?.MULTI_TENANT === "true";

  if (isMultiTenant && !options.bypassTenantCheck) {
    if (!tenantId) {
      // Redact PII fields before logging
      const PII_KEYS = new Set([
        "email",
        "password",
        "username",
        "name",
        "phone",
        "token",
        "secret",
      ]);
      const redactedQuery = Object.fromEntries(
        Object.entries(query).map(([k, v]) => [
          k,
          PII_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : v,
        ]),
      );
      logger.error(
        `[SafeQuery] Security Violation! Query: ${JSON.stringify(redactedQuery)}, Options: ${JSON.stringify(options)}, MultiTenant: ${privateEnv?.MULTI_TENANT}`,
      );
      throw new AppError(
        "Security Violation: Attempted to execute query without tenant context in Multi-Tenant mode.",
        500,
        "TENANT_CONTEXT_MISSING",
      );
    }
    secureQuery.tenantId = tenantId;
  }

  // 3. Enforce Soft Delete boundary
  if (!options.includeDeleted) {
    // MongoDB syntax: match where isDeleted is not true (exists and is false, or doesn't exist)
    secureQuery.isDeleted = { $ne: true };
  }

  return secureQuery;
}
