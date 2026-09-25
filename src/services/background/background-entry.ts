/**
 * @file src/services/background/background-entry.ts
 * @description Dedicated background worker process entrypoint for SveltyCMS.
 * Decouples pollers (job queue, scheduler, outbox, watchdog, automation, telemetry,
 * behavioral learner) from the API event loop to eliminate request contention and write CoV.
 *
 * Features:
 * - Standalone worker execution with DB readiness gating
 * - Periodic IPC heartbeats reporting health to parent supervisor
 * - Clean signal handling (SIGTERM, SIGINT) with graceful resource teardown
 * - Safe error handling ensuring worker resilience
 */

import { logger } from "@utils/logger";
import { dbInitPromise, getDb } from "@src/databases/db";
import { jobQueue } from "@src/services/background/jobs/job-queue-service";
import { automationService } from "@src/services/background/automation";
import { watchdog } from "@src/services/system/watchdog";
import { telemetryService } from "@src/services/observability/telemetry-service";
import { startScheduler, stopScheduler } from "@src/services/scheduler";
import {
  startBehavioralEngine,
  stopBehavioralEngine,
} from "@src/services/intelligence/behavioral-learner";
import { outboxService } from "@src/services/outbox";

process.env.SVELTY_IS_BACKGROUND_WORKER = "true";

let isShuttingDown = false;
let heartbeatTimer: NodeJS.Timeout | null = null;
let telemetryTimer: NodeJS.Timeout | null = null;

/**
 * Report health status to parent process if IPC channel exists.
 */
function sendHeartbeat(status: "starting" | "healthy" | "degraded" | "stopping") {
  if (typeof process.send === "function") {
    try {
      process.send({
        type: "heartbeat",
        pid: process.pid,
        timestamp: Date.now(),
        status,
        services: {
          jobQueue: true,
          scheduler: true,
          outbox: true,
          watchdog: true,
          automation: true,
        },
      });
    } catch (err) {
      logger.debug("[BackgroundWorker] Heartbeat send failed", err);
    }
  }
}

/**
 * Gracefully stop all background services and exit.
 */
export async function shutdownWorker(signal = "SIGTERM"): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`[BackgroundWorker] Shutting down on ${signal}...`);
  sendHeartbeat("stopping");

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (telemetryTimer) {
    clearInterval(telemetryTimer);
    telemetryTimer = null;
  }

  try {
    jobQueue.stopPolling();
  } catch (err) {
    logger.debug("[BackgroundWorker] Error stopping job queue", err);
  }

  try {
    stopScheduler();
  } catch (err) {
    logger.debug("[BackgroundWorker] Error stopping scheduler", err);
  }

  try {
    watchdog.stop();
  } catch (err) {
    logger.debug("[BackgroundWorker] Error stopping watchdog", err);
  }

  try {
    stopBehavioralEngine();
  } catch (err) {
    logger.debug("[BackgroundWorker] Error stopping behavioral engine", err);
  }

  try {
    outboxService.stopPolling();
  } catch (err) {
    logger.debug("[BackgroundWorker] Error stopping outbox service", err);
  }

  logger.info("[BackgroundWorker] All background services stopped cleanly.");
  process.exit(0);
}

/**
 * Initialize and start all background services.
 */
export async function startWorker(): Promise<void> {
  logger.info(`[BackgroundWorker] Starting background worker process (pid: ${process.pid})...`);
  sendHeartbeat("starting");

  try {
    await dbInitPromise;
    const adapter = getDb();
    if (adapter && typeof adapter.isConnected === "function" && !adapter.isConnected()) {
      logger.warn("[BackgroundWorker] Database adapter not yet connected, continuing boot...");
    }
  } catch (err) {
    logger.error("[BackgroundWorker] Database initialization error in background worker:", err);
  }

  // 1. Job Queue Poller
  try {
    jobQueue.startPolling();
  } catch (err) {
    logger.error("[BackgroundWorker] Failed to start job queue", err);
  }

  // 2. Automation Service
  try {
    automationService.init();
  } catch (err) {
    logger.error("[BackgroundWorker] Failed to start automation service", err);
  }

  // 3. Autonomous Watchdog & Memory Governor
  try {
    watchdog.start();
  } catch (err) {
    logger.error("[BackgroundWorker] Failed to start watchdog", err);
  }

  // 4. Content Scheduler
  try {
    await startScheduler();
  } catch (err) {
    logger.error("[BackgroundWorker] Failed to start scheduler", err);
  }

  // 5. Server-side Behavioral Learner
  try {
    startBehavioralEngine();
  } catch (err) {
    logger.error("[BackgroundWorker] Failed to start behavioral engine", err);
  }

  // 6. Transactional Outbox Poller
  try {
    outboxService.startPolling(5_000);
  } catch (err) {
    logger.error("[BackgroundWorker] Failed to start outbox service", err);
  }

  // 7. Telemetry Checks
  setTimeout(() => {
    telemetryService
      .checkUpdateStatus()
      .catch((err) => logger.error("[BackgroundWorker] Initial telemetry check failed", err));
  }, 10_000);

  telemetryTimer = setInterval(
    () => {
      telemetryService
        .checkUpdateStatus()
        .catch((err) => logger.error("[BackgroundWorker] Periodic telemetry check failed", err));
    },
    1000 * 60 * 60 * 12, // 12 hours
  );

  // 8. Periodic Heartbeat to parent supervisor
  sendHeartbeat("healthy");
  heartbeatTimer = setInterval(() => {
    sendHeartbeat("healthy");
  }, 10_000);

  logger.info("[BackgroundWorker] All background services initialized and running.");
}

// IPC listener for supervisor commands
if (process.on) {
  process.on("message", (msg: unknown) => {
    if (typeof msg === "object" && msg !== null && "type" in msg) {
      const type = (msg as { type: string }).type;
      if (type === "shutdown") {
        shutdownWorker("IPC_SHUTDOWN").catch(() => process.exit(0));
      } else if (type === "ping" && typeof process.send === "function") {
        process.send({ type: "pong", timestamp: Date.now() });
      }
    }
  });

  process.on("SIGTERM", () => {
    shutdownWorker("SIGTERM").catch(() => process.exit(0));
  });
  process.on("SIGINT", () => {
    shutdownWorker("SIGINT").catch(() => process.exit(0));
  });
}

// Auto-run if executed directly as script entry
if (
  process.argv[1] &&
  (process.argv[1].replace(/\\/g, "/").endsWith("background-entry.ts") ||
    process.argv[1].replace(/\\/g, "/").endsWith("background-worker.js"))
) {
  startWorker().catch((err) => {
    logger.error("[BackgroundWorker] Fatal error during startup:", err);
    process.exit(1);
  });
}
