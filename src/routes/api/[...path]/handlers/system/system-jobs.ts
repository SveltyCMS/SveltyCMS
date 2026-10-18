/**
 * @file src/routes/api/[...path]/handlers/system/system-jobs.ts
 * @description Scheduled-job listing, creation, and cancellation routes.
 */

import { AppError } from "@utils/error-handling";
import { acceptStatusTransitionJob } from "@src/services/scheduler";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";

/**
 * --- SYSTEM JOBS ---
 */
export async function handleSystemJobRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  const action = segments[1];

  // GET /api/system-jobs — list scheduled jobs
  if (request.method === "GET") {
    const db = _cms.db;
    if (!db.system?.jobs) {
      throw new AppError("Jobs system not available", 501, "NOT_IMPLEMENTED");
    }

    const statusParam = new URL(request.url).searchParams.get("status");
    const listOptions: { status?: string } = {};
    if (statusParam) {
      listOptions.status = statusParam;
    }
    const result = await db.system.jobs.list(listOptions);

    if (!result.success) {
      throw new AppError(result.message || "Failed to list jobs", 500);
    }
    return successResponse(event, result.data || []);
  }

  // POST /api/system-jobs — create a new scheduled job
  if (request.method === "POST") {
    const db = _cms.db;
    if (!db.system?.jobs) {
      throw new AppError("Jobs system not available", 501, "NOT_IMPLEMENTED");
    }

    const userId = event.locals.user?._id;
    if (!userId) throw new AppError("Authentication required", 401, "UNAUTHORIZED");

    const body = await request.json().catch(() => ({}));
    const { taskType, payload, runAt } = body;

    // Only the `status-transition` task publishes, and its actor must be the
    // authenticated user — never a client-supplied `scheduledBy`/`tenantId`.
    // Every other task type keeps the generic contract the queue API has always
    // had (this endpoint is admin-only via the endpoint-permission map).
    let normalizedTaskType: string;
    let normalizedPayload: Record<string, unknown>;
    if (taskType === "status-transition") {
      try {
        const accepted = acceptStatusTransitionJob(taskType, payload, String(userId));
        normalizedTaskType = accepted.taskType;
        normalizedPayload = accepted.payload;
      } catch (err) {
        throw new AppError(err instanceof Error ? err.message : "Invalid job", 400);
      }
    } else {
      if (!taskType || !payload) {
        throw new AppError("taskType and payload are required", 400);
      }
      normalizedTaskType = String(taskType);
      normalizedPayload = payload as Record<string, unknown>;
    }

    const nextRunAt = runAt ? new Date(runAt) : new Date();

    const result = await db.system.jobs.create({
      taskType: normalizedTaskType,
      payload: normalizedPayload,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      nextRunAt,
      tenantId: tenantId as any,
    });

    if (!result.success) {
      throw new AppError(result.message || "Failed to create job", 500);
    }

    return successResponse(event, result.data, 201);
  }

  // DELETE /api/system-jobs/:jobId — cancel/delete a scheduled job
  if (request.method === "DELETE") {
    const jobId = action;
    if (!jobId) {
      throw new AppError("jobId is required", 400);
    }

    const db = _cms.db;
    if (!db.system?.jobs) {
      throw new AppError("Jobs system not available", 501, "NOT_IMPLEMENTED");
    }

    const result = await db.system.jobs.delete(jobId as DatabaseId);
    if (!result.success) {
      throw new AppError(result.message || "Failed to delete job", 500);
    }

    return successResponse(event, { deleted: true });
  }

  throw new AppError(`Method ${request.method} not allowed for system-jobs`, 405);
}
