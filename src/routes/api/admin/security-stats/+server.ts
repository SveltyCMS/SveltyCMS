/**
 * @file src/routes/api/admin/security-stats/+server.ts
 * @description Admin API endpoint for security monitoring statistics
 *
 * Features:
 * - GET: Active incidents, blocked/throttled IPs, threat distribution
 * - Admin-only access
 */

import { securityResponseService } from "@src/services/security-response-service";
import type { SecurityIncident } from "@src/services/security-types";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

import { getPrivateSettingSync } from "@src/services/settings-service";

export const GET = apiHandler(async ({ locals }) => {
  const { user } = locals;
  const userRole = user?.role;
  const isSuperAdmin = userRole === "super-admin";
  const isMultiTenant = getPrivateSettingSync("MULTI_TENANT");

  // SECURITY: In multi-tenant mode, global security stats require super-admin
  if (!user || (isMultiTenant && !isSuperAdmin) || (!isMultiTenant && userRole !== "admin")) {
    throw new AppError("Forbidden: Access restricted", 403, "FORBIDDEN");
  }

  const stats = await securityResponseService.getSecurityStats();
  const activeIncidents = await securityResponseService.getActiveIncidents();

  return json({
    ...stats,
    recentIncidents: activeIncidents.slice(0, 20).map((inc: SecurityIncident) => ({
      id: inc.id,
      clientIp: inc.clientIp,
      threatLevel: inc.threatLevel,
      indicatorCount: inc.indicators.length,
      timestamp: new Date(inc.timestamp).toISOString(),
      responseActions: inc.responseActions,
    })),
  });
});
