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

// Memoization variable to cache the setup status.
let setupStatus: boolean | null = null;
let setupStatusCheckedDb = false;

export enum SetupState {
  MISSING_CONFIG = "MISSING_CONFIG", // File config/private.ts not found or empty
  MISSING_ADMIN = "MISSING_ADMIN", // Config exists but no users/roles in DB
  COMPLETE = "COMPLETE", // Both config and DB are ready
}

/**
 * Returns the current setup state of the system.
 * Higher-level wrapper around isSetupCompleteAsync.
 */
export async function getSetupState(): Promise<SetupState> {
  if (!isSetupComplete()) {
    return SetupState.MISSING_CONFIG;
  }

  const isComplete = await isSetupCompleteAsync();
  return isComplete ? SetupState.COMPLETE : SetupState.MISSING_ADMIN;
}

export function isSetupComplete(): boolean {
  if (setupStatus !== null) {
    return setupStatus;
  }

  try {
    // Use process.cwd() to ensure we look at the project root
    // Support TEST_MODE for isolated testing without affecting live config
    const isTestMode =
      typeof globalThis !== "undefined" && (globalThis as any).process?.env?.TEST_MODE === "true";
    const configFileName = isTestMode ? "private.test.ts" : "private.ts";
    const privateConfigPath = path.join(process.cwd(), "config", configFileName);

    if (!fs.existsSync(privateConfigPath)) {
      if (isTestMode) {
        console.log(`[setupCheck] ${configFileName} NOT FOUND`);
      }
      setupStatus = false;
      return setupStatus;
    }
    if (isTestMode) {
      console.log(`[setupCheck] ${configFileName} FOUND`);
    }

    const configContent = fs.readFileSync(privateConfigPath, "utf8");

    // Regex checks to ensure keys are not set to empty strings
    // Supports both Object property style (Key: "Value") and Variable assignment style (Key = "Value")
    const hasJwtSecret = !/JWT_SECRET_KEY[:=]\s*(""|''|``)/.test(configContent);
    const hasDbHost = !/DB_HOST[:=]\s*(""|''|``)/.test(configContent);
    const hasDbName = !/DB_NAME[:=]\s*(""|''|``)/.test(configContent);

    // Config file exists and has values - assume setup complete for now
    // Database validation will happen asynchronously in isSetupCompleteAsync()
    setupStatus = hasJwtSecret && hasDbHost && hasDbName;
    return setupStatus;
  } catch (error) {
    // Log error here as it's an exceptional case during a critical check
    console.error("[SveltyCMS] ❌ Error during setup check:", error);
    setupStatus = false;
    return setupStatus;
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
    return setupStatus ?? true; // Default to true if config exists
  }

  try {
    // 3. Dynamic Import & Await Initialization
    const db = await import("../databases/db");

    // Call the function instead of accessing the exported const to avoid circular dependency issues
    if (typeof db.getDbInitPromise === "function") {
      await db.getDbInitPromise(); // CRITICAL: Wait for initialization to complete
    } else if (db.dbInitPromise) {
      await db.dbInitPromise;
    }

    const dbAdapter = db.dbAdapter;

    // Guard against uninitialized adapter
    if (!dbAdapter) {
      console.log("[setupCheck] DB adapter not available after initialization promise.");
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
      console.log("[setupCheck] Auth module not ready after initialization");
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
      setupStatus = false;
      setupStatusCheckedDb = true;
      return false;
    }

    // Update cache
    setupStatus = true;
    setupStatusCheckedDb = true;
    return true;
  } catch (error) {
    console.error("[SveltyCMS] ❌ Database validation failed during setup check:", error);
    // Log adapter status for diagnostics
    try {
      const db = await import("../databases/db");
      console.error(`[setupCheck Diagnostic] dbAdapter availability: ${!!db.dbAdapter}`);
    } catch {
      console.error(
        "[setupCheck Diagnostic] Could not even import db module during error handling.",
      );
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
  setupStatus = forceStatus;
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
          console.warn("[setupCheck] Could not clear private config cache:", err);
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
    pathname.startsWith("/login") ||
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
    pathname.startsWith("/api/graphql") ||
    pathname.startsWith("/api/settings/public") ||
    pathname.startsWith("/api/content/version") ||
    pathname.startsWith("/api/dashboard/health") ||
    pathname.startsWith("/api/collections") ||
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
