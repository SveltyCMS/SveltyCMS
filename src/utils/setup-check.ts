/**
 * @file src/utils/setup-check.ts
 * @description
 * **System State Discovery**: The authoritative utility for detecting if the CMS is initialized.
 *
 * This utility determines if we should show the Setup Wizard or the Admin Dashboard.
 *
 * ### Responsibilities:
 * - Checking for the existence of `config/private.ts`.
 * - Verifying DB connectivity and the presence of core system records (Users, Roles).
 * - Memoizing the setup status to minimize disk/DB I/O.
 *
 * ### Next Steps & Options:
 * - If `isSetupComplete()` is false, the system redirects to `/setup`.
 * - If true, the `handleSetup` hook allows normal authenticated access.
 */

import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger.server";

// Memoization variables to cache the setup status.
let setupConfigStatus: boolean | null = null;
let setupDbStatus: boolean | null = null;
let setupStatusCheckedDb = false;

export enum SetupState {
  MISSING_CONFIG = "MISSING_CONFIG", // File config/private.ts not found or empty
  MISSING_ADMIN = "MISSING_ADMIN", // Config exists but no users/roles in DB
  COMPLETE = "COMPLETE", // Both config and DB are ready
}

/**
 * Robustly retrieves the test API secret from environment or disk.
 * Prioritizes: env.TEST_API_SECRET > tests/e2e/.auth/test-secret.txt > Default
 */
export function getTestSecret(): string {
  // 1. Check environment variable (highest priority)
  const envSecret =
    process.env.TEST_API_SECRET ||
    process.env.VITE_TEST_API_SECRET ||
    (globalThis as any).process?.env?.TEST_API_SECRET;
  if (envSecret) return envSecret;

  // 2. Check test-secret.txt file (CI synchronization)
  try {
    const secretPath = path.join(process.cwd(), "tests", "e2e", ".auth", "test-secret.txt");
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, "utf8").trim();
    }
  } catch {
    // Ignore FS errors
  }

  // 3. Fallback to hardcoded default
  return "SVELTYCMS_TEST_SECRET_2026";
}

/**
 * Returns the current setup state of the system.
 * Higher-level wrapper around isSetupCompleteAsync.
 */
export async function getSetupState(): Promise<SetupState> {
  // FAST-PATH: Synchronous check for fully complete system
  if (isSetupFullyComplete()) {
    return SetupState.COMPLETE;
  }

  // Check config existence (sync)
  if (!isSetupComplete()) {
    return SetupState.MISSING_CONFIG;
  }

  // Check DB state (async)
  const isComplete = await isSetupCompleteAsync();
  return isComplete ? SetupState.COMPLETE : SetupState.MISSING_ADMIN;
}

/**
 * Sync check to see if setup is fully completed (memoized).
 * Used for high-performance middleware short-circuiting.
 */
export function isSetupFullyComplete(): boolean {
  return setupStatusCheckedDb && setupDbStatus === true;
}

export function isSetupComplete(): boolean {
  if (setupConfigStatus !== null) {
    return setupConfigStatus;
  }

  try {
    // Use process.cwd() to ensure we look at the project root
    // Support TEST_MODE for isolated testing without affecting live config
    const isTestMode =
      typeof globalThis !== "undefined" && (globalThis as any).process?.env?.TEST_MODE === "true";
    const configFileName = isTestMode ? "private.test.ts" : "private.ts";
    const privateConfigPath = path.join(process.cwd(), "config", configFileName);

    const scLogger = logger.channel("setupCheck");
    if (!fs.existsSync(privateConfigPath)) {
      scLogger.warn(`MISSING_CONFIG triggered. File not found: ${privateConfigPath}`);
      if (isTestMode) {
        scLogger.info(`${configFileName} NOT FOUND`);
      }
      setupConfigStatus = false;
      return setupConfigStatus;
    }
    if (isTestMode) {
      scLogger.info(`${configFileName} FOUND`);
    }

    const configContent = fs.readFileSync(privateConfigPath, "utf8");

    // Regex checks to ensure keys are not set to empty strings
    // Supports both Object property style (Key: "Value") and Variable assignment style (Key = "Value")
    const hasJwtSecret = !/JWT_SECRET_KEY[:=]\s*(""|''|``)/.test(configContent);
    const hasDbHost = !/DB_HOST[:=]\s*(""|''|``)/.test(configContent);
    const hasDbName = !/DB_NAME[:=]\s*(""|''|``)/.test(configContent);

    if (!hasJwtSecret || !hasDbHost || !hasDbName) {
      logger
        .channel("setupCheck")
        .warn(
          `MISSING_CONFIG triggered. hasJwtSecret: ${hasJwtSecret}, hasDbHost: ${hasDbHost}, hasDbName: ${hasDbName}`,
        );
    }

    // Config file exists and has values - assume setup complete for now
    // Database validation will happen asynchronously in isSetupCompleteAsync()
    setupConfigStatus = hasJwtSecret && hasDbHost && hasDbName;
    return setupConfigStatus;
  } catch (error) {
    // Log error here as it's an exceptional case during a critical check
    logger.error("Error during setup check:", error);
    setupConfigStatus = false;
    return setupConfigStatus;
  }
}

/**
 * Async version that also checks if database has admin users.
 * This is called from hooks after config check passes and database is initialized.
 */
export async function isSetupCompleteAsync(): Promise<boolean> {
  // 1. Fast fail: Check config file first
  if (!isSetupComplete()) {
    return false;
  }

  // 2. Cache hit: If we've already checked the database, return cached result
  if (setupStatusCheckedDb) {
    return setupDbStatus ?? false;
  }

  try {
    // 3. Dynamic Import & Await Initialization
    // Optimization: Check for existing adapter before heavy import wait
    let db = (globalThis as any).__DB_MODULE_CACHE__;
    if (!db) {
      db = await import("../databases/db");
      (globalThis as any).__DB_MODULE_CACHE__ = db;
    }

    // Call the function instead of accessing the exported const to avoid circular dependency issues
    if (typeof db.getDbInitPromise === "function") {
      // Use "CORE" phase for setup check to avoid waiting for background tasks
      await db.getDbInitPromise(false, "CORE");
    } else if (db.dbInitPromise) {
      await db.dbInitPromise;
    }

    const dbAdapter = db.dbAdapter;

    // Guard against uninitialized adapter
    if (!dbAdapter) {
      logger.channel("setupCheck").info("DB adapter not available after initialization promise.");
      return false; // Stay in setup mode if adapter failed to init
    }

    // Check if database is connected before trying to access auth
    if (typeof dbAdapter.isConnected === "function" && !dbAdapter.isConnected()) {
      // If DB not connected but config exists, stay in setup mode
      return false;
    }

    // Ensure auth is initialized before access
    if (dbAdapter.ensureAuth) {
      await dbAdapter.ensureAuth();
    }

    if (!dbAdapter.auth) {
      logger.channel("setupCheck").info("Auth module not ready after initialization");
      // Return true to avoid blocking if config exists
      return true;
    }

    // 4. Data Verification: Check if users and roles exist
    // We check for these to ensure a consistent system state before going READY
    const [userResult, roles, hostConfig] = await Promise.all([
      dbAdapter.auth.getAllUsers({ limit: 1 }, { bypassTenantCheck: true }),
      dbAdapter.auth.getAllRoles({ bypassTenantCheck: true }),
      dbAdapter.system.preferences.get("HOST_PROD", "system"),
    ]);

    const hasUsers = userResult.success && userResult.data && userResult.data.length > 0;
    const hasRoles = Array.isArray(roles) && roles.length > 0;
    const hasConfig = hostConfig.success && hostConfig.data;

    // Log status for easier debugging of setup state
    logger.info(
      `[setupCheck] DB Status: users=${hasUsers}, roles=${hasRoles}, siteConfig=${hasConfig}`,
    );

    // RELAXED CHECK: If we have users and roles, we are basically ready.
    // SITE_CONFIG (HOST_PROD) can be set in the first login.
    if (!hasUsers || !hasRoles) {
      const missing = [];
      if (!hasUsers) missing.push("USERS");
      if (!hasRoles) missing.push("ROLES");
      logger.warn(
        `[setupCheck] Config exists but NO ${missing.join(", ")} found in DB. System will stay in setup mode.`,
      );
      setupDbStatus = false;
      setupStatusCheckedDb = true;
      return false;
    }

    // Update cache
    setupDbStatus = true;
    setupStatusCheckedDb = true;
    return true;
  } catch (error) {
    const scLogger = logger.channel("setupCheck");
    scLogger.error("Database validation failed during setup check:", error);
    // Log adapter status for diagnostics
    try {
      const db = await import("../databases/db");
      scLogger.error(`Diagnostic: dbAdapter availability: ${!!db.dbAdapter}`);
    } catch {
      scLogger.error("Diagnostic: Could not even import db module during error handling.");
    }
    // If config exists but DB check fails, we return false to stay in setup mode
    // This prevents blocking setup actions during transition.
    return false;
  }
}

/**
 * Invalidates the cached setup status, forcing a recheck on the next call.
 * @param clearPrivateEnv - Whether to clear private environment config (default: false)
 * @param forceStatus - If provided, forces the setupStatus to this value without rechecking files/DB
 */
export function invalidateSetupCache(
  clearPrivateEnv = false,
  forceStatus: boolean | null = null,
): void {
  setupConfigStatus = forceStatus;
  setupDbStatus = forceStatus;
  setupStatusCheckedDb = forceStatus !== null;

  if (clearPrivateEnv) {
    // Use relative import here as well for consistency
    import("../databases/db")
      .then((db) => {
        if (typeof db.clearPrivateConfigCache === "function") {
          db.clearPrivateConfigCache(false);
        }
      })
      .catch((err) => {
        // Ignore module load errors during invalidation, just log warning in dev
        const isDev =
          typeof globalThis !== "undefined" &&
          (globalThis as any).process?.env?.NODE_ENV === "development";
        if (isDev) {
          logger.channel("setupCheck").warn("Could not clear private config cache:", err);
        }
      });
  }
}

/**
 * Checks if a route is part of the core bootstrap process (setup, login, system APIs).
 * Used by hooks to allow non-blocking initialization.
 */
export function isBootstrapRoute(pathname: string): boolean {
  // 1. Setup flow (fresh install)
  if (pathname.startsWith("/setup") || pathname.startsWith("/api/setup")) {
    return true;
  }

  // 2. Auth flow (login, register, logout)
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/user/login")
  ) {
    return true;
  }

  // 3. System core endpoints (health, debug, system state)
  if (
    pathname.startsWith("/api/system") ||
    pathname.startsWith("/api/debug") ||
    pathname.startsWith("/api/testing") ||
    pathname.startsWith("/api/settings/public") ||
    pathname.startsWith("/api/content/version") ||
    pathname.startsWith("/api/dashboard/health") ||
    pathname === "/" ||
    pathname.startsWith("/ui-test")
  ) {
    return true;
  }

  // 4. Static assets and Vite internal paths (fast bypass)
  if (
    pathname.startsWith("/_") ||
    pathname.startsWith("/static") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/.well-known") ||
    pathname.includes(".") // Extension check for other assets
  ) {
    return true;
  }

  // 5. Localized versions of core routes
  const isLocalizedSetup = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register)/.test(pathname);

  return isLocalizedSetup;
}
