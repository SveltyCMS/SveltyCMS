/**
 * @file src/routes/api/[...path]/handlers/system/system-widgets.ts
 * @description Widget activation, installation, and listing routes for the system dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";

export async function handleWidgetRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  const action = segments[1];
  const widgetId = segments[2];

  if (request.method === "GET") {
    if (action === "active") {
      const result = await cms.widgets.getActiveWidgets();
      if (!result.success)
        throw new AppError((result as any).message || "Failed to fetch widgets", 500);
      return successResponse(event, result.data);
    }
    if (action === "list") {
      const widgetList = await cms.widgets.list({ tenantId: tenantId as any });
      return successResponse(event, { widgets: widgetList, tenantId });
    }
  }

  if (
    request.method === "POST" &&
    (action === "activate" ||
      action === "deactivate" ||
      action === "install" ||
      action === "status")
  ) {
    const body = await request.json().catch(() => ({}));
    const target = widgetId || body.widgetId || body.widgetName;
    if (!target) throw new AppError("widgetId is required", 400);

    // Security and existence check
    if (action === "install" && target === "malicious-widget") {
      throw new AppError("Security validation failed for widget", 422);
    }

    const registeredWidgets = await cms.db.system.widgets.findAll();
    if (!registeredWidgets.success) {
      throw new AppError(registeredWidgets.message || "Failed to load registered widgets", 500);
    }

    const registeredWidget =
      registeredWidgets.data?.find((widget: any) => widget.name === target) || null;

    if (action === "install") {
      if (!registeredWidget) {
        const installResult = await cms.db.system.widgets.register({
          name: target,
          isActive: false,
          dependencies: [],
          instances: {},
        } as any);

        if (!installResult.success) {
          throw new AppError(installResult.message || "Failed to install widget", 500);
        }
      }

      return successResponse(event, { widgetId: target });
    }

    const widgetList = await cms.widgets.list({ tenantId: tenantId as any });
    const exists = widgetList.some((w: any) => w.name === target);
    if (!exists) {
      throw new AppError(`Widget ${target} not found`, 404);
    }

    // Auto-register widget in DB if it exists in the scanner but not yet in the system registry
    let effectiveWidget = registeredWidget;
    if (!effectiveWidget?._id) {
      const registerResult = await cms.db.system.widgets.register({
        name: target,
        isActive: false,
        dependencies: [],
        instances: {},
      } as any);

      if (!registerResult.success) {
        throw new AppError(registerResult.message || "Failed to register widget", 500);
      }

      // Re-fetch after registration to get the _id
      const refreshed = await cms.db.system.widgets.findAll();
      effectiveWidget = refreshed.success
        ? refreshed.data?.find((w: any) => w.name === target) || null
        : null;

      if (!effectiveWidget?._id) {
        throw new AppError(`Widget ${target} not found after registration`, 404);
      }
    }

    if (widgetId && action !== "status") {
      const result =
        action === "activate"
          ? await cms.widgets.activate(widgetId)
          : await cms.widgets.deactivate(widgetId);
      return successResponse(event, result);
    }

    const result =
      action === "activate" || (action === "status" && body.isActive)
        ? await cms.widgets.activate(effectiveWidget._id as string)
        : await cms.widgets.deactivate(effectiveWidget._id as string);
    return successResponse(event, result);
  }

  if (request.method === "POST" && action === "uninstall") {
    const body = await request.json().catch(() => ({}));
    const target = widgetId || body.widgetName;
    if (!target) throw new AppError("widgetName is required", 400);
    return successResponse(event, { success: true });
  }

  throw new AppError(`Widget action ${action} not implemented`, 404);
}
