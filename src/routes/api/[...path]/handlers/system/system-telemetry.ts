/**
 * @file src/routes/api/[...path]/handlers/system/system-telemetry.ts
 * @description Telemetry and system-preference routes.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse } from "../base";

/**
 * --- TELEMETRY ---
 */
export async function handleTelemetryRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  const action = segments[1];
  if (action === "stats")
    return successResponse(
      event,
      await cms.telemetry.checkUpdateStatus({ tenantId: _tenantId as any }),
    );
  if (action === "diagnose") {
    const { telemetryService } = await import("@src/services/observability/telemetry-service");
    return successResponse(event, await telemetryService.diagnoseConnection());
  }
  if (action === "report" && event.request.method === "POST") {
    return rawResponse(event, { status: "active", success: true });
  }
  throw new AppError(`Telemetry action ${action} not implemented`, 404);
}

/**
 * --- PREFERENCES ---
 */
export async function handlePreferenceRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;

  let key = segments[1] || segments[2] || url.searchParams.get("key");
  const scope = (url.searchParams.get("scope") as "system" | "user") || "user";
  let body: any = {};

  if (request.method === "POST" || request.method === "PUT") {
    body = await request.json().catch(() => ({}));
    if (!key) key = body.key;
  }

  if (!key) throw new AppError("Preference key is required", 400);

  const options = {
    scope: scope as "user" | "system",
    userId: scope === "user" ? (user?._id as DatabaseId) : undefined,
    tenantId: tenantId as DatabaseId,
  };

  if (request.method === "GET") {
    const result = await cms.db.system.preferences.get(key, options);
    if (!result.success) {
      throw new AppError(result.message || "Failed to get preference", 500);
    }
    if (result.data === null) {
      throw new AppError("Preference not found", 404);
    }
    return rawResponse(event, result.data);
  }

  if (request.method === "POST" || request.method === "PUT") {
    const value = body.value !== undefined ? body.value : body;
    const result = await cms.db.system.preferences.set(key, value, {
      ...options,
      category: body.category,
    });
    if (!result.success) {
      throw new AppError(result.message || "Failed to set preference", 500);
    }
    return rawResponse(event, result);
  }

  if (request.method === "DELETE") {
    const result = await cms.db.system.preferences.delete(key, options);
    if (!result.success) {
      throw new AppError(result.message || "Failed to delete preference", 500);
    }
    return rawResponse(event, result);
  }

  throw new AppError(`Method ${request.method} not allowed for preferences`, 405);
}
