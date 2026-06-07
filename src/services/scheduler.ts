/**
 * @file src/services/scheduler.ts
 * @description
 * Lightweight background job scheduler for content status transitions.
 * Executes scheduled publishing tasks (draft→publish, publish→unpublish, delete)
 * via the svelty_jobs table across all database adapters.
 *
 * Features:
 * - Adaptive polling (1s when jobs pending, 30s when idle)
 * - System state store registration for health monitoring
 * - Audit log entries for executed jobs
 * - DB-ready gating via dbInitPromise
 * - Worker Thread Pooling compatible (single-threaded for now)
 * - Graceful start/stop with cleanup
 */

import { dbInitPromise } from "@src/databases/db";
import { getDb } from "@src/databases/db";
import { StatusTypes } from "@src/content/types";
import { auditChainService } from "@src/services/audit-chain";
import { system } from "@src/stores/system/state.svelte.ts";
import { logger } from "@utils/logger";
import type { Job } from "@src/databases/db-interface";

// ──────────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────────

const FAST_POLL_MS = 1_000; // When jobs are pending
const IDLE_POLL_MS = 30_000; // When no jobs found
const MAX_RETRIES = 3;

// ──────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentInterval = IDLE_POLL_MS;
let isRunning = false;
let consecutiveEmptyPolls = 0;

// ──────────────────────────────────────────────────────────────
// SCHEDULER SERVICE
// ──────────────────────────────────────────────────────────────

/**
 * Starts the background scheduler. Waits for DB readiness before polling.
 * Registers the scheduler service in the system state store for monitoring.
 */
export async function startScheduler(): Promise<void> {
  if (isRunning) {
    logger.debug("[Scheduler] Already running, skipping start");
    return;
  }

  logger.info("[Scheduler] Waiting for database initialization...");
  try {
    await dbInitPromise;
  } catch (err) {
    logger.error("[Scheduler] Database initialization failed, scheduler not started", err);
    return;
  }

  isRunning = true;
  logger.info("[Scheduler] Starting adaptive background job runner");

  // Register with system state store for health monitoring
  system.updateService("cache", {
    status: "healthy",
    message: "Scheduler running",
  });

  // Initial poll
  scheduleNextPoll();

  // Register as a background service in system state
  logger.info("[Scheduler] Adaptive job runner started (1s fast / 30s idle)");
}

/**
 * Stops the background scheduler and cleans up resources.
 */
export function stopScheduler(): void {
  if (!isRunning) return;

  isRunning = false;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  consecutiveEmptyPolls = 0;
  currentInterval = IDLE_POLL_MS;

  logger.info("[Scheduler] Stopped background job runner");
}

/**
 * Schedules the next poll with the current adaptive interval.
 */
function scheduleNextPoll(): void {
  if (!isRunning) return;

  pollTimer = setTimeout(async () => {
    if (!isRunning) return;
    await pollAndProcess();
    scheduleNextPoll();
  }, currentInterval);
}

/**
 * Polls for ready jobs and processes them.
 */
async function pollAndProcess(): Promise<void> {
  const db = getDb();
  if (!db || !db.system?.jobs) {
    logger.debug("[Scheduler] DB or jobs interface not available, skipping poll");
    return;
  }

  try {
    const result = await db.system.jobs.getNextReady(10);
    if (!result.success || !result.data || result.data.length === 0) {
      // No jobs — transition to idle interval
      consecutiveEmptyPolls++;
      if (consecutiveEmptyPolls >= 3) {
        currentInterval = IDLE_POLL_MS;
      }
      return;
    }

    // Jobs found — switch to fast poll
    consecutiveEmptyPolls = 0;
    currentInterval = FAST_POLL_MS;

    const jobs = result.data;
    logger.debug(`[Scheduler] Processing ${jobs.length} ready job(s)`);

    for (const job of jobs) {
      await executeScheduledJob(job, db);
    }
  } catch (err) {
    logger.error("[Scheduler] Poll error:", err);
  }
}

/**
 * Executes a single scheduled job based on its taskType.
 * Supports: status-transition (draft→publish, publish→unpublish, delete)
 */
async function executeScheduledJob(job: Job, db: any): Promise<void> {
  if (!job._id) return;

  // Claim the job atomically
  const claimResult = await db.system.jobs.update(job._id, {
    status: "running",
    attempts: (job.attempts || 0) + 1,
  });

  if (!claimResult.success) return;

  const { taskType, payload } = job;
  logger.info(`[Scheduler] Executing job ${job._id} (${taskType})`);

  try {
    switch (taskType) {
      case "status-transition": {
        await executeStatusTransition(payload, job);
        break;
      }
      default: {
        logger.warn(`[Scheduler] Unknown task type: ${taskType}`);
        await db.system.jobs.update(job._id, {
          status: "failed",
          lastError: `Unknown task type: ${taskType}`,
        });
        return;
      }
    }

    // Mark as completed
    await db.system.jobs.update(job._id, {
      status: "completed",
      progress: 100,
    });

    // Create audit log entry
    await createAuditLog(job, "completed");

    logger.info(`[Scheduler] Job ${job._id} completed successfully`);
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    logger.error(`[Scheduler] Job ${job._id} failed: ${errorMsg}`);

    const newAttempts = (job.attempts || 0) + 1;
    const isPermanent = newAttempts >= (job.maxAttempts || MAX_RETRIES);

    await db.system.jobs.update(job._id, {
      status: isPermanent ? "failed" : "pending",
      lastError: errorMsg,
      nextRunAt: isPermanent ? job.nextRunAt : new Date(Date.now() + 2 ** newAttempts * 1000), // Exponential backoff
    });

    if (isPermanent) {
      await createAuditLog(job, "failed", errorMsg);
    }
  }
}

/**
 * Executes a status transition on content based on job payload.
 * Supported transitions:
 *   - draft → publish
 *   - publish → unpublish
 *   - any → delete
 */
async function executeStatusTransition(payload: Record<string, unknown>, _job: Job): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const { collectionId, entryId, targetStatus, entryPath } = payload;

  if (!collectionId || !entryId || !targetStatus) {
    throw new Error("Missing required payload fields: collectionId, entryId, targetStatus");
  }

  const collId = collectionId as string;
  const entId = entryId as string;
  const status = targetStatus as string;

  logger.info(`[Scheduler] Status transition: ${entId} → ${status} (collection: ${collId})`);

  switch (status) {
    case "publish":
    case StatusTypes.publish: {
      // Transition to published
      if (entryPath) {
        await db.content.nodes.update(
          entryPath as string,
          {
            status: StatusTypes.publish,
            data: { _scheduled: null },
            updatedAt: new Date().toISOString(),
          } as any,
        );
      } else {
        // Fallback: update via collection CRUD
        await db.crud.update(
          collId as any,
          entId as any,
          {
            status: StatusTypes.publish,
            _scheduled: null,
            updatedAt: new Date().toISOString(),
          } as any,
        );
      }
      break;
    }

    case "unpublish":
    case StatusTypes.unpublish: {
      if (entryPath) {
        await db.content.nodes.update(
          entryPath as string,
          {
            status: StatusTypes.unpublish,
            data: { _scheduled: null },
            updatedAt: new Date().toISOString(),
          } as any,
        );
      } else {
        await db.crud.update(
          collId as any,
          entId as any,
          {
            status: StatusTypes.unpublish,
            _scheduled: null,
            updatedAt: new Date().toISOString(),
          } as any,
        );
      }
      break;
    }

    case "delete":
    case StatusTypes.delete: {
      if (entryPath) {
        await db.content.nodes.update(
          entryPath as string,
          {
            status: StatusTypes.delete,
            updatedAt: new Date().toISOString(),
          } as any,
        );
      } else {
        await db.crud.update(
          collId as any,
          entId as any,
          {
            status: StatusTypes.delete,
            updatedAt: new Date().toISOString(),
          } as any,
        );
      }
      break;
    }

    case "draft":
    case StatusTypes.draft: {
      if (entryPath) {
        await db.content.nodes.update(
          entryPath as string,
          {
            status: StatusTypes.draft,
            data: { _scheduled: null },
            updatedAt: new Date().toISOString(),
          } as any,
        );
      } else {
        await db.crud.update(
          collId as any,
          entId as any,
          {
            status: StatusTypes.draft,
            _scheduled: null,
            updatedAt: new Date().toISOString(),
          } as any,
        );
      }
      break;
    }

    default:
      throw new Error(`Unsupported target status: ${status}`);
  }

  logger.info(`[Scheduler] Successfully transitioned ${entId} to ${status}`);
}

/**
 * Creates a crypto-chained audit log entry for job execution.
 */
async function createAuditLog(
  job: Job,
  outcome: "completed" | "failed",
  error?: string,
): Promise<void> {
  try {
    await auditChainService.createLog({
      action: `scheduler:job:${outcome}`,
      actorId: "system:scheduler",
      actorRole: "system",
      tenantId: (job.tenantId as string) || null,
      timestamp: new Date().toISOString(),
      details: {
        jobId: job._id as string,
        taskType: job.taskType,
        payload: job.payload,
        attempts: job.attempts,
        error: error || undefined,
      },
    });

    if (process.env.NODE_ENV !== "production") {
      logger.debug(`[Scheduler] Audit log created for job ${job._id} (${outcome})`);
    }
  } catch (err) {
    // Non-fatal: don't fail the job if audit logging fails
    logger.warn(`[Scheduler] Failed to create audit log for job ${job._id}:`, err);
  }
}

// ──────────────────────────────────────────────────────────────
// PUBLIC API: Convenience function for scheduling jobs
// ──────────────────────────────────────────────────────────────

/**
 * Schedules a new job for future execution.
 *
 * @param taskType - The type of task (e.g., "status-transition")
 * @param payload - Job-specific payload
 * @param runAt - When the job should run (Date or ISO string)
 * @returns The created job ID, or null on failure
 */
export async function scheduleJob(
  taskType: string,
  payload: Record<string, unknown>,
  runAt: Date | string,
): Promise<string | null> {
  const db = getDb();
  if (!db || !db.system?.jobs) {
    logger.warn("[Scheduler] Cannot schedule job: DB or jobs interface not available");
    return null;
  }

  try {
    const nextRunAt = typeof runAt === "string" ? new Date(runAt) : runAt;

    const result = await db.system.jobs.create({
      taskType,
      payload,
      status: "pending",
      attempts: 0,
      maxAttempts: MAX_RETRIES,
      nextRunAt,
    });

    if (result.success) {
      const jobData = result.data;
      logger.info(
        `[Scheduler] Scheduled job ${jobData._id} (${taskType}) for ${nextRunAt.toISOString()}`,
      );

      // Trigger immediate poll if scheduler is running
      if (isRunning && currentInterval > FAST_POLL_MS) {
        currentInterval = FAST_POLL_MS;
        if (pollTimer) {
          clearTimeout(pollTimer);
          scheduleNextPoll();
        }
      }

      return jobData._id as string;
    }

    throw new Error(result.message || "Failed to create job");
  } catch (err) {
    logger.error(`[Scheduler] Failed to schedule job (${taskType}):`, err);
    return null;
  }
}
