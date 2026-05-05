/**
 * @file src/services/jobs/job-queue-service.ts
 * @description
 * Database-agnostic background jobs queue service.
 * Respects the IDBAdapter contract to orchestrate asynchronous tasks
 * like image processing, AI enrichment, and bulk operations.
 */

import { getDb } from "@src/databases/db";
import type { Job, DatabaseId } from "@src/databases/db-interface";
import { logger } from "@utils/logger";
import { processMediaHandler } from "./media-jobs";
import { webhookDeliveryHandler } from "./webhook-jobs";
import { importDataHandler } from "./import-jobs";
import { bulkTranslateHandler } from "./translation-jobs";
import { cleanupTempStore } from "@utils/temp-store";
import { scheduledPublishHandler } from "./scheduled-jobs";

import os from "node:os";

export type JobHandler = (payload: any, job: Job) => Promise<void>;

class JobQueueService {
  private handlers: Map<string, JobHandler> = new Map();
  private isProcessing = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private currentRunning = 0;
  private lastScheduleCheck = 0;

  // Adaptive concurrency: 50% of cores, min 5, max 50
  private readonly CONCURRENT_MAX = Math.min(50, Math.max(5, Math.floor(os.cpus().length * 0.5)));

  constructor() {
    // Register core handlers
    this.registerHandler("process-media", processMediaHandler);
    this.registerHandler("webhook-delivery", webhookDeliveryHandler);
    this.registerHandler("import-data", importDataHandler);
    this.registerHandler("bulk-translate", bulkTranslateHandler);
    this.registerHandler("publish-scheduled", scheduledPublishHandler);
  }

  /**
   * Register a handler for a specific task type.
   */
  registerHandler(taskType: string, handler: JobHandler) {
    this.handlers.set(taskType, handler);
    logger.info(`[JobQueue] Registered handler for task: ${taskType}`);
  }

  /**
   * Dispatch a new job to the queue.
   */
  async dispatch(
    taskType: string,
    payload: Record<string, unknown>,
    tenantId?: string,
  ): Promise<string | null> {
    const db = getDb();
    if (!db || !db.system.jobs) {
      logger.error("[JobQueue] Database adapter not ready or jobs not supported.");
      return null;
    }

    try {
      const jobData = {
        taskType,
        payload,
        status: "pending" as const,
        attempts: 0,
        maxAttempts: 3,
        nextRunAt: new Date(),
        tenantId: tenantId as DatabaseId | undefined,
        progress: 0,
        metadata: {},
      };

      const result = await db.system.jobs.create(jobData);
      if (result.success) {
        logger.debug(`[JobQueue] Dispatched job ${result.data._id} of type ${taskType}`);

        // Optional: trigger immediate processing attempt if not already running
        if (!this.isProcessing) {
          // Fire and forget
          this.processNextBatch().catch((err) =>
            logger.error("[JobQueue] Error in immediate process", err),
          );
        }

        return result.data._id;
      }
      throw new Error(result.message);
    } catch (error) {
      logger.error(`[JobQueue] Failed to dispatch job ${taskType}:`, error);
      return null;
    }
  }

  /**
   * Process the next batch of ready jobs.
   */
  async processNextBatch(batchSize = this.CONCURRENT_MAX) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const db = getDb();
    if (!db || !db.system.jobs) {
      this.isProcessing = false;
      return;
    }

    try {
      // 1. Fetch pending jobs ready to run
      // Only fetch up to the remaining concurrency capacity
      const capacity = Math.max(0, this.CONCURRENT_MAX - this.currentRunning);
      if (capacity === 0) {
        this.isProcessing = false;
        return;
      }

      const readyJobsResult = await db.system.jobs.getNextReady(Math.min(batchSize, capacity));
      if (!readyJobsResult.success || !readyJobsResult.data || readyJobsResult.data.length === 0) {
        this.isProcessing = false;
        return;
      }

      const jobs = readyJobsResult.data;

      // 2. Process jobs (don't await them all here to allow concurrency)
      for (const job of jobs) {
        this.currentRunning++;
        this.executeJob(job, db)
          .catch((err) => logger.error(`[JobQueue] Critical error in job ${job._id}:`, err))
          .finally(() => {
            this.currentRunning--;
          });
      }
    } catch (error) {
      logger.error("[JobQueue] Error during batch processing:", error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single job and update its state.
   */
  private async executeJob(job: Job, db: any) {
    const handler = this.handlers.get(job.taskType);

    // Mark as running
    await db.system.jobs.update(job._id, {
      status: "running",
      attempts: job.attempts + 1,
    });

    if (!handler) {
      logger.warn(`[JobQueue] No handler found for task type: ${job.taskType}`);
      await db.system.jobs.update(job._id, {
        status: "failed",
        lastError: "No handler registered",
      });
      return;
    }

    try {
      logger.debug(`[JobQueue] Executing job ${job._id} (${job.taskType})`);
      await handler(job.payload, job);

      // Mark as completed
      await db.system.jobs.update(job._id, {
        status: "completed",
        progress: 100,
      });
      logger.info(`[JobQueue] Job ${job._id} completed successfully`);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[JobQueue] Job ${job._id} failed:`, error);

      const isPermanent = errMessage.includes("PERMANENT_FAILURE");
      const newAttempts = job.attempts + 1;
      const status = isPermanent || newAttempts >= job.maxAttempts ? "failed" : "pending";

      // Exponential backoff for retry
      const nextRunAt = new Date(Date.now() + 2 ** newAttempts * 1000 * 60);

      await db.system.jobs.update(job._id, {
        status,
        lastError: errMessage,
        nextRunAt: status === "pending" ? nextRunAt : job.nextRunAt,
      });

      // If it's a webhook failure, we might want to emit an event for the UI
      if (job.taskType === "webhook-delivery" && status === "failed") {
        try {
          const { pubSub } = await import("@src/services/background/pub-sub");
          pubSub.publish("webhook:failed", {
            webhookId: (job.payload as any).webhook.id,
            deliveryId: job._id as string,
            tenantId: job.tenantId as string,
            error: errMessage,
          });
        } catch {
          // Ignore pubsub errors during job handling
        }
      }
    }
  }

  /**
   * Start the background polling worker.
   */
  startPolling(intervalMs = 10000) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    logger.info(`[JobQueue] Starting background worker (interval: ${intervalMs}ms)`);
    this.pollInterval = setInterval(() => {
      // 1. Process jobs
      this.processNextBatch().catch((err) => logger.error("[JobQueue] Polling error", err));

      // 2. Scheduled content publishing tick (every 60s)
      const now = Date.now();
      if (now - this.lastScheduleCheck >= 60000) {
        this.lastScheduleCheck = now;
        this.dispatch("publish-scheduled", {}).catch(err => 
          logger.error("[JobQueue] Failed to dispatch scheduled tick", err)
        );
      }

      // 3. Clean up temp store every 10 cycles
      if (Math.random() > 0.9) {
        cleanupTempStore().catch((err) => logger.error("[JobQueue] TempStore cleanup error", err));
      }
    }, intervalMs);
  }

  /**
   * Stop the background polling worker.
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      logger.info("[JobQueue] Stopped background worker");
    }
  }
}

export const jobQueue = new JobQueueService();
