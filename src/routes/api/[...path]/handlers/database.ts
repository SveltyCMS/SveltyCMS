/**
 * @file src/routes/api/[...path]/handlers/database.ts
 * @description Database resilience API — pool diagnostics and unified system status.
 *
 * ### Features:
 * - GET /api/database/pool-diagnostics
 * - GET /api/database/status
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "./base";
import { getDatabaseResilience } from "@src/databases/database-resilience";
import { getSystemStatus } from "@src/databases/resilience-integration";

function requireAdmin(event: RequestEvent): void {
  const { user, locals } = event;
  if (locals.isAdmin || user?.role === "admin" || user?.role === "super-admin") return;
  throw new AppError("Admin access required", 403, "FORBIDDEN");
}

export async function handleDatabaseRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  requireAdmin(event);

  const action = segments[1];

  if (event.request.method === "GET" && action === "pool-diagnostics") {
    const resilience = getDatabaseResilience();
    const diagnostics = await resilience.getPoolDiagnostics();
    return successResponse(event, diagnostics);
  }

  if (event.request.method === "GET" && (action === "status" || !action)) {
    const status = await getSystemStatus(cms.db);
    return successResponse(event, status);
  }

  throw new AppError(`Database endpoint /api/database/${action || ""} not implemented`, 404);
}
