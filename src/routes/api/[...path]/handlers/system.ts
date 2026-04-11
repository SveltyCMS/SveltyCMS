/**
 * @file src/routes/api/[...path]/handlers/system.ts
 * @description System, Settings, Widgets, and Utility handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
// Removed unused json import
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse } from "./base";
// Removed unused settingsGroups import
import { webhookService } from "@src/services/webhook-service";

export async function handleSystemRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  namespace: string,
  segments: string[],
) {
  switch (namespace) {
    case "widgets":
      return handleWidgetRoutes(event, cms, tenantId, segments);
    case "system":
      return handleSystemMgmtRoutes(event, cms, segments);
    case "settings":
    case "system-settings":
      return handleSettingsRoutes(event, cms, tenantId, segments);
    case "importer":
    case "import-data":
      return handleImporterRoutes(event, cms, tenantId, segments);
    case "ai":
      return handleAiRoutes(event, tenantId, segments);
    case "automations":
      return handleAutomationRoutes(event, cms, tenantId, segments);
    case "metrics":
      return successResponse(event, await cms.metrics.getReport());
    case "telemetry":
      return handleTelemetryRoutes(event, cms, segments);
    case "system-preferences":
      return handlePreferenceRoutes(event, cms, segments);
    case "theme":
      return handleThemeRoutes(event, cms, tenantId, segments);
    case "setup":
      return handleSetupRoutes(event, cms, tenantId, segments);
    case "health":
      return handleHealthRoutes(event, cms, tenantId);
  }

  throw new AppError(`System endpoint /api/${segments.join("/")} not implemented`, 404);
}

/**
 * --- WIDGETS ---
 */
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
      const widgetList = await cms.widgets.list(tenantId);
      return successResponse(
        event,
        widgetList.filter((w: any) => w.isActive),
      );
    }
    if (action === "list") {
      const widgetList = await cms.widgets.list(tenantId);
      return successResponse(event, { widgets: widgetList, tenantId });
    }
  }

  if (request.method === "POST" && (action === "activate" || action === "deactivate")) {
    const target = widgetId || (await request.json()).widgetId;
    if (!target) throw new AppError("widgetId is required", 400);
    const result =
      action === "activate"
        ? await cms.widgets.activate(target)
        : await cms.widgets.deactivate(target);
    return successResponse(event, result);
  }
}

/**
 * --- WEBHOOKS ---
 */
export async function handleWebhookRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  _namespace: string,
  segments: string[],
) {
  const { request, locals } = event;
  const { user } = locals;
  const action = segments[1];

  if (action === "webhooks") {
    const webhookId = segments[2];
    const subAction = segments[3];

    if (!webhookId) {
      if (request.method === "GET")
        return successResponse(event, await webhookService.getWebhooks(tenantId as string));
      if (request.method === "POST")
        return successResponse(
          event,
          await webhookService.saveWebhook(await request.json(), tenantId as string),
          201,
        );
    } else {
      if (subAction === "test" && request.method === "POST")
        return successResponse(event, {
          success: await webhookService.testWebhook(
            webhookId,
            user?.email || "system@sveltycms.com",
            tenantId as string,
          ),
        });
      if (request.method === "PATCH" || request.method === "PUT")
        return successResponse(
          event,
          await webhookService.saveWebhook(
            { ...(await request.json()), id: webhookId },
            tenantId as string,
          ),
        );
      if (request.method === "DELETE") {
        await webhookService.deleteWebhook(webhookId, tenantId as string);
        return successResponse(event, { success: true });
      }
    }
  }
}

/**
 * --- SETTINGS ---
 */
export async function handleSettingsRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  const action = segments[1];

  if (action === "webhooks") return handleWebhookRoutes(event, cms, tenantId, "settings", segments);

  if (request.method === "GET") {
    if (action === "public")
      return successResponse(event, await cms.system.settings.getPublic(tenantId as string));
    return successResponse(
      event,
      await cms.system.settings.get(action || "all", tenantId as string),
    );
  }
  if (request.method === "POST" || request.method === "PATCH") {
    return successResponse(
      event,
      await cms.system.settings.set(action || "all", await request.json(), tenantId as string),
    );
  }
}

/**
 * --- SYSTEM MGMT ---
 */
export async function handleSystemMgmtRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  segments: string[],
) {
  const action = segments[1];
  if (action === "reinitialize" && event.request.method === "POST") {
    const body = await event.request.json().catch(() => ({}));
    return rawResponse(event, await cms.system.reinitialize(body.force ?? true));
  }
}

/**
 * --- AI ---
 */
export async function handleAiRoutes(
  event: RequestEvent,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const action = segments[1];
  const body = await request.json();
  const { aiService } = await import("@src/services/ai-service");
  const { eventBus } = await import("@src/services/automation/event-bus");
  const { logger } = await import("@utils/logger.server");

  if (action === "chat") {
    const { userMessage, history = [], content, room, tab } = body;
    const text = userMessage || content;

    if (!text?.trim()) throw new AppError("Content is required", 400);

    // Legacy Chat Logic: Dispatch to EventBus and process in background
    const userPayload = locals.user
      ? {
          id: locals.user._id.toString(),
          username: locals.user.username,
          email: locals.user.email,
          avatar: locals.user.avatar,
        }
      : { id: "guest", username: "Guest" };

    eventBus.emit("chat:message", {
      user: userPayload,
      data: { text, room: room || null, tab: tab || "chat" },
      tenantId,
    });

    if (!room) {
      // Async IIFE for AI background response
      (async () => {
        try {
          const aiResponse = await aiService.chat(text, history);
          eventBus.emit("ai:response", {
            user: { _id: "ai", username: "SveltyAgent" },
            data: { text: aiResponse, done: true },
            tenantId,
          });
        } catch (err) {
          logger.error("RTC: AI Inference failed:", err);
        }
      })();
    }
    return successResponse(event, { success: true });
  }

  if (action === "enrich")
    return successResponse(
      event,
      await aiService.enrichText(body.text, body.action, body.language),
    );
}

/**
 * --- AUTOMATION ---
 */
export async function handleAutomationRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  const id = segments[2];

  if (request.method === "GET") {
    if (!id || id === "list")
      return successResponse(
        event,
        await cms.automation.getFlow(undefined as any, tenantId as string),
      ); // LocalCMS should support list if needed, or we call service directly if missing
    if (segments[3] === "logs")
      return successResponse(event, await cms.automation.getLogs(id, { tenantId }));
    return successResponse(event, await cms.automation.getFlow(id, tenantId as string));
  }

  if (request.method === "POST") {
    if (segments[3] === "test") {
      const result = await cms.automation.executeFlow(id, await request.json(), tenantId as string);
      return successResponse(event, result);
    }
    // For saving/deleting flows, we currently use automationService directly or we should add them to the namespace
    const { automationService: service } =
      await import("@src/services/automation/automation-service");
    return successResponse(
      event,
      await service.saveFlow(await request.json(), tenantId as string),
      201,
    );
  }

  if (request.method === "DELETE" && id) {
    const { automationService: service } =
      await import("@src/services/automation/automation-service");
    await service.deleteFlow(id, tenantId as string);
    return successResponse(event, { success: true });
  }
}

/**
 * --- TELEMETRY ---
 */
export async function handleTelemetryRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _segments: string[],
) {
  const action = _segments[1];
  if (action === "stats") return successResponse(event, await cms.telemetry.checkUpdateStatus());
  if (action === "report" && event.request.method === "POST") {
    // telemetry report is handled by checkUpdateStatus which sends current stats.
    // we return success if it's called.
    return successResponse(event, { success: true });
  }
}

/**
 * --- PREFERENCES ---
 */
export async function handlePreferenceRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;
  const key = _segments[1] || _segments[2] || url.searchParams.get("key");
  if (!key) throw new AppError("Preference key is required", 400);

  if (request.method === "GET")
    return rawResponse(event, await cms.db.system.preferences.get(key, "user", user?._id));
  if (request.method === "POST" || request.method === "PUT")
    return rawResponse(
      event,
      await cms.db.system.preferences.set(key, (await request.json()).value, "user", user?._id),
    );
  if (request.method === "DELETE")
    return rawResponse(event, await cms.db.system.preferences.delete(key, "user", user?._id));
}

/**
 * --- THEME ---
 */
export async function handleThemeRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const action = segments[1];
  const { ThemeManager } = await import("@src/databases/theme-manager");
  const themeManager = ThemeManager.getInstance();

  if (action === "get-current-theme" && event.request.method === "GET") {
    const theme = await themeManager.getTheme(tenantId);
    if (!theme) throw new AppError("No active theme found.", 404);
    return successResponse(event, theme);
  }
  if (action === "update-theme" && event.request.method === "POST") {
    const { themeId, customCss } = await event.request.json();
    const result = await cms.db.system.themes.update(themeId as DatabaseId, { customCss });
    await themeManager.refresh();
    const resultData = result.success ? result.data : null;
    return successResponse(event, { success: true, theme: resultData });
  }
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
}

/**
 * --- HEALTH ---
 */
export async function handleHealthRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
) {
  const start = performance.now();
  const isUp = await cms.db.isConnected();
  return successResponse(event, {
    status: isUp ? "healthy" : "degraded",
    database: isUp ? "connected" : "disconnected",
    latency: Math.round(performance.now() - start),
    serverTime: new Date().toISOString(),
  });
}

/**
 * --- IMPORTER ---
 */
export async function handleImporterRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const action = segments[1];
  const { request, locals } = event;
  const { user } = locals;

  if (request.method === "POST") {
    const body = await request.json();
    if (action === "external")
      return successResponse(event, await cms.system.importer.importExternal(body, user, tenantId));
    if (action === "scaffold")
      return successResponse(event, await cms.system.importer.scaffold(body));
    return successResponse(event, await cms.system.importer.importData(body, tenantId));
  }
}
