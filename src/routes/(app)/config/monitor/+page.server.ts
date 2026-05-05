/**
 * @file src/routes/(app)/config/monitor/+page.server.ts
 * @description Server-side data loading for the Enterprise Monitor Dashboard.
 */

import { error } from "@sveltejs/kit";
import { securityResponseService } from "@src/services/security/response-service";
import { metricsService } from "@src/services/observability/metrics-service";
import { webhookService } from "@src/services/background/webhook-service";
import type { IDBAdapter } from "@src/databases/db-interface";

const getDbAdapter = async () => (await import("@src/databases/db")).dbAdapter as IDBAdapter;

export const load = async ({ locals }) => {
  const { user, tenantId } = locals;

  // Admin only access
  if (user?.role !== "admin") {
    throw error(403, "Access Denied: Admin privileges required");
  }

  const dbAdapter = await getDbAdapter();

  // 1. Security Stats
  const securityStats = await securityResponseService.getSecurityStats(tenantId || undefined);

  // 2. Trash Recovery Count
  const trashCountRes = await dbAdapter.crud.count(
    "_trash",
    {},
    { tenantId: tenantId || undefined },
  );
  const trashCount = trashCountRes.success ? trashCountRes.data : 0;

  // 3. Webhook Health
  const webhooks = await webhookService.getWebhooks((tenantId as string) || "");
  const webhookStats = {
    total: webhooks.length,
    active: webhooks.filter((w) => w.active).length,
    failures: 0, // In a real scenario, we'd fetch actual failure metrics
  };

  // 4. System Metrics
  const metrics = await metricsService.getSystemMetrics();

  return {
    security: securityStats,
    trash: { count: trashCount },
    webhooks: webhookStats,
    system: metrics,
  };
};
