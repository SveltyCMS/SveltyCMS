/**
 * @file src/routes/(app)/config/queue/queue-actions.server.ts
 * @description Queue Observability Server Actions with defense-in-depth authorization.
 */

import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import type { DatabaseId } from "@src/content/types";
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
  } catch (err: unknown) {
    if (err && typeof err === "object" && "status" in err) throw err;
  }
}

function getQueueDb() {
  const event = getRequestEvent();
  return event?.locals?.dbAdapter ?? getDb();
}

function getQueueTenantId(): DatabaseId | null {
  return (getRequestEvent()?.locals?.tenantId as DatabaseId | null | undefined) ?? null;
}

export const retryJob = async (data: unknown) => {
  requireAdminPermission();
  const jobId = String(data) as DatabaseId;

  if (!jobId) throw error(400, "Job ID is required");

  const db = getQueueDb();
  if (!db?.system?.jobs) throw error(500, "Database adapter not ready or jobs not supported.");

  const tenantId = getQueueTenantId();
  const result = await db.system.jobs.update(
    jobId,
    {
      status: "pending",
      attempts: 0,
      nextRunAt: new Date(),
      lastError: undefined,
    },
    { tenantId },
  );

  if (!result.success) {
    logger.error("Failed to retry job:", result.message);
    throw error(500, result.message);
  }
  return { success: true };
};

export const deleteJob = async (data: unknown) => {
  requireAdminPermission();
  const jobId = String(data) as DatabaseId;

  if (!jobId) throw error(400, "Job ID is required");

  const db = getQueueDb();
  if (!db?.system?.jobs) throw error(500, "Database adapter not ready or jobs not supported.");

  const tenantId = getQueueTenantId();
  const result = await db.system.jobs.delete(jobId, { tenantId });

  if (!result.success) {
    logger.error("Failed to delete job:", result.message);
    throw error(500, result.message);
  }
  return { success: true };
};

export const clearCompleted = async (_data?: unknown) => {
  requireAdminPermission();
  const db = getQueueDb();
  if (!db?.system?.jobs) throw error(500, "Database adapter not ready or jobs not supported.");

  // Tenant-scoped when the request carries one (`null` selects global scope);
  // the adapter only removes `completed` rows, so pending retries and failed jobs survive.
  const tenantId = getQueueTenantId();
  const result = await db.system.jobs.cleanup(new Date(), { tenantId });

  if (!result.success) {
    logger.error("Failed to clear completed jobs:", result.message);
    throw error(500, result.message);
  }
  return { success: true, count: result.data };
};
