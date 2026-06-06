/**
 * @file src/routes/(app)/config/queue/+page.server.ts
 * @description Server-side logic for the Queue Observability Dashboard.
 */

import { getDb } from "@src/databases/db";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

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
