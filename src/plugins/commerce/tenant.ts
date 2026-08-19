/**
 * @file src/plugins/commerce/tenant.ts
 * @description Fail-closed tenant identity for every commerce query.
 *
 * When multi-tenancy is on, a missing tenantId is a 400 — never fall back to
 * another tenant's carts, orders, coupons, or stock. Callers MUST pass the
 * request's `locals.tenantId`, never a client-supplied tenant.
 *
 * ### Features:
 * - requireCommerceTenantId
 * - tenant scoped filter helper
 */

import type { DatabaseId } from "@src/content/types";
import { raise } from "@utils/error-handling";
import { isMultiTenantEnabled } from "@utils/tenant";

/** Resolve the tenant for commerce I/O. Never trusts client input. */
export function requireCommerceTenantId(
  tenantId: DatabaseId | string | null | undefined,
): DatabaseId {
  if (isMultiTenantEnabled() && (tenantId == null || tenantId === "")) {
    raise(400, "Tenant could not be identified for this commerce operation.", "TENANT_REQUIRED");
  }
  return String(tenantId || "global") as DatabaseId;
}

/** Filter fragment that MUST be spread into every commerce collection query. */
export function withTenant(
  tenantId: DatabaseId,
  filter: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...filter, tenantId };
}
