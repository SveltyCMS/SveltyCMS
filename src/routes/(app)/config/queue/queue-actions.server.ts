/**
 * @file src/routes/(app)/config/queue/queue-actions.server.ts
 * @description Queue Observability Server Actions with defense-in-depth authorization.
 */

import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { getDb } from "@src/databases/db";
import { logger } from "@utils/logger";

function requireAdminPermission() {
  try {
    const event = getRequestEvent();
    if (event) {
      if (!event.locals.user) throw error(401, "Unauthorized");
      if (!event.locals.isAdmin && event.locals.user.role !== "admin") {
        throw error(403, "Admin privileges required");
      }
    }
  } catch (err: any) {
    if (err?.status) throw err;
  }
}

export const retryJob = async (data: any) => {
  requireAdminPermission();
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
  requireAdminPermission();
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
  requireAdminPermission();
  const db = getDb();
  if (!db?.system?.jobs) throw error(500, "Database adapter not ready or jobs not supported.");

  const result = await db.system.jobs.cleanup(new Date());

  if (!result.success) {
    logger.error("Failed to clear completed jobs:", result.message);
    throw error(500, result.message);
  }
  return { success: true, count: result.data };
};
