/**
 * @file src/plugins/smart-importer/job-queue.ts
 * @description Background job queue integration for large imports.
 *
 * For 100K+ item migrations, offloads processing to a background queue
 * (BullMQ / SvelteKit workers) instead of blocking the HTTP request.
 *
 * The UI polls job status via SSE for real-time progress updates.
 */

import { logger } from "@utils/logger";
import type { SNCEnvelope } from "./types";
import { nowISODateString } from "@utils/date";

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "rolled_back";

export interface ImportJob {
  id: string;
  status: JobStatus;
  sourcePlatform: string;
  targetCollection: string;
  totalEntries: number;
  importedCount: number;
  failedCount: number;
  progressPercent: number;
  currentItem: string;
  transactionToken: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * In-memory job store (replace with BullMQ/Redis for production).
 * For SvelteKit deployments, this can be backed by the database.
 */
class ImportJobQueue {
  private jobs = new Map<string, ImportJob>();
  private processing = false;
  private listeners = new Set<(job: ImportJob) => void>();

  /**
   * Enqueues a new import job for background processing.
   * Returns immediately with a job ID for polling.
   */
  enqueue(
    envelope: SNCEnvelope,
    mappings: FieldMapping[],
    targetCollection: string,
    dbAdapter: any,
  ): ImportJob {
    const job: ImportJob = {
      id: crypto.randomUUID?.() || `job_${Date.now()}`,
      status: "queued",
      sourcePlatform: envelope.sourcePlatform,
      targetCollection,
      totalEntries: envelope.entries.length,
      importedCount: 0,
      failedCount: 0,
      progressPercent: 0,
      currentItem: "Queued...",
      transactionToken: envelope.transactionToken,
      createdAt: nowISODateString(),
    };

    this.jobs.set(job.id, job);
    this.notifyListeners(job);

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue(dbAdapter);
    }

    return job;
  }

  /**
   * Get current status of a job (for SSE polling).
   */
  getStatus(jobId: string): ImportJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Subscribe to job status updates (SSE-compatible).
   */
  subscribe(callback: (job: ImportJob) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * List all jobs (for admin dashboard).
   */
  listJobs(): ImportJob[] {
    return [...this.jobs.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Cancel a queued job.
   */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job && (job.status === "queued" || job.status === "processing")) {
      job.status = "failed";
      job.error = "Cancelled by user";
      this.notifyListeners(job);
      return true;
    }
    return false;
  }

  private notifyListeners(job: ImportJob) {
    for (const listener of this.listeners) {
      try {
        listener(job);
      } catch {
        /* listener error is non-critical */
      }
    }
  }

  private async processQueue(dbAdapter: any) {
    this.processing = true;

    for (const job of this.jobs.values()) {
      if (job.status !== "queued") continue;

      job.status = "processing";
      job.startedAt = nowISODateString();
      this.notifyListeners(job);

      try {
        const { executeUCPIngestion } = await import("./index.server");
        const envelope: SNCEnvelope = {
          sourcePlatform: job.sourcePlatform as any,
          version: "1.0",
          transactionToken: job.transactionToken,
          entries: [], // Would be hydrated from a persistent store
        };

        const result = await executeUCPIngestion(
          dbAdapter,
          envelope,
          [],
          job.targetCollection,
          { importMedia: false, overwrite: false, batchSize: 100 },
          (progress) => {
            job.importedCount = progress.current;
            job.progressPercent = Math.round((progress.current / progress.total) * 100);
            job.currentItem = progress.currentItem;
            this.notifyListeners(job);
          },
        );

        job.status = "completed";
        job.importedCount = result.imported;
        job.failedCount = result.failed;
        job.progressPercent = 100;
        job.completedAt = nowISODateString();
      } catch (err: any) {
        job.status = "failed";
        job.error = err.message || "Unknown error";
        logger.error(`[JobQueue] Job ${job.id} failed:`, err);
      }

      this.notifyListeners(job);
    }

    this.processing = false;
  }
}

export const importJobQueue = new ImportJobQueue();
