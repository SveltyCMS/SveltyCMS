/**
 * @file src/utils/security/tenant-required.server.ts
 * @description Fail-closed tenant gate for tenant-REQUIRED request paths.
 *
 * The GraphQL data resolvers scope every field themselves; every other tenant
 * surface (collections, content, webhooks, background jobs, …) only gets a
 * tenant from the request. When MULTI_TENANT is on and the request resolved no
 * tenant, `null` reaches the DB layer as the *explicit global scope*
 * (`tenantId IS NULL`) — and `webhookService` maps it to the literal `"global"`
 * bucket — so the operation would silently read/write the global layer instead
 * of being rejected. This module is the single boundary gate that rejects those
 * requests before a handler runs.
 *
 * Lives in its own module (not `tenant-isolation.server`) on purpose: unit tests
 * partially mock `@utils/tenant-isolation.server` (only `isMultiTenantEnabled`),
 * and a helper exported from there would resolve to `undefined` in those tests.
 *
 * ### Security model
 * - MULTI_TENANT off → no-op (single-tenant mode unchanged).
 * - MULTI_TENANT on + resolved tenant → no-op.
 * - MULTI_TENANT on + null/undefined/"" tenant on a tenant-owned namespace →
 *   403 TENANT_REQUIRED.
 * - The documented explicit global scope **DB read** (`tenantId: null` in
 *   safe-query) stays allowed: this gate is request-level only.
 */

import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger";

/**
 * API namespaces whose handlers only ever operate on tenant-owned rows.
 *
 * Deliberately NOT listed (documented global plane or own guard):
 * - `system`, `settings`, `theme`, `metrics`, `database`, `logs`, `version`,
 *   `health`, `config`, `setup`: global/system config plane — a global admin
 *   (tenantId null) legitimately operates here.
 * - `auth`, `user`, `permission`, `token`, `website-tokens`, `api-keys`: auth
 *   boundary; login/SSO must work before a tenant is bound, and the token routes
 *   already fail closed on their own.
 * - `media`: `handlers/media.ts` already throws 400 TENANT_REQUIRED for every
 *   non-share path (public share links are token-gated on purpose).
 * - `testing`/`reset`/`seed`/`reinitialize`: test-mode bypass supplies the tenant.
 * - `commerce`, `stripe`, `forms`: guest/public surfaces with their own
 *   signature/tenant guards. `graphql`: data-operations already scopes per field.
 * - `backups`, `migrations`, `gdpr`: admin/system maintenance on the global plane.
 */
const TENANT_REQUIRED_NAMESPACES: ReadonlySet<string> = new Set([
  "collections",
  "virtual-collections",
  "content",
  "content-structure",
  "search",
  "events",
  "widgets",
  "dashboard",
  "plugin-settings",
  "system-jobs",
  "webhooks",
  "system-webhooks",
  "content-sync",
  "content-export",
  "content-import",
  "importer",
  "importers",
  "trash",
]);

/** True when `namespace` is a tenant-owned data surface (see the set above). */
export function isTenantRequiredNamespace(namespace: string | null | undefined): boolean {
  return !!namespace && TENANT_REQUIRED_NAMESPACES.has(namespace);
}

/**
 * Single fail-closed gate for tenant-REQUIRED operations outside GraphQL.
 *
 * Ordering is cheapest-first so the hot path stays free of allocations: a
 * tenant-bearing request exits on one truthiness check; a tenantless request on
 * one `Set.has` plus one cached MULTI_TENANT flag read.
 *
 * `allowGlobal` is the explicit escape hatch for a caller with a documented
 * reason to serve the global layer (none today); the default is fail closed.
 */
export function assertTenantRequired(
  tenantId: string | null | undefined,
  namespace: string | null | undefined,
  options: { allowGlobal?: boolean; operation?: string } = {},
): void {
  if (tenantId) return;
  if (options.allowGlobal) return;
  if (!isTenantRequiredNamespace(namespace)) return;
  if (!isMultiTenantEnabled()) return;

  logger.error(
    `[TenantContext] Security Violation: tenantless request for tenant-required namespace "${namespace}" (${options.operation || "api"})`,
  );
  // Message intentionally matches the handler-level guards ("Tenant ID required")
  // so existing assertions and clients see one consistent rejection.
  throw new AppError(
    `Tenant ID required for ${options.operation || `/api/${namespace}`} (multi-tenant mode)`,
    403,
    "TENANT_REQUIRED",
  );
}

/**
 * Path-level variant used by the auth hook, which only sees the request URL.
 *
 * Zero work in single-tenant mode (one cached flag read) and zero allocation
 * until a tenant is actually missing: the namespace is sliced out of the
 * pathname only on the fail-closed branch. `/api/v1/<ns>` is normalised the
 * same way the dispatcher does it.
 */
export function assertTenantRequiredForApiPath(
  method: string,
  pathname: string,
  tenantId: string | null | undefined,
): void {
  if (tenantId) return;
  if (!isMultiTenantEnabled()) return;
  // CORS preflight carries no session — the turbo pipeline answers it.
  if (method === "OPTIONS") return;
  if (!pathname.startsWith("/api/")) return;

  const start = pathname.startsWith("/api/v1/") ? 8 : 5;
  const end = pathname.indexOf("/", start);
  const namespace = end === -1 ? pathname.slice(start) : pathname.slice(start, end);
  assertTenantRequired(tenantId, namespace, { operation: `request to /api/${namespace}` });
}
