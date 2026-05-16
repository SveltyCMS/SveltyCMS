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
import { getSystemState, isSystemReady } from "@src/stores/system/state.svelte";
import type { SystemState } from "@src/stores/system/types";
import type { Handle, RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { isSetupComplete } from "@utils/setup-check";
import { isBootstrapRoute } from "@utils/hook-utils";
import { STATIC_ASSET_REGEX } from "./handle-static-asset-caching";

const INIT_TIMEOUT_MS = 60_000;

// Track initialization lifecycle
let initializationState: "pending" | "in-progress" | "complete" | "failed" = "pending";

/**
 * Resets initialization for recovery/testing
 */
export const resetInitializationState = () => {
  initializationState = "pending";
};

// Global for log throttling
let testModeWarned = false;

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────

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
  const { pathname, search } = event.url;
  const isAsset = STATIC_ASSET_REGEX.test(pathname);
  const isHealthCheck = pathname.includes("/health");

  // Skip logic for static performance
  if (isAsset) return resolve(event);

  const systemState = getSystemState();

  // Observability
  if (!isHealthCheck) {
    logger.debug(
      `[SystemState] ${event.request.method} ${pathname}${search} | state: ${colorState(systemState.overallState)}`,
    );
  }

  // Global Test Bypass (CI/Playwright) - Only if explicitly requested to skip
  if (process.env.TEST_MODE === "true" && process.env.SKIP_GATEKEEPER === "true") {
    if (!testModeWarned) {
      logger.warn(`[Gatekeeper] SKIP_GATEKEEPER enabled. Bypassing state checks.`);
      testModeWarned = true;
    }
    return resolve(event);
  }

  try {
    // --- Phase 1: Initialization Flow ---
    const { getSetupState, SetupState } = await import("@utils/setup-check");
    const setupState = await getSetupState();
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

      // Root redirect during setup
      if (pathname === "/" && systemState.overallState === "SETUP" && !setupComplete) {
        return new Response(null, { status: 302, headers: { Location: "/setup" } });
      }

      return resolve(event);
    }

    // --- Phase 3: Restricted Access Handling ---

    // Explicit wait if system is still initializing or transitioning from SETUP
    const isTransitioning = systemState.overallState === "SETUP" && setupComplete;
    if (
      systemState.overallState === "INITIALIZING" ||
      initializationState === "in-progress" ||
      isTransitioning
    ) {
      await waitForInitialization();
    }

    // Block non-bootstrap routes if system is not in a 'Ready' state
    const restricted: SystemState[] = ["IDLE", "INITIALIZING", "SETUP", "MAINTENANCE", "FAILED"];
    if (restricted.includes(systemState.overallState as any)) {
      // If we are actually finished with setup but the state hasn't updated yet, allow a retry or wait
      if (setupComplete && systemState.overallState === "SETUP") {
        logger.debug(
          "[handleSystemState] Setup complete but state still SETUP - awaiting one more time",
        );
        await waitForInitialization();
      } else {
        const msg =
          systemState.overallState === "SETUP"
            ? "System is in Setup Mode. Please complete configuration."
            : `System is currently in ${systemState.overallState} mode. Non-bootstrap access is restricted.`;

        logger.warn(
          `[handleSystemState] Request blocked: ${pathname} | System state: ${systemState.overallState}`,
        );
        throw new AppError(msg, 503, `SYSTEM_${systemState.overallState}`);
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
    if (systemState.overallState === "DEGRADED") {
      const unhealthyServices = Object.entries(systemState.services)
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
