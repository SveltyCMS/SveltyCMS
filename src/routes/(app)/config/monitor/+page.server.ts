/**
 * @file src/routes/(app)/config/monitor/+page.server.ts
 * @description Server-side data loading for the Enterprise Monitor Dashboard.
 * Each data source is fetched independently — one failure won't block the rest —
 * but all five are awaited in parallel (they share no inputs beyond `tenantId`).
 *
 * ### Features:
 * - registers the `app:monitor` dependency the page's 30 s poll invalidates
 * - one `Promise.all` over five independently soft-failing loaders
 * - every loader keeps its own degraded value so a dead service renders 0/unknown
 */

import { error } from "@sveltejs/kit";
import { logger } from "@utils/logger";
import { getAuthenticatedUser } from "@utils/page-guards.server";

/** Dependency key the dashboard's 30 s poll calls `invalidate()` on. */
const MONITOR_DEPENDENCY = "app:monitor";

async function loadSecurityStats(tenantId: string | undefined) {
  try {
    const { securityResponseService } = await import("@src/services/security/response-service");
    return await securityResponseService.getSecurityStats(tenantId);
  } catch (e) {
    logger.warn("[Monitor] Security stats unavailable", e);
    return { incidentCount: 0, blockedIpsCount: 0, recentIncidents: [] };
  }
}

async function loadWebhookStats(tenantId: string) {
  try {
    const { webhookService } = await import("@src/services/background/webhook-service");
    const list = await webhookService.getWebhooks(tenantId);
    return {
      total: list.length,
      active: list.filter((w) => w.active).length,
      failures: 0,
    };
  } catch (e) {
    logger.warn("[Monitor] Webhook stats unavailable", e);
    return { total: 0, active: 0, failures: 0 };
  }
}

async function loadSystemMetrics() {
  try {
    const { metricsService } = await import("@src/services/observability/metrics-service");
    return await metricsService.getSystemMetrics();
  } catch (e) {
    logger.warn("[Monitor] System metrics unavailable", e);
    return { memoryUsage: 0, cpuLoad: 0, uptime: 0 };
  }
}

async function loadSystemState() {
  try {
    const { getSystemState } = await import("@src/stores/system/state.svelte.ts");
    const state = getSystemState();
    return {
      overallState: state.overallState as string,
      services: Object.entries(state.services).map(([name, svc]) => ({
        name,
        status: svc.status || "unknown",
        message: svc.message || "",
        lastChecked: svc.lastChecked || null,
        initDuration: svc.metrics?.initializationDuration ?? null,
        failures: svc.metrics?.failureCount ?? 0,
      })),
    };
  } catch (e) {
    logger.warn("[Monitor] System state unavailable", e);
    return {
      overallState: "unknown" as string,
      services: [] as {
        name: string;
        status: string;
        message: string;
        lastChecked: number | null;
        initDuration: number | null;
        failures: number;
      }[],
    };
  }
}

async function loadAuditLogs(tenantId: string | undefined) {
  try {
    const { queryAuditLogs } = await import("@src/services/security/audit-service");
    const res = await queryAuditLogs({
      tenantId,
      limit: 20,
    });
    return res.success && res.data ? res.data : [];
  } catch (e) {
    logger.warn("[Monitor] Audit logs unavailable", e);
    return [];
  }
}

export const load = async ({
  locals,
  depends,
}: {
  locals: App.Locals;
  depends: (dep: string) => void;
}) => {
  getAuthenticatedUser(locals);
  const { tenantId, isAdmin } = locals;

  if (!isAdmin) {
    throw error(403, "Access Denied: Admin privileges required");
  }

  // The page polls `invalidate('app:monitor')` every 30 s — without this the
  // invalidation matched no load and the dashboard silently froze on first paint.
  depends(MONITOR_DEPENDENCY);

  const [security, webhooks, system, systemState, auditLogs] = await Promise.all([
    loadSecurityStats(tenantId || undefined),
    loadWebhookStats((tenantId as string) || ""),
    loadSystemMetrics(),
    loadSystemState(),
    loadAuditLogs(tenantId || undefined),
  ]);

  return { security, webhooks, system, systemState, auditLogs };
};
