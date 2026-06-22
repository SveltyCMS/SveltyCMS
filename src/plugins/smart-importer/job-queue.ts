/**
 * @file src/plugins/smart-importer/job-queue.ts
 * @description Background job queue integration for large imports.
 *
 * For 100K+ item migrations, offloads processing to a background queue
 * instead of blocking the HTTP request. The UI polls job status via SSE.
 */

import { logger } from "@utils/logger";
import type { FieldMapping, SNCEnvelope } from "./types";
import type { IngestionOptions } from "./index.server";
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

interface QueuedImportWork {
  jobId: string;
  envelope: SNCEnvelope;
  mappings: FieldMapping[];
  targetCollection: string;
  dbAdapter: unknown;
  options: IngestionOptions;
}

/**
 * In-memory job store (replace with BullMQ/Redis for multi-instance production).
 */
class ImportJobQueue {
  private jobs = new Map<string, ImportJob>();
  private pending: QueuedImportWork[] = [];
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
    dbAdapter: unknown,
    options: IngestionOptions,
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
    this.pending.push({
      jobId: job.id,
      envelope,
      mappings,
      targetCollection,
      dbAdapter,
      options,
    });
    this.notifyListeners(job);

    if (!this.processing) {
      void this.processQueue();
    }

    return job;
  }

  getStatus(jobId: string): ImportJob | null {
    return this.jobs.get(jobId) || null;
  }

  subscribe(callback: (job: ImportJob) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  listJobs(): ImportJob[] {
    return [...this.jobs.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job && (job.status === "queued" || job.status === "processing")) {
      job.status = "failed";
      job.error = "Cancelled by user";
      this.pending = this.pending.filter((w) => w.jobId !== jobId);
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

  private async processQueue() {
    this.processing = true;

    while (this.pending.length > 0) {
      const work = this.pending.shift()!;
      const job = this.jobs.get(work.jobId);
      if (!job || job.status === "failed") continue;

      job.status = "processing";
      job.startedAt = nowISODateString();
      job.totalEntries = work.envelope.entries.length;
      this.notifyListeners(job);

      try {
        const { executeUCPIngestion } = await import("./index.server");
        const result = await executeUCPIngestion(
          work.dbAdapter,
          work.envelope,
          work.mappings,
          work.targetCollection,
          work.options,
          (progress) => {
            job.importedCount = progress.current;
            job.progressPercent =
              progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
            job.currentItem = progress.currentItem;
            this.notifyListeners(job);
          },
        );

        job.status = "completed";
        job.importedCount = result.imported;
        job.failedCount = result.failed;
        job.progressPercent = 100;
        job.completedAt = nowISODateString();
      } catch (err: unknown) {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : "Unknown error";
        logger.error(`[JobQueue] Job ${job.id} failed:`, err);
      }

      this.notifyListeners(job);
    }

    this.processing = false;
  }
}

export const importJobQueue = new ImportJobQueue();
