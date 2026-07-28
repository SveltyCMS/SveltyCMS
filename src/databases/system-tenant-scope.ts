/**
 * @file src/databases/system-tenant-scope.ts
 * @description
 * Branded capability for tenant-isolation bypass under MULTI_TENANT.
 *
 * App/request code must pass a real `tenantId` (or `withTenant()`).
 * System paths (scheduler, setup, migration, tests) obtain a scope only via
 * `createSystemTenantScope` / `withSystemScope` — never via a free-form boolean.
 *
 * ### Security
 * - Private Symbol brand: plain `{ kind: "system" }` objects do not pass
 *   `isSystemTenantScope` / `hasTenantBypass`.
 * - Reasons are closed unions so call sites document *why* isolation is waived.
 *
 * ### Features:
 * - branded system scope
 * - withSystemScope options helper
 * - hasTenantBypass (scope | legacy bridge | bypassSafeQuery)
 */

/** Why a system path may omit tenantId under MULTI_TENANT. */
export type SystemScopeReason =
  | "scheduler"
  | "migration"
  | "benchmark"
  | "setup"
  | "bootstrap"
  | "testing"
  | "auth-bootstrap"
  | "plugin"
  | "seed";

/** Private brand — not exportable as a forgeable string key. */
const SYSTEM_SCOPE_BRAND: unique symbol = Symbol("SveltyCMS.SystemTenantScope");

/**
 * Opaque system capability. Only `createSystemTenantScope` produces valid values.
 */
export type SystemTenantScope = {
  readonly [SYSTEM_SCOPE_BRAND]: true;
  readonly kind: "system";
  readonly reason: SystemScopeReason;
};

/**
 * Create a branded system tenant scope for allowlisted infrastructure paths.
 */
export function createSystemTenantScope(reason: SystemScopeReason): SystemTenantScope {
  return {
    [SYSTEM_SCOPE_BRAND]: true,
    kind: "system",
    reason,
  };
}

/**
 * Type guard: true only for brand-bearing scopes from `createSystemTenantScope`.
 */
export function isSystemTenantScope(value: unknown): value is SystemTenantScope {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [SYSTEM_SCOPE_BRAND]?: unknown })[SYSTEM_SCOPE_BRAND] === true &&
    (value as { kind?: unknown }).kind === "system" &&
    typeof (value as { reason?: unknown }).reason === "string"
  );
}

/** Minimal shape for bypass detection (avoids circular imports with db-interface). */
export type TenantBypassOptions = {
  systemScope?: SystemTenantScope | unknown;
  /** @deprecated Prefer `systemScope` via `withSystemScope`. Still honored for one release. */
  bypassTenantCheck?: boolean;
  bypassSafeQuery?: boolean;
};

/**
 * Whether options waive tenant isolation under MULTI_TENANT.
 * Prefer branded `systemScope`; legacy `bypassTenantCheck` remains for migration.
 */
export function hasTenantBypass(options?: TenantBypassOptions | null): boolean {
  if (!options) return false;
  if (options.bypassSafeQuery) return true;
  if (isSystemTenantScope(options.systemScope)) return true;
  // Legacy bridge — lint bans new product use; tests may still pass boolean during migrate
  if (options.bypassTenantCheck === true) return true;
  return false;
}

/**
 * Options bag with a branded system scope (options-last last arg).
 *
 * @example
 * await db.system.jobs.getNextReady(10, withSystemScope("scheduler"));
 * await auth.getUserCount({}, withSystemScope("auth-bootstrap"));
 */
export function withSystemScope(
  reason: SystemScopeReason,
  extra?: Record<string, unknown>,
): { systemScope: SystemTenantScope } & Record<string, unknown> {
  return { ...extra, systemScope: createSystemTenantScope(reason) };
}
