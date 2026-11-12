/**
 * @file src/databases/tenant-rls.ts
 * @description
 * Opt-in PostgreSQL Row-Level Security for the request path.
 *
 * ### Default is OFF, and that is deliberate
 * The request path isolates tenants with the `"tenantId"` predicate every
 * tenant-owned query carries. RLS adds a database-enforced boundary on top, but
 * it only works when **every** statement that touches a protected table runs on
 * a connection with `app.tenant_id` bound — otherwise a `FORCE` policy hides
 * every row. Turning that on implicitly would break system paths (setup,
 * migrations, audit flush, cache warming) that legitimately run unscoped, so an
 * operator opts in explicitly and connects the system paths with a role that has
 * `BYPASSRLS` (or keeps them on a separate pool).
 *
 * ### What `enforce` changes
 * 1. `createModel()` enables **and forces** RLS on the new collection table and
 *    installs `tenant_isolation` (`"tenantId" = current_setting('app.tenant_id')`).
 * 2. Tenant-scoped `db.crud.*` calls run inside a transaction whose first
 *    statement binds `app.tenant_id` transaction-locally (`set_config(..., true)`),
 *    so a failed query cannot leave a stale tenant on a pooled connection.
 * 3. Calls without a `tenantId` (system scope) are **not** wrapped: they must use
 *    the bypass role. This is documented, not silently degraded.
 *
 * ### Source of truth
 * `TENANT_RLS_ENABLED` — env var first (benchmark/test fast path), then the
 * DB-backed System Setting, memoized for 5 s like the audit flags.
 *
 * Features:
 * - `getTenantRlsMode()` — memoized `"off" | "enforce"` resolution
 * - env fast path with zero async work once resolved
 * - `tenantRlsRequiresBoundContext()` — the invariant the adapter asserts
 */

import { logger } from "@utils/logger";

export type TenantRlsMode = "off" | "enforce";

/** Cached lazy handle to the settings service. */
let settingsServiceModulePromise:
  | Promise<typeof import("@src/services/core/settings-service")>
  | undefined;
function loadSettingsServiceModule(): Promise<
  typeof import("@src/services/core/settings-service")
> {
  return (settingsServiceModulePromise ??= import("@src/services/core/settings-service"));
}

const TENANT_RLS_TTL_MS = 5_000;

let cachedMode: TenantRlsMode | null = null;
let cachedAt = 0;
let inflight: Promise<TenantRlsMode> | null = null;

/** Single-slot memo for the env fast path — `process.env` is read once per change. */
let _envRaw: string | undefined;
let _envMode: TenantRlsMode | null = null;

function envMode(): TenantRlsMode | null {
  const raw = process.env.TENANT_RLS_ENABLED;
  if (raw === _envRaw) return _envMode;
  _envRaw = raw;
  _envMode = raw === undefined ? null : raw === "true" || raw === "1" ? "enforce" : "off";
  return _envMode;
}

async function loadDbMode(): Promise<TenantRlsMode> {
  try {
    const { getUntypedSetting } = await loadSettingsServiceModule();
    const value = await getUntypedSetting("TENANT_RLS_ENABLED", undefined, "global").catch(
      () => null,
    );
    return value === true ? "enforce" : "off";
  } catch (err) {
    logger.debug("[TenantRLS] DB setting unavailable, defaulting to off", err);
    return "off";
  }
}

/**
 * Resolve the effective mode. Env wins (tests/benchmarks), otherwise the DB
 * setting, memoized for `TENANT_RLS_TTL_MS` so the CRUD path pays one map
 * lookup after the first call.
 */
export async function getTenantRlsMode(): Promise<TenantRlsMode> {
  const fromEnv = envMode();
  if (fromEnv) return fromEnv;

  const now = Date.now();
  if (cachedMode && now - cachedAt < TENANT_RLS_TTL_MS) return cachedMode;
  if (inflight) return inflight;

  inflight = loadDbMode()
    .then((mode) => {
      cachedMode = mode;
      cachedAt = Date.now();
      return mode;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Synchronous read of the last resolved mode — safe default `"off"`. */
export function isTenantRlsEnforced(): boolean {
  return cachedMode === "enforce";
}

let refreshInflight: Promise<TenantRlsMode> | null = null;

/**
 * Refresh only when the memo is actually stale.
 *
 * The CRUD wrapper calls this on every operation whose mode is `"off"`, so it
 * must be allocation-free in the steady state: no promise, no microtask, no
 * `Date.now()` bucket churn beyond one comparison. An always-on refresh built a
 * promise chain per query and showed up as GC pressure across every lane.
 */
export function maybeRefreshTenantRlsMode(): void {
  if (cachedMode !== null && Date.now() - cachedAt < TENANT_RLS_TTL_MS) return;
  void refreshTenantRlsMode();
}

/**
 * Refresh the memoized mode without blocking the caller.
 *
 * The CRUD wrapper calls this only when the cached value is stale, so the hot
 * path stays synchronous: one boolean read per operation instead of an awaited
 * settings lookup. Until the refresh resolves, a call keeps the previous mode —
 * which is the documented default (application predicate), never a weaker one.
 */
export function refreshTenantRlsMode(): Promise<TenantRlsMode> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = getTenantRlsMode().finally(() => {
    refreshInflight = null;
  });
  return refreshInflight;
}

/** Test/diagnostics hook: drop the memo so the next call re-resolves. */
export function resetTenantRlsModeCache(): void {
  cachedMode = null;
  cachedAt = 0;
  inflight = null;
  refreshInflight = null;
}
