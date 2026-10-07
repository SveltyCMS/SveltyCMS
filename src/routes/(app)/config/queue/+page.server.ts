/**
 * @file src/routes/(app)/config/queue/+page.server.ts
 * @description Server-side logic for the Queue Observability Dashboard.
 */

import { getDb } from "@src/databases/db";
import { raise } from "@utils/error-handling";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals }) => {
  getAuthenticatedUser(locals);
  if (!locals.isAdmin) {
    raise(403, "Admin privileges required");
  }

  // Request-scoped, tenant-bound adapter. `system.jobs.*` is fail-closed under
  // multi-tenancy (assertTenantContext), so the raw global adapter would reject
  // with TENANT_CONTEXT_MISSING — the tenant is carried in the query options below.
  const db = locals.dbAdapter ?? getDb();
  if (!db || !db.system.jobs) {
    raise(500, "Database adapter not ready or jobs not supported.");
  }

  const status = url.searchParams.get("status") || undefined;
  const taskType = url.searchParams.get("taskType") || undefined;
  const limit = Number(url.searchParams.get("limit")) || 25;
  const offset = Number(url.searchParams.get("offset")) || 0;
  const tenantId = locals.tenantId ?? undefined;

  const [jobsResult, countResult] = await Promise.all([
    db.system.jobs.list({ status, taskType, limit, offset, tenantId }),
    db.system.jobs.count({ status, taskType, tenantId }),
  ]);

  if (!jobsResult.success || !countResult.success) {
    raise(500, "Failed to fetch jobs.");
  }

  // Fetch statistics
  const [total, pending, running, completed, failed] = await Promise.all([
    db.system.jobs.count({ tenantId }),
    db.system.jobs.count({ status: "pending", tenantId }),
    db.system.jobs.count({ status: "running", tenantId }),
    db.system.jobs.count({ status: "completed", tenantId }),
    db.system.jobs.count({ status: "failed", tenantId }),
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
