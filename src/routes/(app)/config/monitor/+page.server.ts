/**
 * @file src/routes/(app)/config/monitor/+page.server.ts
 * @description Server-side data loading for the Enterprise Monitor Dashboard.
 * Each data source is fetched independently — one failure won't block the rest.
 */

import { error } from "@sveltejs/kit";
import { logger } from "@utils/logger";

export const load = async ({ locals }: { locals: App.Locals }) => {
  const { user, tenantId } = locals;

  if (!user?.isAdmin) {
    throw error(403, "Access Denied: Admin privileges required");
  }

  // --- Fetch each data source independently ---

  let security: any = {
    incidentCount: 0,
    blockedIpsCount: 0,
    recentIncidents: [],
  };
  try {
    const { securityResponseService } = await import("@src/services/security/response-service");
    security = await securityResponseService.getSecurityStats(tenantId || undefined);
  } catch (e) {
    logger.warn("[Monitor] Security stats unavailable", e);
  }

  let webhooks = { total: 0, active: 0, failures: 0 };
  try {
    const { webhookService } = await import("@src/services/background/webhook-service");
    const list = await webhookService.getWebhooks((tenantId as string) || "");
    webhooks = {
      total: list.length,
      active: list.filter((w: any) => w.active).length,
      failures: 0,
    };
  } catch (e) {
    logger.warn("[Monitor] Webhook stats unavailable", e);
  }

  let system: any = { memoryUsage: 0, cpuLoad: 0, uptime: 0 };
  try {
    const { metricsService } = await import("@src/services/observability/metrics-service");
    system = await metricsService.getSystemMetrics();
  } catch (e) {
    logger.warn("[Monitor] System metrics unavailable", e);
  }

  let systemState = {
    overallState: "unknown" as string,
    services: [] as any[],
  };
  try {
    const { getSystemState } = await import("@src/stores/system/state.svelte.ts");
    const state = getSystemState();
    systemState = {
      overallState: state.overallState,
      services: Object.entries(state.services || {}).map(([name, svc]) => {
        const s = svc as any;
        return {
          name,
          status: s.status || "unknown",
          message: s.message || "",
          lastChecked: s.lastChecked || null,
          initDuration: s.metrics?.initializationDuration ?? null,
          failures: s.metrics?.failureCount ?? 0,
        };
      }),
    };
  } catch (e) {
    logger.warn("[Monitor] System state unavailable", e);
  }

  return { security, webhooks, system, systemState };
};
