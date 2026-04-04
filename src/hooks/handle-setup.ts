/**
 * @file src\hooks\handle-setup.ts
 * @description Middleware to manage the initial application setup process.
 *
 * Improvements:
 * - **Performance:** Removed redundant file reading. Relies purely on the memoized `isSetupComplete` utility.
 * - **Cleanliness:** Removed unused `fs` and `path` imports.
 * - **Logic:** Simplified flow—if `isSetupComplete` returns true, the config is valid.
 */

import { error, type Handle, redirect } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { getSetupState, SetupState } from "@utils/setup-check";

// --- CONSTANTS ---

/**
 * Regex pattern to identify asset requests that should always be allowed.
 * These are essential for the setup page UI to render properly.
 */
const ASSET_REGEX =
  /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map))/;

// --- UTILITY FUNCTIONS ---

// Checks if a pathname is an allowed route during setup.
function isAllowedDuringSetup(pathname: string): boolean {
  // Allow standard setup, API setup, version check, assets, AND localized setup
  return (
    pathname.startsWith("/setup") ||
    /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname) || // Localized setup (e.g. /en/setup)
    pathname.startsWith("/api/system") || // Allow system API during setup
    pathname.startsWith("/api/settings/public") || // Allow public settings
    pathname.startsWith("/api/user") || // Allow user logic during setup
    pathname.startsWith("/api/auth") || // Allow auth logic during setup
    pathname === "/api/system/version" ||
    ASSET_REGEX.test(pathname)
  );
}

/**
 * Creates a response resolver with special headers for setup mode.
 * This allows the setup API to set cookies (like admin session) before redirecting.
 */
function createSetupResolver() {
  return {
    filterSerializedResponseHeaders: (name: string) => {
      const lower = name.toLowerCase();
      return (
        lower.startsWith("content-") ||
        lower.startsWith("etag") ||
        lower === "set-cookie" ||
        lower === "cache-control"
      );
    },
  };
}

// --- MAIN HOOK ---

export const handleSetup: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;
  const isApi = pathname.startsWith("/api/");

  const isTestMode = process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";

  // Bypass setup checks in TEST_MODE to allow /api/testing and setup actions to function
  // We explicitly check for /api/testing or /api/setup or /setup to allow them
  const isAllowedTestRoute =
    pathname.startsWith("/api/testing") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api/auth") || // Auth must work during setup for admin creation
    pathname.startsWith("/api/system"); // System health must work

  if (isTestMode && isAllowedTestRoute) {
    return await resolve(event);
  }

  try {
    // --- Step 1: Check Setup Status ---
    // We use the granular setup state to decide what to allow.
    const state = await getSetupState();
    const isComplete = state === SetupState.COMPLETE;
    const isConfigReady = state === SetupState.MISSING_ADMIN;

    // --- Step 2: Handle Incomplete Setup ---
    if (!isComplete) {
      // Log warning only once per request flow to prevent spam
      if (!(event.locals.__setupLogged || isAllowedDuringSetup(pathname))) {
        logger.warn(`System requires initial setup. State: ${state}`);
        event.locals.__setupLogged = true;
      }

      // Allow access to setup routes and assets
      if (isAllowedDuringSetup(pathname)) {
        // ✨ SECURITY GATING:
        // If config exists but we're on /setup without an admin step,
        // we might want to hint to the frontend or skip the redirect.
        // For now, we allow the request and the frontend + server actions will enforce the lock.
        return await resolve(event, createSetupResolver());
      }

      // For API requests, return a proper error instead of redirecting
      if (isApi) {
        throw new AppError(
          isConfigReady ? "Admin creation required." : "System setup required.",
          503,
          "SETUP_REQUIRED",
        );
      }

      // Redirect everything else to /setup
      if (!event.locals.__setupRedirectLogged) {
        logger.debug(`Redirecting ${pathname} to /setup`);
        event.locals.__setupRedirectLogged = true;
      }
      throw redirect(302, "/setup");
    }

    // --- Step 3: Handle Complete Setup ---
    // If setup is complete, BLOCK ALL access to /setup routes (including localized ones).
    // This prevents unauthenticated setup actions from being called after initialization.
    // EXCEPTION: Allow in TEST_MODE for automated testing of the wizard logic.
    const isSetupRoute =
      pathname.startsWith("/setup") || /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);
    const isTestMode = process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";

    if (isSetupRoute && !isTestMode) {
      // Special Case: Allow the finalization action to proceed
      // This handles the transition where config exists but setup is just finishing.
      if (event.request.method === "POST" && event.url.search.includes("/completeSetup")) {
        return await resolve(event, createSetupResolver());
      }

      if (event.request.method === "GET") {
        if (!event.locals.__setupLoginRedirectLogged) {
          logger.trace(`Setup complete. Blocking access to ${pathname}, redirecting to /login`);
          event.locals.__setupLoginRedirectLogged = true;
        }
        throw redirect(302, "/");
      }

      // Block POST/PUT/DELETE to setup routes once complete
      logger.warn(
        `Blocked ${event.request.method} request to ${pathname} - setup already complete`,
      );
      if (isApi || event.request.headers.get("accept")?.includes("application/json")) {
        throw new AppError("Setup already complete.", 403, "FORBIDDEN");
      }
      throw error(403, "Setup already complete.");
    }

    // Proceed normally
    return await resolve(event);
  } catch (err) {
    if (isApi) {
      return handleApiError(err, event);
    }

    if (err instanceof AppError) {
      throw error(err.status, err.message);
    }

    throw err;
  }
};
