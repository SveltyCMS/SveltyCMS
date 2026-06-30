/**
 * @file src/hooks/handle-system-state.ts
 * @description Hardened gatekeeper middleware with atomic boot locks and active timer cleanup.
 */

import { dbInitPromise } from "@src/databases/db";
import { metricsService } from "@src/services/observability/metrics-service";
import { getSystemState, isSystemReady } from "@src/stores/system/state.svelte.ts";
import type { SystemState } from "@src/stores/system/types";
import type { Handle, RequestEvent } from "@sveltejs/kit";
import { error } from "@sveltejs/kit";
import { AppError, handleApiError } from "@utils/error-handling";
import { logger } from "@utils/logger";
import { isSetupComplete, SetupState } from "@utils/server/setup-check";
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
let setupConfirmedComplete = false;
let activeInitFlightPromise: Promise<void> | null = null;

export const resetInitializationState = () => {
  initializationState = "pending";
  setupConfirmedComplete = false;
  activeInitFlightPromise = null;
};

let testModeWarned = false;
const IS_GK_TEST_MODE =
  process.env.TEST_MODE === "true" ||
  process.env.VITE_TEST_MODE === "true" ||
  process.env.BENCHMARK === "true" ||
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  !!process.env.BUN_TEST;
const IS_STRICT_SETUP_CHECK = process.env.STRICT_SETUP_CHECK === "true";

function renderRestrictedResponse(
  event: RequestEvent,
  state: SystemState,
  pathname: string,
  msg: string,
): Response {
  logger.warn(`[handleSystemState] Request blocked: ${pathname} | System state: ${state}`);
  if (pathname.startsWith("/api/")) throw new AppError(msg, 503, `SYSTEM_${state}`);
  if (pathname !== "/warming-up")
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/warming-up?redirect=${encodeURIComponent(event.url.pathname + event.url.search)}`,
      },
    });
  throw new AppError(msg, 503, `SYSTEM_${state}`);
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

function isTrustedHost(event: RequestEvent): boolean {
  if (!isSetupComplete()) return true;
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
    let setupState: SetupState;
    if (setupConfirmedComplete && isSetupComplete()) {
      setupState = SetupState.COMPLETE;
    } else {
      setupConfirmedComplete = false;
      const { getSetupState } = await import("@utils/server/setup-check");
      setupState = await getSetupState();
      if (setupState === SetupState.COMPLETE) setupConfirmedComplete = true;
    }
    (event.locals as any).__setupState = setupState;
    const setupComplete = setupState === SetupState.COMPLETE;

    if (systemState.overallState === "IDLE" && initializationState === "pending" && setupComplete) {
      initializationState = "in-progress";
      logger.info("[handleSystemState] Starting system initialization flow...");
      activeInitFlightPromise = waitForInitialization()
        .then(() => {
          initializationState = "complete";
        })
        .catch((_err) => {
          initializationState = "failed";
          logger.error("[handleSystemState] Initialization failed", _err);
        });
      if (!event.isDataRequest && isBootstrapRoute(pathname)) {
        logger.debug(`[handleSystemState] Backgrounding init for route: ${pathname}`);
      } else {
        await activeInitFlightPromise;
      }
    }

    if (isBootstrapRoute(pathname)) {
      if (!isTrustedHost(event)) {
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
      if (pathname === "/" && systemState.overallState === "SETUP" && !setupComplete)
        return new Response(null, {
          status: 302,
          headers: { Location: "/setup" },
        });
      return resolve(event);
    }

    const needsWait =
      systemState.overallState === "INITIALIZING" ||
      initializationState === "in-progress" ||
      (systemState.overallState === "SETUP" && setupComplete);
    if (needsWait) {
      if (activeInitFlightPromise) await activeInitFlightPromise;
      else await waitForInitialization();
    }

    const activeSystemState = needsWait ? getSystemState() : systemState;
    if (activeSystemState.overallState === "INITIALIZING") {
      logger.warn("[handleSystemState] System stuck in INITIALIZING — bypassing gate.");
      return resolve(event);
    }

    if (activeSystemState.overallState === "IDLE" && setupComplete) {
      if (initializationState === "pending") {
        initializationState = "in-progress";
        activeInitFlightPromise = waitForInitialization()
          .then(() => {
            initializationState = "complete";
          })
          .catch((_err) => {
            initializationState = "failed";
          });
      }
      try {
        await Promise.race([
          activeInitFlightPromise || waitForInitialization(10_000),
          new Promise((r) => setTimeout(r, 10_000)),
        ]);
      } catch {}
      return resolve(event);
    }

    const restricted: SystemState[] = ["IDLE", "INITIALIZING", "SETUP", "MAINTENANCE", "FAILED"];
    if (restricted.includes(activeSystemState.overallState as any)) {
      if (setupComplete && activeSystemState.overallState === "SETUP") {
        await waitForInitialization();
        const postWaitState = getSystemState();
        if (restricted.includes(postWaitState.overallState as any))
          return renderRestrictedResponse(
            event,
            postWaitState.overallState,
            pathname,
            "System in setup mode.",
          );
      } else
        return renderRestrictedResponse(
          event,
          activeSystemState.overallState,
          pathname,
          "System restricted.",
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
