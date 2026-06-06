/**
 * @file src/routes/(app)/config/queue/queue.remote.ts
 * @description Queue Observability Remote Functions.
 */

export const retryJob = async (data: any) => {
  const { getDb } = await import("@src/databases/db");
  const { error } = await import("@sveltejs/kit");
  const { logger } = await import("@utils/logger");
  const jobId = String(data);

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
};

export const deleteJob = async (data: any) => {
  const { getDb } = await import("@src/databases/db");
  const { error } = await import("@sveltejs/kit");
  const { logger } = await import("@utils/logger");
  const jobId = String(data);

  if (!jobId) throw error(400, "Job ID is required");

  const db = getDb();
  if (!db?.system?.jobs) throw error(500, "Database adapter not ready or jobs not supported.");

  const result = await db.system.jobs.delete(jobId as any);

  if (!result.success) {
    logger.error("Failed to delete job:", result.message);
    throw error(500, result.message);
  }
  return { success: true };
};

export const clearCompleted = async (_data?: any) => {
  const { getDb } = await import("@src/databases/db");
  const { error } = await import("@sveltejs/kit");
  const { logger } = await import("@utils/logger");

  const db = getDb();
  if (!db?.system?.jobs) throw error(500, "Database adapter not ready or jobs not supported.");

  const result = await db.system.jobs.cleanup(new Date());

  if (!result.success) {
    logger.error("Failed to clear completed jobs:", result.message);
    throw error(500, result.message);
  }
  return { success: true, count: result.data };
};
