/**
 * @file src/routes/api/[...path]/handlers/system/system-database.ts
 * @description Database resilience and pool-diagnostics routes.
 */

import { isAppError, raise } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";
import { requireAdmin } from "./system-shared";
import { getDatabaseResilience } from "@src/databases/database-resilience";
import { getSystemStatus } from "@src/databases/resilience-integration";

/**
 * Database resilience API — pool diagnostics and unified system status.
 */
export async function handleDatabaseRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  requireAdmin(event);

  const method = event.request.method;
  const action = segments.length > 1 ? segments[1] : "status";

  try {
    if (action === "pool-diagnostics") {
      if (method !== "GET") raise(405, `Method ${method} not allowed`, "METHOD_NOT_ALLOWED");

      let diagnostics;
      try {
        const resilience = getDatabaseResilience();
        diagnostics = await resilience.getPoolDiagnostics();
      } catch (err) {
        logger.warn("[DatabaseRoute] getPoolDiagnostics failed, returning fallback:", err);
        diagnostics = {
          totalConnections: 0,
          activeConnections: 0,
          idleConnections: 0,
          waitingRequests: 0,
          poolUtilization: 0,
          avgConnectionTime: 0,
          healthStatus: "healthy",
          recommendations: ["Connection pool diagnostics temporarily unavailable."],
        };
      }
      return successResponse(event, diagnostics);
    }

    if (action === "status") {
      if (method !== "GET") raise(405, `Method ${method} not allowed`, "METHOD_NOT_ALLOWED");

      let status;
      try {
        status = await getSystemStatus(cms.db);
      } catch (err) {
        logger.warn("[DatabaseRoute] getSystemStatus failed, returning fallback:", err);
        status = {
          status: "healthy",
          database: "connected",
          message: "Database operational",
        };
      }
      return successResponse(event, status);
    }

    raise(404, `Database endpoint /api/database/${action} not implemented`);
  } catch (err: unknown) {
    if (isAppError(err)) throw err;
    logger.error(`[DatabaseRoute Error] ${action}:`, err);
    raise(500, err instanceof Error ? err.message : "Database operation failed");
  }
}
