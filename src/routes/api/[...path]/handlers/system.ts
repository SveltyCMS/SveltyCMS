/**
 * @file src/routes/api/[...path]/handlers/system.ts
 * @description System dispatcher. Routes namespaces to the split handler modules in `./system/`.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "./base";
import { handleWidgetRoutes } from "./system/system-widgets";
import { handleWebhookRoutes } from "./system/system-webhooks";
import { handleSettingsRoutes } from "./system/system-settings";
import { handleSystemMgmtRoutes, handleSetupRoutes } from "./system/system-mgmt";
import { handleSystemJobRoutes } from "./system/system-jobs";
import { handleAiRoutes, handleAiBuilderRoutes } from "./system/system-ai";
import { handleWorkflowRoutes, handleAutomationRoutes } from "./system/system-workflows";
import { handleTelemetryRoutes, handlePreferenceRoutes } from "./system/system-telemetry";
import { handleThemeRoutes } from "./system/system-theme";
import { handleHealthRoutes, invalidateHealthCache } from "./system/system-health";
import {
  handleImporterRoutes,
  handleExportRoutes,
  handleImportRoutes,
} from "./system/system-transfer";
import { handleSystemVirtualFolderRoutes } from "./system/system-vfs";
import { handlePluginSettingsRoutes } from "./system/system-plugin-settings";
import { handleVersionRoutes } from "./system/system-version";
import { handleDatabaseRoutes } from "./system/system-database";
import { handleLogsRoutes } from "./system/system-logs";
import { handleSecurityRoutes } from "./system/system-security";

export {
  handleWidgetRoutes,
  handleWebhookRoutes,
  handleSettingsRoutes,
  handleSystemMgmtRoutes,
  handleSetupRoutes,
  handleSystemJobRoutes,
  handleAiRoutes,
  handleAiBuilderRoutes,
  handleWorkflowRoutes,
  handleAutomationRoutes,
  handleTelemetryRoutes,
  handlePreferenceRoutes,
  handleThemeRoutes,
  handleHealthRoutes,
  invalidateHealthCache,
  handleImporterRoutes,
  handleExportRoutes,
  handleImportRoutes,
  handleSystemVirtualFolderRoutes,
  handlePluginSettingsRoutes,
  handleVersionRoutes,
  handleDatabaseRoutes,
  handleLogsRoutes,
  handleSecurityRoutes,
};

export async function handleSystemRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const namespace = segments[0];
  switch (namespace) {
    case "widgets":
      return handleWidgetRoutes(event, cms, tenantId, segments);
    case "system": {
      const action = segments[1] || event.url.searchParams.get("action");
      // `/api/system/ai/...` alias for the AI namespace (`/api/ai/...`).
      if (action === "ai") {
        return handleAiRoutes(event, cms, tenantId, segments.slice(1));
      }
      if (action === "health") {
        return handleHealthRoutes(event, cms, tenantId, segments);
      }
      if (action === "version") {
        return handleVersionRoutes(event, cms, tenantId, segments.slice(1));
      }
      if (action === "hot-collections" && event.request.method === "GET") {
        const { getHotCollections } = await import("@src/services/intelligence/behavioral-learner");
        const hot = getHotCollections(tenantId ?? "global", 20);
        return successResponse(
          event,
          hot.map((c) => c.id),
        );
      }
      if (action === "prewarm-route" && event.request.method === "GET") {
        const targetPath = event.url.searchParams.get("path") || "/dashboard";
        const { routeResourceStateMachine } =
          await import("@src/services/core/route-resource-state-machine");
        const prewarmUser = (event.locals?.user as { _id?: unknown; id?: unknown } | null) ?? null;
        routeResourceStateMachine
          .prewarmRouteResources(targetPath, event.url.origin, tenantId ?? "global", prewarmUser)
          .catch(() => {});
        routeResourceStateMachine
          .speculativePrewarm(targetPath, tenantId ?? "global", event.url.origin, prewarmUser)
          .catch(() => {});
        const spec = routeResourceStateMachine.classifyRouteSpec(targetPath);
        return successResponse(event, {
          path: targetPath,
          lane: spec.lane,
          requiredCacheCategories: spec.requiredCacheCategories,
        });
      }
      if (action === "penalize-bounce" && event.request.method === "POST") {
        const body = await event.request.json().catch(() => ({}));
        const { fromPath, toPath } = body;
        if (fromPath && toPath) {
          const { penalizeTransition } =
            await import("@src/services/intelligence/behavioral-learner");
          penalizeTransition(tenantId ?? "global", fromPath, toPath);
          return successResponse(event, { success: true });
        }
        return successResponse(event, { success: false, error: "Missing paths" }, 400);
      }
      return handleSystemMgmtRoutes(event, cms, tenantId, segments);
    }
    case "metrics":
      return successResponse(
        event,
        await cms.telemetry.checkUpdateStatus({ tenantId: tenantId as any }),
      );
    case "telemetry":
      return handleTelemetryRoutes(event, cms, tenantId, segments);
    case "security":
      return handleSecurityRoutes(event, cms, tenantId, segments);
  }

  throw new AppError(`System endpoint /api/${segments.join("/")} not implemented`, 404);
}
