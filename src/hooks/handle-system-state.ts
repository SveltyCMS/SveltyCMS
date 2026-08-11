/**
 * @file src/hooks/handle-system-state.ts
 * @description
 * Hardened gatekeeper middleware with atomic boot locks and active timer cleanup.
 *
 * Design principle: the middleware waits synchronously for DB initialization
 * instead of redirecting to an intermediate warming-up page. The page-level
 * logic (e.g., [language]/+page.server.ts) handles redirects for empty
 * collections directly, saving system resources and eliminating polling.
 *
 * ### Features:
 * - Setup-complete gating (`/setup` → login; `/api/setup` → 403)
 * - Trusted-host enforcement after setup
 * - API gets typed 503 JSON; pages get SvelteKit error pages
 * - Static `getSetupState` import (no per-request dynamic import)
 */

import { dbInitPromise } from "@src/databases/db";
import { metricsService } from "@src/services/observability/metrics-service";
import { getSystemState, isSystemReady } from "@src/stores/system/state.svelte.ts";
import type { SystemState } from "@src/stores/system/types";
import type { Handle, RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { getSetupState, SetupState } from "@utils/server/setup-check";
import { isBootstrapRoute, getRequestFlags } from "@utils/hook-utils";

const dev = (() => {
  try {
    return import.meta.env?.DEV || process.env.NODE_ENV === "development";
  } catch {
    return false;
  }
})();

const INIT_TIMEOUT_MS = 60_000;
let initializationState: "pending" | "in-progress" | "complete" | "failed" = "pending";
let activeInitFlightPromise: Promise<void> | null = null;
let lastInitError: Error | null = null;

export const resetInitializationState = () => {
  initializationState = "pending";
  activeInitFlightPromise = null;
  lastInitError = null;
};

/**
 * Start (or restart) the boot flight. Failures are recorded on the state
 * machine (never an unhandled rejection — backgrounded bootstrap routes don't
 * await it); the await sites below re-check the failed state and rethrow the
 * recorded error so requests fail CLOSED instead of proceeding against an
 * uninitialized database.
 */
function startInitFlight(timeoutMs: number = INIT_TIMEOUT_MS): Promise<void> {
  initializationState = "in-progress";
  lastInitError = null;
  activeInitFlightPromise = waitForInitialization(timeoutMs)
    .then(() => {
      initializationState = "complete";
    })
    .catch((err) => {
      initializationState = "failed";
      lastInitError = err instanceof Error ? err : new Error(String(err));
      logger.error("[handleSystemState] Initialization failed", lastInitError);
    });
  return activeInitFlightPromise;
}

/**
 * Wait for the boot flight (bounded), then fail CLOSED if it failed.
 * A timed-out in-progress flight proceeds (self-healing store may still
 * transition) — same bounded-wait semantics as before, minus the silent
 * error swallowing.
 */
async function awaitInitOrThrow(): Promise<void> {
  const flight = activeInitFlightPromise || startInitFlight(10_000);
  try {
    await Promise.race([
      flight,
      new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), 10_000)),
    ]);
  } catch {
    // timed out — checked below
  }
  if (initializationState === "failed" && lastInitError) throw lastInitError;
}

let testModeWarned = false;
const IS_GK_TEST_MODE =
  process.env.TEST_MODE === "true" ||
  process.env.VITE_TEST_MODE === "true" ||
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  !!process.env.BUN_TEST;
const IS_STRICT_SETUP_CHECK = process.env.STRICT_SETUP_CHECK === "true";

/**
 * Renders an appropriate restricted-state response.
 * API routes get a typed 503, page routes get a SvelteKit error page.
 * No redirect to an intermediate warming-up page — the hooks resolve
 * synchronously once the DB is ready, and page-level logic handles
 * redirects (e.g., empty collections → collection builder).
 */
function throwRestrictedError(state: SystemState, pathname: string, msg: string): never {
  logger.warn(`[handleSystemState] Request blocked: ${pathname} | System state: ${state}`);
  if (pathname.startsWith("/api/")) throw new AppError(msg, 503, `SYSTEM_${state}`);
  throw error(503, { message: msg });
}

async function waitForInitialization(timeoutMs: number = INIT_TIMEOUT_MS): Promise<void> {
  const start = performance.now();
  let timerId: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      dbInitPromise,
      new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error("Initialization timeout")), timeoutMs);
      }),
    ]);
    if (typeof metricsService?.recordMetric === "function")
      metricsService.recordMetric("system:init:duration", performance.now() - start);
  } catch (err) {
    if (typeof metricsService?.recordMetric === "function")
      metricsService.recordMetric("system:init:timeout", 1);
    throw err;
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

function isTrustedHost(event: RequestEvent, setupComplete: boolean): boolean {
  if (!setupComplete) return true;
  const { host } = event.url;
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;
  if (process.env.SVELTYCMS_DEMO === "true") return true;
  const origin = process.env.ORIGIN;
  if (origin) {
    try {
      if (host === new URL(origin).host) return true;
    } catch {}
  }
  const trusted = dev ? process.env.HOST_DEV : process.env.HOST_PROD;
  return !trusted || host === trusted;
}

export const handleSystemState: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url;
  const flags = getRequestFlags(event.locals as any);
  if (flags.isStatic) return resolve(event);

  const systemState = getSystemState();
  const isHealthCheck = pathname.includes("/health");
  if (!isHealthCheck && dev) {
    logger.debug(
      `[SystemState] ${event.request.method} ${pathname}${search} | state: ${systemState.overallState}`,
    );
  }

  if (process.env.TEST_MODE === "true" && process.env.SKIP_GATEKEEPER === "true") {
    if (!testModeWarned) {
      logger.debug(`[Gatekeeper] SKIP_GATEKEEPER=true`);
      testModeWarned = true;
    }
    return resolve(event);
  }

  try {
    // Always evaluate setup state dynamically — a module-level
    // setupConfirmedComplete flag went stale after wizard resets (a reset
    // keeps config/private.ts but wipes the DB, so the shallow check alone
    // reported COMPLETE while the system was back in SETUP). getSetupState()
    // is memoized internally (fast shallow check + one-time deep DB check).
    const setupState = await getSetupState();
    (event.locals as any).__setupState = setupState;
    const setupComplete = setupState === SetupState.COMPLETE;

    if (systemState.overallState === "IDLE" && initializationState === "pending" && setupComplete) {
      logger.info("[handleSystemState] Starting system initialization flow...");
      startInitFlight();
      if (!event.isDataRequest && isBootstrapRoute(pathname)) {
        logger.debug(`[handleSystemState] Backgrounding init for route: ${pathname}`);
      } else {
        await awaitInitOrThrow();
      }
    }

    if (isBootstrapRoute(pathname)) {
      if (!isTrustedHost(event, setupComplete)) {
        metricsService.incrementSecurityViolations();
        logger.warn(`[Security] Untrusted host blocked: ${event.url.host}`);
        throw new AppError("Access from untrusted host blocked", 403, "UNTRUSTED_HOST");
      }
      if (
        (!IS_GK_TEST_MODE || IS_STRICT_SETUP_CHECK) &&
        setupComplete &&
        (pathname === "/setup" ||
          pathname.startsWith("/setup/") ||
          pathname.startsWith("/api/setup"))
      ) {
        if (pathname.startsWith("/api/"))
          throw new AppError("Setup already complete", 403, "SETUP_ALREADY_COMPLETE");
        return new Response(null, {
          status: 302,
          headers: { Location: "/login" },
        });
      }
      // Redirect root to /setup when setup is incomplete, regardless of
      // system state. getSetupState() may have triggered a background boot
      // that changed the state, so re-fetch after the setup check.
      if (pathname === "/" && !setupComplete) {
        const currentState = getSystemState();
        if (currentState.overallState === "SETUP" || currentState.overallState === "READY") {
          return new Response(null, {
            status: 302,
            headers: { Location: "/setup" },
          });
        }
      }
      return resolve(event);
    }

    const needsWait =
      systemState.overallState === "INITIALIZING" ||
      systemState.overallState === "RECOVERY" ||
      initializationState === "in-progress" ||
      (systemState.overallState === "SETUP" && setupComplete);
    if (needsWait) {
      if (activeInitFlightPromise) await awaitInitOrThrow();
      else await waitForInitialization();
    }

    const activeSystemState = needsWait ? getSystemState() : systemState;
    if (activeSystemState.overallState === "INITIALIZING") {
      logger.warn("[handleSystemState] System stuck in INITIALIZING — bypassing gate.");
      return resolve(event);
    }
    if (activeSystemState.overallState === "RECOVERY") {
      logger.warn("[handleSystemState] System stuck in RECOVERY — bypassing gate.");
      return resolve(event);
    }

    if (activeSystemState.overallState === "IDLE" && setupComplete) {
      // Self-healing: a failed boot is re-triggered on the next request
      // (fail fast when dbInitPromise rejects; bounded 10s wait when it hangs).
      if (initializationState === "pending" || initializationState === "failed") {
        startInitFlight(10_000);
      }
      await awaitInitOrThrow();
      return resolve(event);
    }

    const restricted: SystemState[] = [
      "IDLE",
      "INITIALIZING",
      "RECOVERY",
      "SETUP",
      "MAINTENANCE",
      "FAILED",
    ];
    if (restricted.includes(activeSystemState.overallState as any)) {
      if (setupComplete && activeSystemState.overallState === "SETUP") {
        // Setup is complete but state machine hasn't transitioned yet —
        // treat same as IDLE+setupComplete: wait for DB init, then proceed.
        if (initializationState === "pending" || initializationState === "failed") {
          startInitFlight(10_000);
        }
        await awaitInitOrThrow();
        return resolve(event);
      } else
        throwRestrictedError(
          activeSystemState.overallState,
          pathname,
          "System temporarily unavailable. Please retry.",
        );
    }

    if (!isSystemReady()) throw new AppError("Service Unavailable", 503, "SYSTEM_STARTING_UP");

    if (activeSystemState.overallState === "DEGRADED") {
      const unhealthyServices = Object.entries(activeSystemState.services)
        .filter(([, s]) => s.status === "unhealthy")
        .map(([n]) => n);
      if (unhealthyServices.length > 0) {
        event.locals.degradedServices = unhealthyServices;
        logger.warn(`[SystemState] DEGRADED — unhealthy: ${unhealthyServices.join(", ")}`);
      }
    }

    return resolve(event);
  } catch (err) {
    if (pathname.startsWith("/api/")) return handleApiError(err, event);
    if (err instanceof AppError) throw error(err.status, err.message);
    throw err;
  }
};
