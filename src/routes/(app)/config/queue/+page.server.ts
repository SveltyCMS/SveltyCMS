/**
 * @file src/routes/(app)/config/queue/+page.server.ts
 * @description Server-side logic for the Queue Observability Dashboard.
 */

import { getDb } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { error, fail } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
  const db = getDb();
  if (!db || !db.system.jobs) {
    throw error(500, "Database adapter not ready or jobs not supported.");
  }

  const status = url.searchParams.get("status") || undefined;
  const taskType = url.searchParams.get("taskType") || undefined;
  const limit = Number(url.searchParams.get("limit")) || 25;
  const offset = Number(url.searchParams.get("offset")) || 0;

  const [jobsResult, countResult] = await Promise.all([
    db.system.jobs.list({ status, taskType, limit, offset }),
    db.system.jobs.count({ status, taskType }),
  ]);

  if (!jobsResult.success || !countResult.success) {
    throw error(500, "Failed to fetch jobs.");
  }

  // Fetch statistics
  const [total, pending, running, completed, failed] = await Promise.all([
    db.system.jobs.count({}),
    db.system.jobs.count({ status: "pending" }),
    db.system.jobs.count({ status: "running" }),
    db.system.jobs.count({ status: "completed" }),
    db.system.jobs.count({ status: "failed" }),
  ]);

  return {
    jobs: jobsResult.data,
    totalCount: countResult.data,
    stats: {
      total: total.success ? total.data : 0,
      pending: pending.success ? pending.data : 0,
      running: running.success ? running.data : 0,
      completed: completed.success ? completed.data : 0,
      failed: failed.success ? failed.data : 0,
    },
    pagination: {
      limit,
      offset,
    },
  };
};

export const actions: Actions = {
  retryJob: async ({ request }) => {
    const db = getDb();
    if (!db || !db.system.jobs) return fail(500, { message: "Database not ready" });

    const formData = await request.formData();
    const jobId = formData.get("jobId") as string;

    if (!jobId) return fail(400, { message: "Job ID is required" });

    const result = await db.system.jobs.update(jobId as DatabaseId, {
      status: "pending",
      attempts: 0,
      nextRunAt: new Date(),
      lastError: undefined,
    });

    if (!result.success) {
      return fail(500, { message: result.message });
    }

    return { success: true };
  },

  deleteJob: async ({ request }) => {
    const db = getDb();
    if (!db || !db.system.jobs) return fail(500, { message: "Database not ready" });

    const formData = await request.formData();
    const jobId = formData.get("jobId") as string;

    if (!jobId) return fail(400, { message: "Job ID is required" });

    const result = await db.system.jobs.delete(jobId as DatabaseId);

    if (!result.success) {
      return fail(500, { message: result.message });
    }

    return { success: true };
  },

  clearCompleted: async () => {
    const db = getDb();
    if (!db || !db.system.jobs) return fail(500, { message: "Database not ready" });

    // In a real scenario, we might want to cleanup jobs older than a certain date
    // For now, let's just use the cleanup method with a very recent date to clear all finished jobs
    const result = await db.system.jobs.cleanup(new Date());

    if (!result.success) {
      return fail(500, { message: result.message });
    }

    return { success: true, count: result.data };
  },
};
