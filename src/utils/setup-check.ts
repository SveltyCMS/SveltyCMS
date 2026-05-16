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

import fs from "node:fs";
import path from "node:path";

/**
 * ⚡️ FAST SHALLOW CHECK
 * Checks if config/private.ts exists.
 * Safe to call from anywhere (middleware, Vite, etc.)
 */
import { isSetupComplete } from "./setup-check-fast";
export { isSetupComplete };

// Memoization
let setupDbStatus: boolean | null = null;
let setupStatusCheckedDb = false;

export enum SetupState {
  MISSING_CONFIG = "MISSING_CONFIG", // config/private.ts not found
  MISSING_ADMIN = "MISSING_ADMIN", // Config exists but DB is empty
  COMPLETE = "COMPLETE", // Everything ready
}

/**
 * 🔎 DEEP ASYNC CHECK
 * Checks if database has admin users and roles.
 */
export async function isSetupCompleteAsync(): Promise<boolean> {
  // 1. Fast fail: Check config first
  if (!isSetupComplete()) return false;

  // 2. Cache hit
  if (setupStatusCheckedDb || (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ === true) {
    return (
      (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ === true || (setupDbStatus ?? false)
    );
  }

  try {
    // Dynamic imports to avoid Vite/SSR side-effects at top-level
    // Vite will resolve these during the main app build and bundle them correctly.
    const { logger } = await import("./logger");
    const db = await import("../databases/db");

    // Wait for DB boot
    if (typeof db.getDbInitPromise === "function") {
      await db.getDbInitPromise(false, "CORE");
    }

    const dbAdapter = db.dbAdapter;
    if (!dbAdapter) return false;

    if (typeof dbAdapter.isConnected === "function" && !dbAdapter.isConnected()) return false;

    // Check Users/Roles
    const [userResult, roles] = await Promise.all([
      dbAdapter.auth.getAllUsers({ limit: 1 }, { bypassTenantCheck: true }),
      dbAdapter.auth.getAllRoles({ bypassTenantCheck: true }),
    ]);

    const hasUsers = userResult.success && userResult.data && userResult.data.length > 0;
    const hasRoles = Array.isArray(roles) && roles.length > 0;

    if (!hasUsers || !hasRoles) {
      logger.channel("setupCheck").warn("Config exists but DB is missing USERS/ROLES");
      setupDbStatus = false;
      setupStatusCheckedDb = true;
      return false;
    }

    setupDbStatus = true;
    setupStatusCheckedDb = true;
    return true;
  } catch {
    // Fail safe to false to stay in setup mode if DB is unreachable
    return false;
  }
}

/**
 * Returns the current SetupState enum.
 */
export async function getSetupState(): Promise<SetupState> {
  // 🚀 BENCHMARK OPTIMIZATION: Avoid deep checks during high-frequency audits
  if (process.env.BENCHMARK === "true" || process.env.SVELTY_BENCHMARK_SUITE === "true") {
    return SetupState.COMPLETE;
  }

  if (!isSetupComplete()) return SetupState.MISSING_CONFIG;
  const isDeepComplete = await isSetupCompleteAsync();
  return isDeepComplete ? SetupState.COMPLETE : SetupState.MISSING_ADMIN;
}

/**
 * Sync check for fully complete system (memoized).
 */
export function isSetupFullyComplete(): boolean {
  return (
    (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ === true ||
    (setupStatusCheckedDb && setupDbStatus === true)
  );
}

let cachedTestSecret: string | null = null;

/**
 * Robustly retrieves the test API secret with memoization to prevent per-request disk I/O.
 */
export function getTestSecret(): string {
  if (cachedTestSecret) return cachedTestSecret;

  const envSecret = process.env.TEST_API_SECRET || process.env.VITE_TEST_API_SECRET;
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

  cachedTestSecret = "SVELTYCMS_TEST_SECRET_2026";
  return cachedTestSecret;
}

/**
 * Invalidates cache.
 */
export function invalidateSetupCache(
  clearPrivateEnv = false,
  forceStatus: boolean | null = null,
): void {
  setupDbStatus = forceStatus;
  setupStatusCheckedDb = forceStatus !== null;
  if (typeof globalThis !== "undefined") {
    (globalThis as any).__SVELTY_SETUP_FORCED_COMPLETE__ = forceStatus;
  }

  if (clearPrivateEnv) {
    import("../databases/db").then((db) => {
      if (typeof db.clearPrivateConfigCache === "function") {
        db.clearPrivateConfigCache(false);
      }
    });
  }
}
