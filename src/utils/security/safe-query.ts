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
  bypassSafeQuery?: boolean; // 🚀 ULTRA FAST PATH: Skip all checks and allocations
}

let cachedIsMultiTenant: boolean | null = null;

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
  tenantId?: string | null,
  options: SafeQueryOptions = {},
): T {
  // 🚀 ULTRA FAST PATH: If bypassed, return immediately without any allocations
  if (options.bypassSafeQuery) return query;

  // 1. Get private config (Cached for performance, but bypassed in TEST_MODE)
  if (cachedIsMultiTenant === null || process.env.TEST_MODE === "true") {
    const privateEnv = getPrivateEnv() as any;
    cachedIsMultiTenant = privateEnv?.MULTI_TENANT === true || privateEnv?.MULTI_TENANT === "true";
  }

  const isMultiTenant = cachedIsMultiTenant;

  // 🛡️ SECURITY: If multi-tenancy is enabled but no tenantId provided, it's a violation
  if (isMultiTenant && !tenantId && !options.bypassTenantCheck) {
    // Redact PII fields before logging
    const PII_KEYS = new Set(["email", "security", "username", "name", "phone", "token", "secret"]);
    const redactedQuery = Object.fromEntries(
      Object.entries(query).map(([k, v]) => [k, PII_KEYS.has(k.toLowerCase()) ? "[REDACTED]" : v]),
    );
    logger.error(
      `[SafeQuery] Security Violation! Query: ${JSON.stringify(redactedQuery)}, Options: ${JSON.stringify(options)}, MultiTenant: true`,
    );
    throw new AppError(
      "Security Violation: Attempted to execute query without tenant context in Multi-Tenant mode.",
      500,
      "TENANT_CONTEXT_MISSING",
    );
  }

  // 2. Prepare the base query with tenantId if needed
  // We only clone if we actually need to change something
  let secureQuery: any = query;
  let hasChanges = false;

  if (tenantId !== undefined && !options.bypassTenantCheck && query.tenantId !== tenantId) {
    secureQuery = { ...query };
    secureQuery.tenantId = tenantId;
    hasChanges = true;
  }

  // 3. Enforce Soft Delete boundary — always applies unless explicitly opted out
  // Note: overriding any caller-set isDeleted to prevent soft-delete bypass
  if (!options.includeDeleted) {
    if (!hasChanges) secureQuery = { ...query };
    // MongoDB syntax: match where isDeleted is not true (exists and is false, or doesn't exist)
    secureQuery.isDeleted = { $ne: true };
  }

  return secureQuery;
}
