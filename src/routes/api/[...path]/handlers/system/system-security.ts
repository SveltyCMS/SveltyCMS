/**
 * @file src/routes/api/[...path]/handlers/system/system-security.ts
 * @description Security statistics and CSP-report routes.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { rawResponse } from "../base";

/**
 * --- SECURITY ---
 */
export async function handleSecurityRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const action = segments[1];

  if (action === "stats" && request.method === "GET") {
    if (!locals.user || locals.user.role !== "admin") {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }
    const { securityResponseService } = await import("@src/services/security/response-service");
    const { metricsService } = await import("@src/services/observability/metrics-service");

    const stats = await securityResponseService.getSecurityStats();
    const report = metricsService.getReport(tenantId as string);

    return rawResponse(event, {
      ...stats,
      overallStatus: stats.activeIncidents > 0 ? "warning" : "healthy",
      metrics: report.security,
    });
  }

  if (action === "csp-report" && request.method === "POST") {
    const report = await request.json();
    const { metricsService } = await import("@src/services/observability/metrics-service");

    const blockedUri = report["csp-report"]?.["blocked-uri"];
    const isFalsePositive =
      blockedUri?.startsWith("chrome-extension://") || blockedUri?.startsWith("moz-extension://");

    if (!isFalsePositive) {
      metricsService.incrementCSPViolations(tenantId as string);
      return rawResponse(event, { status: "received" });
    }

    return rawResponse(event, { status: "ignored" });
  }

  throw new AppError(`Security action ${action} not implemented`, 404);
}
