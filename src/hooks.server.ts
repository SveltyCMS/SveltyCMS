/**
 * @file src/hooks.server.ts
 * @description Hook middleware pipeline with unified metrics and automated security response
 *
 * This file orchestrates a streamlined sequence of middleware to handle
 * all incoming server requests. The architecture emphasizes security, observability,
 * and performance with unified metrics collection and automated threat detection.
 *
 * Updated 2026-03-15:
 * - Moved addSecurityHeaders to TOP of sequence → ensures headers on ALL responses,
 *   including errors thrown by earlier middlewares (rate-limit 429, firewall blocks, etc.)
 */

import { metricsService } from "@src/services/observability/metrics-service";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { logger } from "@utils/logger";
import { building } from "$app/environment";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import os from "node:os";
import { runWithContext, runWithTrace, getTrace, traceSpan } from "@utils/context";
import { createRequire } from "node:module";
// ESM Shims for legacy CJS compatibility in production build
if (typeof (globalThis as any).require === "undefined") {
  (globalThis as any).require = createRequire(import.meta.url);
}
if (typeof (globalThis as any).__filename === "undefined") {
  (globalThis as any).__filename = fileURLToPath(import.meta.url);
}
if (typeof (globalThis as any).__dirname === "undefined") {
  (globalThis as any).__dirname = dirname((globalThis as any).__filename);
}

import { isSetupComplete } from "@utils/setup-check-fast";

// 🚀 ZERO-RESTART ARCHITECTURE:
// We track the setup state dynamically to allow the system to switch from
// 'SETUP' mode to 'READY' mode without a full process restart.
let setupComplete =
  (typeof (globalThis as any).__SVELTY_SETUP_COMPLETE__ !== "undefined" &&
    (globalThis as any).__SVELTY_SETUP_COMPLETE__ === true) ||
  isSetupComplete();

// ✨ ENTERPRISE: Stable Node ID for Distributed Cache Sync (Phase 8)
if (typeof (globalThis as any).__SVELTY_NODE_ID__ === "undefined") {
  (globalThis as any).__SVELTY_NODE_ID__ = crypto.randomUUID();
}

import { handleTurboPipeline } from "./hooks/handle-turbo-pipeline.server";
import { handleCompression } from "./hooks/handle-compression";
import { handleSecurityHeaders, applyAllSecurityHeaders } from "./hooks/handle-security-headers";

import { getTestSecret } from "@src/utils/setup-check";

// 🚀 HYPER-TURBO BYPASS (Enterprise)

const handleHyperTurbo: Handle = async ({ event, resolve }) => {
  const isBenchmark =
    process.env.BENCHMARK === "true" || process.env.SVELTY_BENCHMARK_SUITE === "true";
  if (!isBenchmark) return resolve(event);

  const testSecret = event.request.headers.get("x-test-secret");
  if (testSecret && testSecret === getTestSecret()) {
    // 🚀 Inject system admin user for benchmarks, but let the FULL pipeline run.
    // Previously this was a terminal bypass that skipped all 16 middleware hooks.
    // Now it only sets up the user context — handleTurboPipeline and all downstream
    // hooks (RBAC, rate limiting, audit logging) run normally for honest measurements.
    (event.locals as any).user = {
      _id: "system",
      role: "admin",
      isAdmin: true,
      email: "system@sveltycms",
    };
    (event.locals as any).tenantId = event.request.headers.get("x-tenant-id") || null;
    // 🚀 NO __testBypass — no early return — let the pipeline run
  }
  return resolve(event);
};

// Only import full CMS hooks if setup is complete to avoid premature DB load
const passThrough: Handle = ({ event, resolve }) => resolve(event);

let handleSecurity: Handle = passThrough,
  handleUserPreferences: Handle = passThrough,
  handleAuthentication: Handle = passThrough,
  handleAuthorization: Handle = passThrough,
  handleLocalSdk: Handle = passThrough,
  handleContentInitialization: Handle = passThrough,
  handleApiRequests: Handle = passThrough,
  handleAuditLogging: Handle = passThrough,
  handleTokenResolution: Handle = passThrough,
  handleRedirects: Handle = passThrough,
  handleSystemState: Handle = passThrough,
  handleTestIsolation: Handle = passThrough,
  handleStaticAssetCaching: Handle = passThrough;

// ✨ ENTERPRISE: Lazy-loaded handle variables for dynamic mode switching
let fullMiddlewareInitialized = false;

async function ensureFullMiddleware() {
  if (fullMiddlewareInitialized) return;

  const security = await import("./hooks/handle-security");
  handleSecurity = security.handleSecurity;
  const preferences = await import("./hooks/handle-user-preferences");
  handleUserPreferences = preferences.handleUserPreferences;
  const auth = await import("./hooks/handle-authentication");
  handleAuthentication = auth.handleAuthentication;
  const authz = await import("./hooks/handle-authorization");
  handleAuthorization = authz.handleAuthorization;
  const sdk = await import("./hooks/handle-local-sdk");
  handleLocalSdk = sdk.handleLocalSdk;
  const content = await import("./hooks/handle-content-initialization");
  handleContentInitialization = content.handleContentInitialization;
  const api = await import("./hooks/handle-api-requests");
  handleApiRequests = api.handleApiRequests;
  const audit = await import("./hooks/handle-audit-logging");
  handleAuditLogging = audit.handleAuditLogging;
  const token = await import("./hooks/handle-token-resolution");
  handleTokenResolution = token.handleTokenResolution;
  const redirects = await import("./hooks/handle-redirects");
  handleRedirects = redirects.handleRedirects;
  const state = await import("./hooks/handle-system-state");
  handleSystemState = state.handleSystemState;
  const isolation = await import("./hooks/handle-test-isolation");
  handleTestIsolation = isolation.handleTestIsolation;
  const caching = await import("./hooks/handle-static-asset-caching");
  handleStaticAssetCaching = caching.handleStaticAssetCaching;

  fullMiddlewareInitialized = true;
}

if (setupComplete) {
  ensureFullMiddleware().catch((err) => logger.error("Failed to lazy-load full middleware:", err));
}

const IS_BENCHMARK = typeof process !== "undefined" && process.env.BENCHMARK === "true";
const TEST_API_SECRET = typeof process !== "undefined" ? process.env.TEST_API_SECRET : null;
const IS_QUIET = typeof process !== "undefined" && process.env.QUIET === "true";

import { isRedirect } from "@sveltejs/kit";
import { handleApiError } from "@utils/error-handling";

logger.info(
  `[HooksInit] TEST_MODE: ${process.env.TEST_MODE}, SECRET_DEFINED: ${!!TEST_API_SECRET}`,
);

// --- Server Startup Logic ---
if (!building) {
  // ✨ NEW: Smart initialization logic that respects the system state machine
  // This ensures setup-wizard stays lean and non-critical services only start when needed.
  import("@src/stores/system/state.svelte").then(({ overallState }) => {
    let isServicesInitialized = false;

    const unsubscribe = overallState.subscribe(async (state) => {
      const readyStates = ["READY", "WARMING", "WARMED", "DEGRADED"];
      if (readyStates.includes(state) && !isServicesInitialized) {
        isServicesInitialized = true;
        // ✨ Hardware Optimization (Enterprise)
        const cores = os.cpus().length;
        process.env.UV_THREADPOOL_SIZE = String(cores);
        import("sharp")
          .then((sharp) => {
            const physicalCores = Math.max(4, Math.floor(cores * 0.33));
            sharp.default.concurrency(physicalCores);
            logger.debug(
              `[System] Hardware optimized: ThreadPool=${cores} | SharpConcurrency=${physicalCores}`,
            );
          })
          .catch(() => {});

        // ✨ Parallel Service Initialization (Optimized for Cold Start)
        const isBenchmarkMode = process.env.BENCHMARK_MODE === "true";

        if (!isBenchmarkMode) {
          Promise.all([
            import("@src/services/background/jobs/job-queue-service"),
            import("@src/services/background/automation"),
            import("@src/services/system/watchdog"),
            import("@src/services/observability/telemetry-service"),
          ])
            .then(([{ jobQueue }, { automationService }, { watchdog }, { telemetryService }]) => {
              jobQueue.startPolling();
              automationService.init();
              watchdog.start();

              // Telemetry check
              const globalWithTelemetry = globalThis as typeof globalThis & {
                __SVELTY_TELEMETRY_INTERVAL__?: NodeJS.Timeout;
              };

              if (globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__) {
                clearInterval(globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__);
              }

              setTimeout(() => {
                telemetryService
                  .checkUpdateStatus()
                  .catch((err) => logger.error("Initial telemetry check failed", err));
              }, 10_000);

              globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__ = setInterval(
                () => {
                  telemetryService
                    .checkUpdateStatus()
                    .catch((err) => logger.error("Periodic telemetry check failed", err));
                },
                1000 * 60 * 60 * 12, // 12 hours
              );
            })
            .catch((err) => logger.error("[System] Parallel initialization failed:", err));
        } else {
          logger.info("🛡️ Background Services DISABLED (Benchmark Mode)");
          // 🚀 COLD START OPTIMIZATION: Pre-warm the heaviest dispatchers
          Promise.all([
            import("./routes/api/[...path]/+server"),
            import("./routes/api/graphql/+server"),
            import("@src/databases/db"),
          ])
            .then(() => {
              logger.debug("[System] API and GraphQL dispatchers pre-warmed.");
            })
            .catch(() => {});
        }

        // Cleanup: Unsubscribe once services are initialized
        // ✨ FIXED: Defer unsubscribe to next tick to avoid ReferenceError if subscribe is synchronous
        Promise.resolve().then(() => {
          if (typeof unsubscribe === "function") {
            unsubscribe();
          }
        });
      }
    });
  });

  if (!IS_BENCHMARK && !IS_QUIET) {
    logger.info("✅ DB module loaded. System will initialize background services when READY.");
  }
}

// ✨ ENTERPRISE: Graceful Shutdown Registry
let inFlightRequests = 0;

if (!building) {
  const handleSignal = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    const shutdownTimeout = setTimeout(() => {
      logger.error(`Graceful shutdown timed out after 10s. Force exiting.`);
      process.exit(1);
    }, 10000);

    // Drain period
    while (inFlightRequests > 0) {
      logger.info(`Waiting for ${inFlightRequests} in-flight requests to drain...`);
      await new Promise((r) => setTimeout(r, 1000));
    }

    const { shutdownSystem } = await import("@src/databases/db");
    await shutdownSystem();
    clearTimeout(shutdownTimeout);
    logger.info("✅ All systems finalized. Exit.");
    process.exit(0);
  };

  process.on("SIGTERM", () => handleSignal("SIGTERM"));
  process.on("SIGINT", () => handleSignal("SIGINT"));

  // ✨ ENTERPRISE: Diagnostic Error Catching
  process.on("uncaughtException", (err) => {
    logger.error("FATAL: Uncaught Exception:", err);
    process.stderr.write(`FATAL: Uncaught Exception: ${err}\n`);
    process.exit(255);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("FATAL: Unhandled Rejection:", reason);
    process.stderr.write(`FATAL: Unhandled Rejection: ${reason}\n`);
  });
}

// Helper to dynamically wrap SvelteKit middleware inside a high-resolution tracing span
function wrapHandle(name: string, handleFnRef: () => Handle): Handle {
  return async (input) => {
    return await traceSpan(`hook:${name}`, async () => await handleFnRef()(input));
  };
}

// 🚀 DYNAMIC PIPELINE DISPATCHER
// We don't pre-compile the sequence into a single const, instead we build it
// based on the current system state.
let cachedPipelineReady: Handle | null = null;
let cachedPipelineSetup: Handle | null = null;

const getPipeline = () => {
  if (setupComplete) {
    if (!cachedPipelineReady) {
      cachedPipelineReady = sequence(
        wrapHandle("hyper-turbo", () => handleHyperTurbo),
        wrapHandle("turbo-pipeline", () => handleTurboPipeline),
        wrapHandle("security-headers", () => handleSecurityHeaders),
        wrapHandle("test-isolation", () => handleTestIsolation),
        wrapHandle("static-asset-caching", () => handleStaticAssetCaching),
        wrapHandle("security", () => handleSecurity),
        wrapHandle("system-state", () => handleSystemState),
        wrapHandle("redirects", () => handleRedirects),
        wrapHandle("compression", () => handleCompression),
        wrapHandle("user-preferences", () => handleUserPreferences),
        wrapHandle("authentication", () => handleAuthentication),
        wrapHandle("authorization", () => handleAuthorization),
        wrapHandle("local-sdk", () => handleLocalSdk),
        wrapHandle("content-initialization", () => handleContentInitialization),
        wrapHandle("audit-logging", () => handleAuditLogging),
        wrapHandle("api-requests", () => handleApiRequests),
        wrapHandle("token-resolution", () => handleTokenResolution),
      );
    }
    return cachedPipelineReady;
  } else {
    if (!cachedPipelineSetup) {
      cachedPipelineSetup = sequence(
        wrapHandle("hyper-turbo", () => handleHyperTurbo),
        wrapHandle("turbo-pipeline", () => handleTurboPipeline),
        wrapHandle("security-headers", () => handleSecurityHeaders),
        wrapHandle("compression", () => handleCompression),
      );
    }
    return cachedPipelineSetup;
  }
};

/**
 * 🛡️ GLOBAL SECURITY GUARD
 * Ensures that EVERY response (including 302 redirects, 404s, and 500 errors)
 * carries the full suite of security headers.
 */
export const handle: Handle = async ({ event, resolve }) => {
  // 🚀 Fast-return for known missing static paths (avoids SvelteKit file I/O)
  if (event.url.pathname === "/favicon.ico") {
    return new Response(null, { status: 204 });
  }

  inFlightRequests++;
  const traceId = (event.locals as any).requestId || crypto.randomUUID();
  const traceHeader = event.request.headers.get("x-svelty-trace");
  const isBenchmark =
    process.env.BENCHMARK === "true" || process.env.SVELTY_BENCHMARK_SUITE === "true";
  const traceEnabled =
    traceHeader === "true" || (isBenchmark && !!event.request.headers.get("x-test-secret"));

  return runWithContext(
    {
      requestId: traceId,
      abortSignal: event.request.signal,
    },
    () => {
      return runWithTrace(traceId, traceEnabled, async () => {
        // 🚀 HOT-SWAP CHECK: If not setup yet, check if it just finished
        if (!setupComplete && isSetupComplete()) {
          logger.info("🔄 System setup detected. Hot-swapping to READY pipeline...");
          setupComplete = true;
          await ensureFullMiddleware();
        } else if (setupComplete && !isSetupComplete()) {
          logger.info("🔄 System setup reset detected. Hot-swapping back to SETUP pipeline...");
          setupComplete = false;
        }

        try {
          const pipeline = getPipeline();
          const response = await pipeline({ event, resolve });

          if (traceEnabled) {
            const trace = getTrace();
            if (trace) {
              response.headers.set("x-svelty-trace-id", trace.traceId);
              response.headers.set("x-svelty-trace-spans", JSON.stringify(trace.spans));
            }
          }
          return response;
        } catch (err: any) {
          if (isRedirect(err)) {
            throw err;
          }

          logger.error(`[Guard] Unhandled error in middleware chain:`, err);

          const errorResponse = handleApiError(err, event);

          applyAllSecurityHeaders(
            errorResponse.headers,
            event.url.protocol === "https:",
            event.request.headers.get("Origin"),
            event.url.pathname,
          );

          if (traceEnabled) {
            const trace = getTrace();
            if (trace) {
              errorResponse.headers.set("x-svelty-trace-id", trace.traceId);
              errorResponse.headers.set("x-svelty-trace-spans", JSON.stringify(trace.spans));
            }
          }

          return errorResponse;
        } finally {
          inFlightRequests--;
        }
      });
    },
  );
};

// --- Utility Functions for External Use ---
export const getHealthMetrics = () => metricsService.getReport();

import { TokenRegistry } from "@src/services/token/engine";

// 🚀 Register server-side token resolver for site settings without polluting client bundle
TokenRegistry.setSiteResolver(async () => {
  const { getAllSettings } = await import("@src/services/core/settings-service");
  return await getAllSettings();
});
