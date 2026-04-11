/**
 * @file src/routes/api/security/stats/+server.ts
 * @description
 * API endpoint to retrieve security statistics and active incidents.
 * Supports multi-tenancy by filtering data based on locals.tenantId.
 *
 * Features:
 * - Real-time security metrics from metricsService
 * - Active incident tracking from securityResponseService
 * - Overall security status calculation
 * - Historical threat level distribution
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { securityResponseService } from "@src/services/security-response-service";
import type { SecurityIncident, ThreatIndicator } from "@src/services/security-types";
import { metricsService } from "@src/services/metrics-service";
import { hasApiPermission } from "@src/databases/auth/api-permissions";
import { AppError } from "@utils/error-handling";

/**
 * GET /api/security/stats
 * Returns security statistics, active incidents, and overall system status.
 */
export const GET = apiHandler(async ({ locals }) => {
  // 1. Authorization Check (Admin only)
  if (!locals.user || !hasApiPermission(locals.user.role, "security")) {
    throw new AppError(
      "Unauthorized: Admin access required for security statistics",
      403,
      "UNAUTHORIZED",
    );
  }

  const tenantId = locals.tenantId || undefined;

  // 2. Fetch data from services (concurrency for performance)
  const [securityStats, metricsReport, activeIncidents] = await Promise.all([
    securityResponseService.getSecurityStats(tenantId),
    metricsService.getReport(tenantId),
    securityResponseService.getActiveIncidents(tenantId),
  ]);

  // 3. Calculate overall status
  const overallStatus = calculateOverallSecurityStatus(
    securityStats,
    metricsReport,
    activeIncidents.length,
  );

  // 4. Construct response
  const response = {
    tenantId: tenantId || "global",
    timestamp: new Date().toISOString(),
    overallStatus,
    activeIncidents: securityStats.activeIncidents || activeIncidents.length,
    totalIncidents: securityStats.totalIncidents || 0,
    blockedIPs: securityStats.blockedIPs || 0,
    throttledIPs: securityStats.throttledIPs || 0,
    threatLevelDistribution: securityStats.threatLevelDistribution || {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    },
    metrics: {
      cspViolations: metricsReport.security?.cspViolations || 0,
      rateLimitViolations: metricsReport.security?.rateLimitViolations || 0,
      authFailures: metricsReport.security?.authFailures || 0,
    },
    recentEvents: activeIncidents.slice(0, 10).map((incident: SecurityIncident) => ({
      id: incident.id,
      timestamp: incident.timestamp,
      type: incident.threatLevel === "critical" ? "attack" : "incident",
      severity: incident.threatLevel,
      description: incident.indicators.map((i: ThreatIndicator) => i.evidence).join(", "),
      clientIp: incident.clientIp,
      status: incident.resolved ? "resolved" : "active",
    })),
  };

  return json(response);
});

/**
 * Calculates the overall security status based on various indicators.
 */
function calculateOverallSecurityStatus(
  securityStats: any,
  metricsReport: any,
  activeCount: number,
): "stable" | "warning" | "critical" {
  const threatLevelDistribution = securityStats.threatLevelDistribution || {};
  const activeIncidents = securityStats.activeIncidents || activeCount;
  const securityMetrics = metricsReport.security || {};

  // 1. Critical Status: Active critical incidents or very high volume of attacks
  if ((threatLevelDistribution.critical || 0) > 0 || activeIncidents > 10) {
    return "critical";
  }

  // 2. Warning Status: High threat incidents or sustained anomalies
  if (
    (threatLevelDistribution.high || 0) > 0 ||
    activeIncidents > 5 ||
    (securityMetrics.authFailures || 0) > 50 ||
    (securityMetrics.cspViolations || 0) > 100
  ) {
    return "warning";
  }

  // 3. Stable: Normal operating conditions
  return "stable";
}
