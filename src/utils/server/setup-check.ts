/**
 * @file src/utils/setup-check.ts
 * @description
 * **System State Discovery**: The authoritative utility for detecting if the CMS is initialized.
 *
 * This utility handles both "Shallow" (file existence) and "Deep" (DB content) checks.
 *
 * ### responsibilities:
 * - Checking for config/private.ts (Vite & Middleware).
 * - Verifying DB connectivity and core records (Users, Roles).
 * - Memoizing status to minimize I/O.
 *
 * ### SECURITY:
 * This file is imported by vite.config.ts (Node environment).
 * DO NOT add top-level imports that trigger SvelteKit runtime or project side-effects.
 */

import { logger } from "@utils/logger";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseResult, Role } from "../../databases/db-interface";

/**
 * ⚡️ FAST SHALLOW CHECK
 * Checks if config/private.ts exists.
 * Safe to call from anywhere (middleware, Vite, etc.)
 */
import { isSetupComplete, invalidateFastSetupCache } from "../setup-check-fast";
export { isSetupComplete, invalidateFastSetupCache };

// Memoization
let setupDbStatus: boolean | null = null;
let setupStatusCheckedDb = false;
let setupStatusCheckedAt = 0;

/**
 * A cached FALSE deep-check result is re-checked after this TTL. Without it,
 * the first false result (a boot race where the DB is still seeding, or a
 * manual reseed after deploy) wedged the installation in SETUP mode for the
 * whole process lifetime — `setupDbStatus` was frozen once checked. TRUE stays
 * cached indefinitely; only invalidateSetupCache() clears it.
 */
const SETUP_DB_STATUS_RECHECK_TTL_MS = 60_000;

export enum SetupState {
  MISSING_CONFIG = "MISSING_CONFIG", // config/private.ts not found
  MISSING_ADMIN = "MISSING_ADMIN", // Config exists but DB is empty
  COMPLETE = "COMPLETE", // Everything ready
}

function isSuccessfulDatabaseResult<T>(
  result: unknown,
): result is Extract<DatabaseResult<T>, { success: true }> {
  return (
    typeof result === "object" &&
    result !== null &&
    "success" in result &&
    (result as DatabaseResult<T>).success === true &&
    "data" in result
  );
}

function unwrapAdapterCount(result: unknown): number {
  if (typeof result === "number") return result;
  if (isSuccessfulDatabaseResult<number>(result)) return result.data;
  return 0;
}

/**
 * 🔎 DEEP ASYNC CHECK
 * Checks if database has admin users and roles.
 */
export async function isSetupCompleteAsync(): Promise<boolean> {
  // 1. Fast fail: Check config first
  if (!isSetupComplete()) return false;

  // 2. Cache hit: TRUE is stable; FALSE is re-checked after the TTL so the
  //    system self-heals once the DB is seeded (a frozen false previously
  //    wedged setup mode for the whole process lifetime).
  if ((globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ === true) return true;
  const cacheFresh = Date.now() - setupStatusCheckedAt < SETUP_DB_STATUS_RECHECK_TTL_MS;
  if (setupStatusCheckedDb && (setupDbStatus === true || cacheFresh)) {
    return setupDbStatus === true;
  }

  try {
    // Dynamic imports to avoid Vite/SSR side-effects at top-level
    // Vite will resolve these during the main app build and bundle them correctly.
    const { logger } = await import("../logger");
    const db = await import("../../databases/db");

    // Wait for DB boot
    if (typeof db.getDbInitPromise === "function") {
      await db.getDbInitPromise(false, "CORE");
    }

    const dbAdapter = db.dbAdapter;
    if (!dbAdapter) return false;

    if (typeof dbAdapter.isConnected === "function" && !dbAdapter.isConnected()) return false;

    // Check Admin Users & Roles — use getUserCount which is more reliable than getAllUsers
    const { withSystemScope } = await import("../../databases/system-tenant-scope");
    const systemScope = withSystemScope("bootstrap");
    const adminCountResult = await dbAdapter.auth.getUserCount({ role: "admin" }, systemScope);
    const roles: Role[] = await dbAdapter.auth.getAllRoles(systemScope);

    const adminCount = unwrapAdapterCount(adminCountResult);
    const hasAdmin = adminCount > 0;
    const hasRoles = roles.length > 0;

    if (!hasAdmin || !hasRoles) {
      if (process.env.TEST_MODE !== "true") {
        logger
          .channel("setupCheck")
          .warn(
            `Config exists but DB is missing ${!hasAdmin ? "ADMIN" : ""}${!hasAdmin && !hasRoles ? "/" : ""}${!hasRoles ? "ROLES" : ""}`,
          );
      }
      setupDbStatus = false;
      setupStatusCheckedDb = true;
      setupStatusCheckedAt = Date.now();
      return false;
    }

    setupDbStatus = true;
    setupStatusCheckedDb = true;
    setupStatusCheckedAt = Date.now();
    return true;
  } catch (err: any) {
    // Fail safe to false to stay in setup mode if DB is unreachable
    logger.error("[setupCheck] Deep check failed:", err);
    return false;
  }
}

/**
 * Returns the current SetupState enum.
 */
export async function getSetupState(): Promise<SetupState> {
  // 🚀 BENCHMARK OPTIMIZATION: Avoid deep checks during high-frequency audits
  if (process.env.BENCHMARK === "true") {
    return SetupState.COMPLETE;
  }

  if (!isSetupComplete()) return SetupState.MISSING_CONFIG;
  const isDeepComplete = await isSetupCompleteAsync();
  return isDeepComplete ? SetupState.COMPLETE : SetupState.MISSING_ADMIN;
}

let cachedTestSecret: string | null = null;

/**
 * Retrieves the test API secret with memoization to prevent per-request disk I/O.
 *
 * Resolution order:
 * 1. `TEST_API_SECRET` or `VITE_TEST_API_SECRET` environment variable
 * 2. `tests/e2e/.auth/test-secret.txt` file
 *
 * @throws {Error} If no secret is configured — fails fast to prevent accidental use
 *   of a hardcoded credential against production systems.
 */
/** Read env at runtime — avoids Vite inlining `process.env.*` to `{}` in production builds. */
function readRuntimeEnv(key: string): string | undefined {
  return (globalThis as typeof globalThis & { process?: NodeJS.Process }).process?.env?.[key];
}

export function getTestSecret(): string {
  if (cachedTestSecret) return cachedTestSecret;

  const envSecret = readRuntimeEnv("TEST_API_SECRET") || readRuntimeEnv("VITE_TEST_API_SECRET");
  if (envSecret) {
    cachedTestSecret = envSecret;
    return envSecret;
  }

  try {
    const secretPath = path.join(process.cwd(), "tests", "e2e", ".auth", "test-secret.txt");
    if (fs.existsSync(secretPath)) {
      cachedTestSecret = fs.readFileSync(secretPath, "utf8").trim();
      return cachedTestSecret!;
    }
  } catch {}

  // ⚠️ SECURITY: No hardcoded fallback secret. A known credential in source code
  // could be used against production if test mode is accidentally enabled.
  // Generate a random secret for the test run instead of using a predictable one.
  const { generateSecureToken } = require("../native-utils");
  cachedTestSecret = generateSecureToken(32);
  logger.warn(
    "[setupCheck] No TEST_API_SECRET env or test-secret.txt found. " +
      "Generated a random secret for this run. Set TEST_API_SECRET for reproducible tests.",
  );
  return cachedTestSecret!;
}

/**
 * Invalidates cache.
 */
export function invalidateSetupCache(
  clearPrivateEnv = false,
  forceStatus: boolean | null = null,
): void {
  invalidateFastSetupCache();
  setupDbStatus = forceStatus;
  setupStatusCheckedDb = forceStatus !== null;
  setupStatusCheckedAt = forceStatus !== null ? Date.now() : 0;
  if (typeof globalThis !== "undefined") {
    (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ = forceStatus;
  }

  // The first-collection redirect memo survives resets and would otherwise
  // send the next login/setup to a collection that no longer exists. Lazy
  // import: this module must stay side-effect free for vite.config.ts.
  try {
    import("../../utils/server/collection-utils.server").then(
      ({ invalidateFirstCollectionPathCache }) => invalidateFirstCollectionPathCache(),
    );
  } catch {}

  if (clearPrivateEnv) {
    import("../../databases/db").then(async (db) => {
      if (typeof db.clearPrivateConfigCache === "function") {
        db.clearPrivateConfigCache(false);
        // 🚀 CRITICAL: The cleared config must be reloaded immediately.
        // Leaving privateEnv null makes concurrent settings-cache merges fall
        // back to the raw config file (no env overrides) and stamp that stale
        // entry as current — poisoning the cache for the whole TTL (e.g.
        // PREVIEW_SECRET missing → preview bridge 503).
        if (typeof db.loadPrivateConfig === "function") {
          try {
            await db.loadPrivateConfig();
          } catch {
            // Non-fatal: next request will reload via loadSettingsCache.
          }
        }
      }
    });
  }
}
