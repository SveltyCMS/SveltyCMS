/**
 * @file src/routes/api/[...path]/handlers/system/system-database.ts
 * @description Database resilience and pool-diagnostics routes.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";
import { requireAdmin } from "./system-shared";
import { getDatabaseResilience } from "@src/databases/database-resilience";
import { getSystemStatus } from "@src/databases/resilience-integration";
import { requireDashboardWidgetLicense } from "../dashboard";

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

  if (action === "pool-diagnostics") {
    if (method !== "GET")
      throw new AppError(`Method ${method} not allowed`, 405, "METHOD_NOT_ALLOWED");
    // Premium dashboard widget data source — license gate (defense-in-depth).
    await requireDashboardWidgetLicense("database-pool-diagnostics");
    const resilience = getDatabaseResilience();
    const diagnostics = await resilience.getPoolDiagnostics();
    return successResponse(event, diagnostics);
  }

  if (action === "status") {
    if (method !== "GET")
      throw new AppError(`Method ${method} not allowed`, 405, "METHOD_NOT_ALLOWED");
    const status = await getSystemStatus(cms.db);
    return successResponse(event, status);
  }

  throw new AppError(`Database endpoint /api/database/${action} not implemented`, 404);
}
