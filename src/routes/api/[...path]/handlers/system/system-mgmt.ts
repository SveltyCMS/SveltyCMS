/**
 * @file src/routes/api/[...path]/handlers/system/system-mgmt.ts
 * @description System reinitialization, refresh, and setup-status routes.
 */

import { logger } from "@src/utils/logger";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";
import { invalidateHealthCache } from "./system-health";

/**
 * --- SYSTEM MGMT ---
 */
export async function handleSystemMgmtRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  // 🛡️ SECURITY: Admin verification for system management
  const { user } = event.locals;
  if (!user || (!user.isAdmin && user.role !== "admin")) {
    throw new AppError("Admin access required for system management", 403, "FORBIDDEN");
  }

  const action = segments[1];
  if (action === "reinitialize" && event.request.method === "POST") {
    const body = await event.request.json().catch(() => ({}));
    invalidateHealthCache();
    const result = await cms.system.reinitialize(body.force ?? true);
    return successResponse(event, result ?? { reinitialized: true });
  }
  if (action === "refresh" && event.request.method === "POST") {
    const body = await event.request.json().catch(() => ({}));
    invalidateHealthCache();
    const refreshResult = await cms.system.refresh({
      tenantId: body.tenantId,
      skipReconciliation: body.skipReconciliation ?? false,
    });

    // 🚀 SYNCHRONOUS GRAPHQL SCHEMA WARMUP: Rebuild Yoga schema immediately
    // so that subsequent benchmark requests hit a fully ready schema.
    try {
      const { _getYogaApp } = await import("@src/routes/api/graphql/+server");
      if (_getYogaApp) {
        await _getYogaApp(cms.db, body.tenantId);
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.info(`[System Refresh] Successfully warmed up GraphQL Yoga Schema.`);
        }
      }
    } catch (err: any) {
      logger.warn(`[System Refresh] GraphQL warmup skipped or failed: ${err.message}`);
    }

    return successResponse(event, refreshResult);
  }
  throw new AppError(`System action ${action} not implemented`, 404);
}

/**
 * --- SETUP ---
 */
export async function handleSetupRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  const action = segments[1];

  if (action === "initialize" && event.request.method === "POST") {
    const body = await event.request.json().catch(() => ({}));
    return successResponse(event, await cms.system.reinitialize(body.force ?? true));
  }
  if (action === "status" && event.request.method === "GET") {
    return successResponse(event, { status: "ready", initialized: true });
  }
  throw new AppError(`Setup action ${action} not implemented`, 404);
}
