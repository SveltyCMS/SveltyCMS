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
import { building, dev } from "$app/environment";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import os from "node:os";
import { runWithContext } from "@utils/context";
import { shutdownSystem } from "@src/databases/db";

// ✨ Hardware Optimization (Enterprise)
// Maximized usage of available CPU cores for I/O and heavy processing is deferred
// to the background service initialization phase to ensure ultra-fast cold starts.

// ESM Shims for legacy CJS compatibility in production build
if (typeof (globalThis as any).__filename === "undefined") {
  (globalThis as any).__filename = fileURLToPath(import.meta.url);
}
if (typeof (globalThis as any).__dirname === "undefined") {
  (globalThis as any).__dirname = dirname((globalThis as any).__filename);
}

// ✨ ENTERPRISE: Stable Node ID for Distributed Cache Sync (Phase 8)
if (typeof (globalThis as any).__SVELTY_NODE_ID__ === "undefined") {
  (globalThis as any).__SVELTY_NODE_ID__ = crypto.randomUUID();
}

import { handleTurboPipeline } from "./hooks/handle-turbo-pipeline.server";
import { handleCompression } from "./hooks/handle-compression";
import { handleSecurity } from "./hooks/handle-security";
import { handleUserPreferences } from "./hooks/handle-user-preferences";
import { handleAuthentication } from "./hooks/handle-authentication";
import { handleAuthorization } from "./hooks/handle-authorization";
import { handleLocalSdk } from "./hooks/handle-local-sdk";
import { handleContentInitialization } from "./hooks/handle-content-initialization";
import { handleApiRequests } from "./hooks/handle-api-requests";
import { handleAuditLogging } from "./hooks/handle-audit-logging";
import { handleTokenResolution } from "./hooks/handle-token-resolution";
import { handleSecurityHeaders, applyAllSecurityHeaders } from "./hooks/handle-security-headers";
import { handleTestIsolation } from "./hooks/handle-test-isolation";
import { handleStaticAssetCaching } from "./hooks/handle-static-asset-caching";
import { isRedirect } from "@sveltejs/kit";
import { handleApiError } from "@utils/error-handling";
import { handleRedirects } from "./hooks/handle-redirects";

// --- Server Startup Logic ---
if (!building) {
  // ✨ NEW: Smart initialization logic that respects the system state machine
  // This ensures setup-wizard stays lean and non-critical services only start when needed.
  import("@src/stores/system/state").then(({ overallState }) => {
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

        // Initialize Background Job Queue
        const { jobQueue } = await import("@src/services/background/jobs/job-queue-service");
        jobQueue.startPolling();

        // Initialize Automation
        const { automationService } = await import("@src/services/background/automation");
        automationService.init();

        // Initialize Telemetry
        const { telemetryService } = await import("@src/services/observability/telemetry-service");

        // ✨ ENTERPRISE: Start the Autonomous Watchdog
        const { watchdog } = await import("@src/services/system/watchdog");
        watchdog.start();

        // Start Content Watcher (dev only)
        if (dev) {
          const { startContentWatcher } = await import("@src/content/content-watcher.server");
          startContentWatcher();
        }

        const globalWithTelemetry = globalThis as typeof globalThis & {
          __SVELTY_TELEMETRY_INTERVAL__?: NodeJS.Timeout;
        };

        if (globalWithTelemetry.__SVELTY_TELEMETRY_INTERVAL__) {
          logger.debug("Stopping old telemetry interval (HMR detected)");
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

        // Cleanup: Unsubscribe once services are initialized
        unsubscribe();
      }
    });
  });

  logger.info("✅ DB module loaded. System will initialize background services when READY.");
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

// --- Updated middleware sequence (Turbo Pipeline FIRST for performance) ---
const middleware: Handle[] = [
  handleTurboPipeline, // ✨ FAST-PATH (Health Check, Static Assets, Test Bypass)
  handleSecurityHeaders, // ✨ Security Headers
  handleTestIsolation, // ✨ CI: Tenant Isolation
  handleStaticAssetCaching, // ✨ PERFORMANCE: Global Asset Caching
  handleSecurity, // ✨ 1. PROTECTION (Firewall, Rate Limit, Bot Detection)
  handleRedirects, // ✨ 3. SEO (Manual & Auto Redirects)
  handleCompression, // ✨ 4. OPTIMIZATION (Dynamic Content)
  handleUserPreferences, // ✨ 5. USER PREFERENCES
  handleAuthentication, // ✨ 7. AUTHENTICATION
  handleAuthorization, // ✨ 8. AUTHORIZATION
  handleLocalSdk, // ✨ 9. LOCAL SDK
  handleContentInitialization, // ✨ 10. CONTENT INITIALIZATION
  handleAuditLogging, // ✨ 11. AUDIT LOGGING
  handleApiRequests, // ✨ 12. API REQUESTS
  handleTokenResolution, // ✨ 13. TOKEN RESOLUTION
];

// ✨ ENTERPRISE: Pre-compiled pipeline (optimizes hot path by ~1-2%)
const pipeline = sequence(...middleware);

/**
 * 🛡️ GLOBAL SECURITY GUARD
 * Ensures that EVERY response (including 302 redirects, 404s, and 500 errors)
 * carries the full suite of security headers.
 */
export const handle: Handle = async ({ event, resolve }) => {
  inFlightRequests++;
  return runWithContext(
    {
      requestId: (event.locals as any).requestId || crypto.randomUUID(),
      abortSignal: event.request.signal,
    },
    async () => {
      try {
        const response = await pipeline({ event, resolve });
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

        return errorResponse;
      } finally {
        inFlightRequests--;
      }
    },
  );
};

// --- Utility Functions for External Use ---
export const getHealthMetrics = () => metricsService.getReport();

export {
  clearAllSessionCaches,
  clearSessionRefreshAttempt,
  forceSessionRotation,
  getSessionCacheStats,
  invalidateSessionCache,
} from "./hooks/handle-authentication";
