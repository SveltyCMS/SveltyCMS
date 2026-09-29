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
 * - Registry brand: only scopes minted by `createSystemTenantScope` (in any copy
 *   of this module) pass `isSystemTenantScope` / `hasTenantBypass`. Forged
 *   `{ kind: "system" }` objects never do — membership, not shape.
 * - Reasons are closed unions so call sites document *why* isolation is waived.
 *
 * ### Durability across module instances
 * Validation lives in a `WeakSet` parked on `globalThis`, NOT in a module-local
 * `Symbol()`: a duplicated module instance (Vite's dev SSR runner vs a static
 * import, or two production chunks) carries its own symbol, so a scope minted by
 * copy A failed `isSystemTenantScope` in copy B — the bypass silently failed and
 * the tenant guard rejected legitimate system work as a Security Violation.
 * One shared registry validates scopes from every copy; entries are held weakly,
 * so scopes are collected together with the options bag that referenced them.
 *
 * ### Features:
 * - branded system scope
 * - withSystemScope options helper
 * - hasTenantBypass (branded scope | bypassSafeQuery)
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
  | "seed"
  | "cache-warming"
  | "audit-flush";

/** Type-level brand only — erased at runtime. Runtime authority is the registry. */
declare const SYSTEM_SCOPE_BRAND: unique symbol;

/**
 * Opaque system capability. Only `createSystemTenantScope` produces valid values.
 */
export type SystemTenantScope = {
  readonly [SYSTEM_SCOPE_BRAND]: true;
  readonly kind: "system";
  readonly reason: SystemScopeReason;
};

/**
 * Canonical registry, shared by every loaded copy of this module.
 */
const scopeRegistryHost = globalThis as typeof globalThis & {
  __SVELTY_SYSTEM_SCOPE_REGISTRY__?: WeakSet<object>;
};
const SYSTEM_SCOPE_REGISTRY: WeakSet<object> =
  scopeRegistryHost.__SVELTY_SYSTEM_SCOPE_REGISTRY__ ??
  (scopeRegistryHost.__SVELTY_SYSTEM_SCOPE_REGISTRY__ = new WeakSet<object>());

/**
 * Create a branded system tenant scope for allowlisted infrastructure paths.
 */
export function createSystemTenantScope(reason: SystemScopeReason): SystemTenantScope {
  const scope = { kind: "system", reason } as SystemTenantScope;
  SYSTEM_SCOPE_REGISTRY.add(scope);
  return scope;
}

/**
 * Type guard: true only for scopes minted by `createSystemTenantScope`
 * (in any copy of this module).
 */
export function isSystemTenantScope(value: unknown): value is SystemTenantScope {
  return typeof value === "object" && value !== null && SYSTEM_SCOPE_REGISTRY.has(value);
}

/** Minimal shape for bypass detection (avoids circular imports with db-interface). */
export type TenantBypassOptions = {
  systemScope?: SystemTenantScope | unknown;
  bypassSafeQuery?: boolean;
};

/**
 * Whether options waive tenant isolation under MULTI_TENANT.
 * Only branded `systemScope` or `bypassSafeQuery` — no boolean escape hatch.
 */
export function hasTenantBypass(options?: TenantBypassOptions | null): boolean {
  if (!options) return false;
  if (options.bypassSafeQuery) return true;
  return isSystemTenantScope(options.systemScope);
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
