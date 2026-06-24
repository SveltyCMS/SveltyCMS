/**
 * @file src/hooks/handle-system-state.ts
 * @description
 * Gatekeeper middleware for system operational state.
 * Ensures the system is properly initialized and authorized before processing non-bootstrap requests.
 *
 * ### Features:
 * - Enterprise-ready boot protection (Self-healing).
 * - Multi-state awareness (READY, SETUP, MAINTENANCE, FAILED).
 * - Trusted host validation for bootstrap flows.
 * - Integration with central state machine (@stores/system).
 */

// Safe environment detection for SvelteKit and standalone/benchmark environments
const dev = (() => {
  try {
    // @ts-ignore
    return import.meta.env?.DEV || process.env.NODE_ENV === "development";
  } catch {
    return false;
  }
})();
import { dbInitPromise } from "@src/databases/db";
import { metricsService } from "@src/services/observability/metrics-service";
import { getSystemState, isSystemReady } from "@src/stores/system/state.svelte.ts";
import type { SystemState } from "@src/stores/system/types";
import type { Handle, RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { isSetupComplete, SetupState } from "@utils/setup-check";
import { isBootstrapRoute, getRequestFlags } from "@utils/hook-utils";

const INIT_TIMEOUT_MS = 60_000;

// Track initialization lifecycle
let initializationState: "pending" | "in-progress" | "complete" | "failed" = "pending";

// 🚀 Cache setup completion to avoid dynamic import + deep check on every request
let setupConfirmedComplete = false;

/**
 * Resets initialization for recovery/testing
 */
export const resetInitializationState = () => {
  initializationState = "pending";
  setupConfirmedComplete = false;
};

// Global for log throttling
let testModeWarned = false;

// 🚀 Module-level cached env flags — avoids process.env lookups on every request
const IS_GK_TEST_MODE =
  process.env.TEST_MODE === "true" ||
  process.env.VITE_TEST_MODE === "true" ||
  process.env.BENCHMARK === "true" ||
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  !!process.env.BUN_TEST;
const IS_STRICT_SETUP_CHECK = process.env.STRICT_SETUP_CHECK === "true";

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Renders an appropriate response for restricted system states.
 * - API requests: returns 503 JSON error
 * - Page requests: redirects to /warming-up with the original URL as a query param
 */
function renderRestrictedResponse(
  event: RequestEvent,
  state: SystemState,
  pathname: string,
  msg: string,
): Response {
  logger.warn(`[handleSystemState] Request blocked: ${pathname} | System state: ${state}`);

  // API requests: keep the 503 error for machine clients
  if (pathname.startsWith("/api/")) {
    throw new AppError(msg, 503, `SYSTEM_${state}`);
  }

  // Non-warming-up page requests: redirect to friendly warming-up page
  if (pathname !== "/warming-up") {
    const redirectUrl = encodeURIComponent(event.url.pathname + event.url.search);
    return new Response(null, {
      status: 302,
      headers: { Location: `/warming-up?redirect=${redirectUrl}` },
    });
  }

  // Already on warming-up page — throw so SvelteKit renders the error page
  throw new AppError(msg, 503, `SYSTEM_${state}`);
}

function colorState(state: string): string {
  const colors: Record<string, string> = {
    READY: "\x1b[32m",
    WARMED: "\x1b[36m",
    DEGRADED: "\x1b[33m",
    INITIALIZING: "\x1b[33m",
    SETUP: "\x1b[35m",
    FAILED: "\x1b[31m",
    IDLE: "\x1b[90m",
    MAINTENANCE: "\x1b[35m",
  };
  return `${colors[state] || "\x1b[0m"}${state}\x1b[0m`;
}

/**
 * Robust waiter for database and system services initialization.
 * Prevents "Double Fetch" or "Partial Boot" inconsistencies.
 */
async function waitForInitialization(timeoutMs: number = INIT_TIMEOUT_MS): Promise<void> {
  const start = performance.now();
  try {
    await Promise.race([
      dbInitPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Initialization timeout")), timeoutMs),
      ),
    ]);
    if (typeof metricsService?.recordMetric === "function") {
      metricsService.recordMetric("system:init:duration", performance.now() - start);
    }
  } catch (err) {
    if (typeof metricsService?.recordMetric === "function") {
      metricsService.recordMetric("system:init:timeout", 1);
    }
    throw err;
  }
}

/**
 * Dynamic validation of the requesting host.
 * Crucial for preventing SSRF and DNS rebinding during bootstrap phases.
 */
function isTrustedHost(event: RequestEvent): boolean {
  if (!isSetupComplete()) return true; // Bootstrap phase is permissive until configured

  const { host } = event.url;

  // 1. Loopback always trusted
  if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) return true;

  // 2. Demo Mode bypass
  if (process.env.SVELTYCMS_DEMO === "true") return true;

  // 3. Environment Origin check
  const origin = process.env.ORIGIN;
  if (origin) {
    try {
      if (host === new URL(origin).host) return true;
    } catch {}
  }

  // 4. Strict Production/Development host validation
  const trusted = dev ? process.env.HOST_DEV : process.env.HOST_PROD;
  return !trusted || host === trusted;
}

// ──────────────────────────────────────────────────────────────
// MAIN GATEKEEPER HOOK
// ──────────────────────────────────────────────────────────────

export const handleSystemState: Handle = async ({ event, resolve }) => {
  // 🧪 TEST MODE BYPASS: Verified test requests skip ALL system state gating.
  // This ensures /api/testing/reset, /api/testing/seed, and test API calls
  // work reliably after system state transitions (reset sets state to IDLE/SETUP).
  if ((event.locals as any).__testBypass === true) {
    return resolve(event);
  }

  const { pathname, search } = event.url;
  // 🚀 Reuse pre-computed flags from handleTurboPipeline (classifyRequest)
  const flags = getRequestFlags(event.locals as any);
  const isAsset = flags.isStatic;
  const isHealthCheck = pathname.includes("/health");

  // Skip logic for static performance
  if (isAsset) return resolve(event);

  const systemState = getSystemState();

  // Observability — only in dev mode to avoid string interpolation overhead on every request
  if (!isHealthCheck && dev) {
    logger.debug(
      `[SystemState] ${event.request.method} ${pathname}${search} | state: ${colorState(systemState.overallState)}`,
    );
  }

  // Global Test Bypass (CI/Playwright) - Only if explicitly requested to skip
  if (process.env.TEST_MODE === "true" && process.env.SKIP_GATEKEEPER === "true") {
    if (!testModeWarned) {
      logger.debug(
        `[Gatekeeper] SKIP_GATEKEEPER=true → bypassing firewall, rate-limit, and state checks (benchmark/CI mode — raw performance measurement)`,
      );
      testModeWarned = true;
    }
    return resolve(event);
  }

  try {
    // --- Phase 1: Initialization Flow ---
    // 🚀 Fast-path: Once setup is confirmed complete, skip dynamic import + deep DB check entirely.
    // Still validates via isSetupComplete() for safety (handles test resets / config changes).
    let setupState: SetupState;
    if (setupConfirmedComplete && isSetupComplete()) {
      setupState = SetupState.COMPLETE;
    } else {
      setupConfirmedComplete = false;
      // Cold path: dynamic import only when setup status is unknown or incomplete
      const { getSetupState } = await import("@utils/setup-check");
      setupState = await getSetupState();
      if (setupState === SetupState.COMPLETE) {
        setupConfirmedComplete = true;
      }
    }
    (event.locals as any).__setupState = setupState;
    const setupComplete = setupState === SetupState.COMPLETE;

    if (systemState.overallState === "IDLE" && initializationState === "pending" && setupComplete) {
      initializationState = "in-progress";
      logger.info("[handleSystemState] Starting system initialization flow...");

      const initPromise = waitForInitialization()
        .then(() => {
          initializationState = "complete";
        })
        .catch((err) => {
          initializationState = "failed";
          logger.error("[handleSystemState] Initialization sequence failed", err);
        });

      // Special case: Allow bootstrap UI to load while system warms up in the background
      if (!event.isDataRequest && isBootstrapRoute(pathname)) {
        logger.debug(`[handleSystemState] Backgrounding initialization for route: ${pathname}`);
      } else {
        await initPromise;
      }
    }

    // --- Phase 2: Bootstrap & Setup Routing ---
    if (isBootstrapRoute(pathname)) {
      if (!isTrustedHost(event)) {
        metricsService.incrementSecurityViolations();
        logger.warn(`[Security] Untrusted host blocked: ${event.url.host} -> ${pathname}`);
        throw new AppError("Access from untrusted host blocked", 403, "UNTRUSTED_HOST");
      }

      // 🛡️ Redirect/Block setup routes if setup is already complete (except in test environment)
      if (
        (!IS_GK_TEST_MODE || IS_STRICT_SETUP_CHECK) &&
        setupComplete &&
        (pathname === "/setup" ||
          pathname.startsWith("/setup/") ||
          pathname.startsWith("/api/setup"))
      ) {
        if (pathname.startsWith("/api/")) {
          throw new AppError("Setup already complete", 403, "SETUP_ALREADY_COMPLETE");
        }
        return new Response(null, {
          status: 302,
          headers: { Location: "/login" },
        });
      }

      // Root redirect during setup
      if (pathname === "/" && systemState.overallState === "SETUP" && !setupComplete) {
        return new Response(null, {
          status: 302,
          headers: { Location: "/setup" },
        });
      }

      return resolve(event);
    }

    // --- Phase 3: Restricted Access Handling ---

    // Determine if we need to wait: re-use systemState from above unless phase 1/2 triggered init
    const needsWait =
      systemState.overallState === "INITIALIZING" ||
      initializationState === "in-progress" ||
      (systemState.overallState === "SETUP" && setupComplete);

    if (needsWait) {
      await waitForInitialization();
    }

    // 🚀 CRITICAL: Re-query system state after waiting for initialization to avoid stale snapshot bugs!
    // Only re-query if we actually waited. Otherwise reuse the cached systemState.
    const activeSystemState = needsWait ? getSystemState() : systemState;

    // 🛡️ SELF-HEALING: If stuck in INITIALIZING > 60s, bypass gatekeeper rather than 503-loop.
    // This prevents the infamous "System INITIALIZING" deadlock after hot-reloads.
    if (activeSystemState.overallState === "INITIALIZING") {
      logger.warn("[handleSystemState] System appears stuck in INITIALIZING — bypassing gate.");
      return resolve(event);
    }

    // 🛡️ SELF-HEALING: If IDLE but setup is complete, trigger boot and wait briefly.
    // This prevents both 503 loops and the "Database connection error" modal on login.
    if (activeSystemState.overallState === "IDLE" && setupComplete) {
      if (initializationState === "pending") {
        initializationState = "in-progress";
        logger.info("[handleSystemState] Starting system initialization flow...");
        waitForInitialization()
          .then(() => {
            initializationState = "complete";
          })
          .catch((err) => {
            initializationState = "failed";
            logger.error("[handleSystemState] Initialization sequence failed", err);
          });
      }
      // Wait up to 10s for boot to complete, then serve regardless
      try {
        await Promise.race([
          waitForInitialization(10_000),
          new Promise((r) => setTimeout(r, 10_000)),
        ]);
      } catch {
        /* timeout — serve anyway */
      }
      logger.warn("[handleSystemState] System IDLE — served after waiting for boot.");
      return resolve(event);
    }

    // Block non-bootstrap routes if system is not in a 'Ready' state
    const restricted: SystemState[] = ["IDLE", "INITIALIZING", "SETUP", "MAINTENANCE", "FAILED"];
    if (restricted.includes(activeSystemState.overallState as any)) {
      // If we are actually finished with setup but the state hasn't updated yet, allow a retry or wait
      if (setupComplete && activeSystemState.overallState === "SETUP") {
        logger.debug(
          "[handleSystemState] Setup complete but state still SETUP - awaiting one more time",
        );
        await waitForInitialization();
        // Re-query one more time after secondary wait
        const postWaitState = getSystemState();
        if (restricted.includes(postWaitState.overallState as any)) {
          return renderRestrictedResponse(
            event,
            postWaitState.overallState,
            pathname,
            postWaitState.overallState === "SETUP"
              ? "System is in Setup Mode. Please complete configuration."
              : `System is currently in ${postWaitState.overallState} mode. Non-bootstrap access is restricted.`,
          );
        }
      } else {
        return renderRestrictedResponse(
          event,
          activeSystemState.overallState,
          pathname,
          activeSystemState.overallState === "SETUP"
            ? "System is in Setup Mode. Please complete configuration."
            : `System is currently in ${activeSystemState.overallState} mode. Non-bootstrap access is restricted.`,
        );
      }
    }

    // Final readiness check via internal state helper
    if (!isSystemReady()) {
      throw new AppError(
        "Service Unavailable: System is finishing startup.",
        503,
        "SYSTEM_STARTING_UP",
      );
    }

    // --- Phase 4: State Enrichment (Degraded Service Detection) ---
    if (activeSystemState.overallState === "DEGRADED") {
      const unhealthyServices = Object.entries(activeSystemState.services)
        .filter(([, service]) => service.status === "unhealthy")
        .map(([name]) => name);

      if (unhealthyServices.length > 0) {
        event.locals.degradedServices = unhealthyServices;
        logger.warn(
          `[SystemState] Proceeding in DEGRADED mode. Unhealthy services: ${unhealthyServices.join(", ")}`,
        );
      }
    }

    // All checks passed
    return resolve(event);
  } catch (err) {
    // API-specific error wrapping
    if (pathname.startsWith("/api/")) {
      return handleApiError(err, event);
    }

    // Page-specific error throwing
    if (err instanceof AppError) {
      throw error(err.status, err.message);
    }

    // Allow native SvelteKit errors to bubble
    throw err;
  }
};
