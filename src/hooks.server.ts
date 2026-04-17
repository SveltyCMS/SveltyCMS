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

import { metricsService } from "@src/services/metrics-service";
import type { Handle } from "@sveltejs/kit";
import { sequence } from "@sveltejs/kit/hooks";
import { logger } from "@utils/logger.server";
import { building } from "$app/environment";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import os from "node:os";

/**
 * ✨ Hardware Optimization (Enterprise)
 * Maximizes usage of available CPU cores for I/O and heavy processing.
 */
if (!building) {
  const cores = os.cpus().length;
  // Node/Bun I/O Thread Pool
  process.env.UV_THREADPOOL_SIZE = String(cores);

  // Sharp (Image Engine) Concurrency
  import("sharp")
    .then((sharp) => {
      // Rule: match concurrency to physical cores (approx 1/3 of total logical cores)
      const physicalCores = Math.max(4, Math.floor(cores * 0.33));
      sharp.default.concurrency(physicalCores);
      if (!dev) {
        logger.info(
          `[System] Hardware optimized: ThreadPool=${cores} | SharpConcurrency=${physicalCores}`,
        );
      }
    })
    .catch(() => {
      // Sharp optional
    });
}

// ESM Shims for legacy CJS compatibility in production build
if (typeof globalThis.__filename === "undefined") {
  (globalThis as any).__filename = fileURLToPath(import.meta.url);
}
if (typeof globalThis.__dirname === "undefined") {
  (globalThis as any).__dirname = dirname((globalThis as any).__filename);
}

import { handleTurboPipeline } from "./hooks/handle-turbo-pipeline.server";
import { handleCompression } from "./hooks/handle-compression";
import { handleSecurity } from "./hooks/handle-security";
import { handleSetup } from "./hooks/handle-setup";
import { handleUserPreferences } from "./hooks/handle-user-preferences";
import { handleAuthentication } from "./hooks/handle-authentication";
import { handleAuthorization } from "./hooks/handle-authorization";
import { handleLocalSdk } from "./hooks/handle-local-sdk";
import { handleContentInitialization } from "./hooks/handle-content-initialization";
import { handleApiRequests } from "./hooks/handle-api-requests";
import { handleAuditLogging } from "./hooks/handle-audit-logging";
import { handleTokenResolution } from "./hooks/token-resolution";

// --- Server Startup Logic ---
if (!building) {
  import("@src/databases/db");

  // ✨ NEW: Smart initialization logic that respects the system state machine
  // This ensures setup-wizard stays lean and non-critical services only start when needed.
  import("@src/stores/system/state").then(({ overallState }) => {
    let isServicesInitialized = false;

    const unsubscribe = overallState.subscribe(async (state) => {
      const readyStates = ["READY", "WARMING", "WARMED", "DEGRADED"];
      if (readyStates.includes(state) && !isServicesInitialized) {
        isServicesInitialized = true;
        logger.info(`🚀 System reached ${state}. Initializing background services...`);

        // Initialize Scheduler
        const { scheduler } = await import("@src/services/scheduler");
        scheduler.start();

        // Initialize Automation
        const { automationService } = await import("@src/services/automation");
        automationService.init();

        // Initialize Telemetry
        const { telemetryService } = await import("@src/services/telemetry-service");

        // ✨ ENTERPRISE: Start the Autonomous Watchdog
        const { watchdog } = await import("@src/services/system/watchdog");
        watchdog.start();

        // Start Content Watcher (dev only)
        const { startContentWatcher } = await import("@src/content/content-watcher.server");
        startContentWatcher();

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

// --- Updated middleware sequence (security headers FIRST) ---
const middleware: Handle[] = [
  handleCompression,
  handleTurboPipeline, // ✨ CONSOLIDATED FAST-PATH (Headers, Asset Cache, State Gate, Test Isolation)
  handleSecurity,
  handleSetup,
  handleUserPreferences,
  handleAuthentication,
  handleAuthorization,
  handleLocalSdk,
  handleContentInitialization,
  handleAuditLogging,
  handleApiRequests,
  handleTokenResolution,
];

export const handle: Handle = sequence(...middleware);

// --- Utility Functions for External Use ---
export const getHealthMetrics = () => metricsService.getReport();

export {
  clearAllSessionCaches,
  clearSessionRefreshAttempt,
  forceSessionRotation,
  getSessionCacheStats,
  invalidateSessionCache,
} from "./hooks/handle-authentication";
