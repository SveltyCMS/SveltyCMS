/**
 * @file src/routes/(app)/config/queue/queue.remote.ts
 * @description Queue Observability Remote Functions — SvelteKit command/query wrappers.
 *
 * ### Features:
 * - retryJob — reschedule a failed job
 * - deleteJob — remove a job from the queue
 * - clearCompleted — clear all completed jobs
 */

import { command } from "$app/server";

export const retryJob = command("unchecked", async (jobId: string) => {
  const { getDb } = await import("@src/databases/db");
  const { logger } = await import("@utils/logger");
  const { error } = await import("@sveltejs/kit");

  if (!jobId) throw error(400, "Job ID is required");

  const db = getDb();
  if (!db?.system?.jobs) throw error(500, "Database adapter not ready or jobs not supported.");

  const result = await db.system.jobs.update(jobId as any, {
    status: "pending",
    attempts: 0,
    nextRunAt: new Date(),
    lastError: undefined,
  });

  if (!result.success) {
    logger.error("Failed to retry job:", result.message);
    throw error(500, result.message);
  }

  return { success: true };
});

export const deleteJob = command("unchecked", async (jobId: string) => {
  const { getDb } = await import("@src/databases/db");
  const { logger } = await import("@utils/logger");
  const { error } = await import("@sveltejs/kit");

  if (!jobId) throw error(400, "Job ID is required");

  const db = getDb();
  if (!db?.system?.jobs) throw error(500, "Database adapter not ready or jobs not supported.");

  const result = await db.system.jobs.delete(jobId as any);

  if (!result.success) {
    logger.error("Failed to delete job:", result.message);
    throw error(500, result.message);
  }

  return { success: true };
});

export const clearCompleted = command("unchecked", async (_payload?: {}) => {
  const { getDb } = await import("@src/databases/db");
  const { logger } = await import("@utils/logger");
  const { error } = await import("@sveltejs/kit");

  const db = getDb();
  if (!db?.system?.jobs) throw error(500, "Database adapter not ready or jobs not supported.");

  const result = await db.system.jobs.cleanup(new Date());

  if (!result.success) {
    logger.error("Failed to clear completed jobs:", result.message);
    throw error(500, result.message);
  }

  return { success: true, count: result.data };
});
