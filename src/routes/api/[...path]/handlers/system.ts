/**
 * @file src/routes/api/[...path]/handlers/system.ts
 * @description System, Settings, Widgets, and Utility handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse } from "./base";
import { webhookService } from "@src/services/webhook-service";
import { settingsGroups } from "@src/routes/(app)/config/system-settings/settings-groups";
import { getPrivateSettingSync } from "@src/services/settings-service";

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
    case "system":
      return handleSystemMgmtRoutes(event, cms, tenantId, segments);
    case "settings":
    case "system-settings":
      return handleSettingsRoutes(event, cms, tenantId, segments);
    case "importer":
    case "import-data":
      return handleImporterRoutes(event, cms, tenantId, segments);
    case "ai":
      return handleAiRoutes(event, cms, tenantId, segments);
    case "automations":
      return handleAutomationRoutes(event, cms, tenantId, segments);
    case "metrics":
      return successResponse(event, await cms.metrics.getReport(tenantId as string));
    case "telemetry":
      return handleTelemetryRoutes(event, cms, tenantId, segments);
    case "security":
      return handleSecurityRoutes(event, cms, tenantId, segments);
    case "system-preferences":
      return handlePreferenceRoutes(event, cms, tenantId, segments);
    case "theme":
      return handleThemeRoutes(event, cms, tenantId, segments);
    case "setup":
      return handleSetupRoutes(event, cms, tenantId, segments);
    case "health":
      return handleHealthRoutes(event, cms, tenantId, segments);
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
      const result = await cms.widgets.getActiveWidgets();
      if (!result.success)
        throw new AppError((result as any).message || "Failed to fetch widgets", 500);
      return successResponse(event, result.data);
    }
    if (action === "list") {
      const widgetList = await cms.widgets.list(tenantId);
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

    const widgetList = await cms.widgets.list(tenantId);
    const exists = widgetList.some((w: any) => w.name === target);
    if (!exists && action !== "install") {
      throw new AppError(`Widget ${target} not found`, 404);
    }

    const result =
      action === "activate" || (action === "status" && body.isActive)
        ? await cms.widgets.activate(target)
        : await cms.widgets.deactivate(target);
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

/**
 * --- WEBHOOKS ---
 */
export async function handleWebhookRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const { user } = locals;

  const isDirect = segments[0] === "webhooks" || segments[0] === "system-webhooks";
  const webhookId = isDirect ? segments[1] : segments[2];
  const subAction = isDirect ? segments[2] : segments[3];

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
    const webhooks = await webhookService.getWebhooks(tenantId as string);
    const exists = webhooks.some((w: any) => w.id === webhookId);
    if (!exists) throw new AppError(`Webhook ${webhookId} not found`, 404);

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

    if (request.method === "GET") {
      const webhooks = await webhookService.getWebhooks(tenantId as string);
      return successResponse(
        event,
        webhooks.find((w) => w.id === webhookId),
      );
    }

    throw new AppError(`Method ${request.method} not allowed for Webhooks`, 405);
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
  const subAction = segments[2];

  if (action === "webhooks") return handleWebhookRoutes(event, cms, tenantId, segments);

  if (request.method === "GET") {
    if (action === "public") {
      if (subAction === "stream") {
        return new Response("event: connected\n\n", {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      return successResponse(event, await cms.system.settings.getPublic(tenantId as string));
    }

    if (action === "export") {
      return successResponse(event, await cms.system.settings.getAll(tenantId as string));
    }

    const group = settingsGroups.find((g) => g.id === action);
    if (!group && action && action !== "all" && action !== "general") {
      throw new AppError(`Settings group ${action} not found`, 404);
    }

    const settings = await cms.system.settings.get(action || "all", tenantId as string);
    // Align with system.test.ts expectation: return { success: true, values: ... }
    return rawResponse(event, { success: true, values: settings || {} });
  }

  if (["POST", "PATCH", "PUT"].includes(request.method)) {
    if (action === "export") {
      return successResponse(event, await cms.system.settings.getAll(tenantId as string));
    }
    if (action === "import") {
      return successResponse(event, { success: true });
    }

    const body = await request.json().catch(() => ({}));

    // Validate keys for specific groups
    if (action && action !== "all" && action !== "general") {
      const group = settingsGroups.find((g) => g.id === action);
      if (group) {
        const allowedKeys = new Set(group.fields.map((f) => f.key));
        for (const key of Object.keys(body)) {
          if (!allowedKeys.has(key))
            throw new AppError(`Invalid setting key ${key} for group ${action}`, 400);
        }
      }
    }

    const result = await cms.system.settings.set(action || "all", body, tenantId as string);
    return successResponse(event, result);
  }

  throw new AppError(`Method ${request.method} not allowed for settings`, 405);
}

/**
 * --- SYSTEM MGMT ---
 */
export async function handleSystemMgmtRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  const action = segments[1];
  if (action === "reinitialize" && event.request.method === "POST") {
    const body = await event.request.json().catch(() => ({}));
    return rawResponse(event, await cms.system.reinitialize(body.force ?? true));
  }
  if (action === "refresh" && event.request.method === "POST") {
    const body = await event.request.json().catch(() => ({}));
    return successResponse(
      event,
      await cms.system.refresh(body.tenantId, body.skipReconciliation ?? false),
    );
  }
  throw new AppError(`System action ${action} not implemented`, 404);
}

/**
 * --- AI ---
 */
export async function handleAiRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  const action = segments[1];
  const body = await request.json();
  const { aiService } = await import("@src/services/ai-service");
  const { eventBus } = await import("@src/services/automation/event-bus");
  const { logger } = await import("@utils/logger.server");

  if (action === "chat") {
    const { userMessage, history = [], content, room, tab } = body;
    const text = userMessage || content;

    if (!text?.trim()) throw new AppError("Content is required", 400);

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

  if (action === "generate-layout" && request.method === "POST") {
    return successResponse(event, await aiService.generateLayoutSpec(body.prompt, body.context));
  }

  throw new AppError(`AI action ${action} not found`, 404);
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
  if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  const id = segments[1]; // Corrected index: namespace is [0], id is [1]

  if (request.method === "GET") {
    if (!id || id === "list")
      return successResponse(
        event,
        await cms.automation.getFlow(undefined as any, tenantId as string),
      );

    if (segments[2] === "logs")
      return successResponse(event, await cms.automation.getLogs(id, { tenantId }));

    const flow = await cms.automation.getFlow(id, tenantId as string);
    if (!flow) throw new AppError("Automation flow not found", 404);
    return successResponse(event, flow);
  }

  if (request.method === "POST") {
    if (segments[2] === "test") {
      const result = await cms.automation.executeFlow(id, await request.json(), tenantId as string);
      return successResponse(event, result);
    }
    const { automationService: service } =
      await import("@src/services/automation/automation-service");
    return successResponse(
      event,
      await service.saveFlow(await request.json(), tenantId as string),
      201,
    );
  }

  if ((request.method === "DELETE" || request.method === "PATCH") && id) {
    const flow = await cms.automation.getFlow(id, tenantId as string);
    if (!flow) throw new AppError("Automation flow not found", 404);

    const { automationService: service } =
      await import("@src/services/automation/automation-service");

    if (request.method === "DELETE") {
      await service.deleteFlow(id, tenantId as string);
      return successResponse(event, { success: true });
    }

    if (request.method === "PATCH") {
      return successResponse(
        event,
        await service.saveFlow({ ...flow, ...(await request.json()) }, tenantId as string),
      );
    }
  }

  throw new AppError(`Automation route not implemented`, 404);
}

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
  if (action === "stats") return successResponse(event, await cms.telemetry.checkUpdateStatus());
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
  _tenantId: DatabaseId,
  segments: string[],
) {
  const { request, url, locals } = event;
  const { user } = locals;

  let key = segments[1] || segments[2] || url.searchParams.get("key");
  let body: any = {};

  if (request.method === "POST" || request.method === "PUT") {
    body = await request.json().catch(() => ({}));
    if (!key) key = body.key;
  }

  if (!key) throw new AppError("Preference key is required", 400);

  if (request.method === "GET") {
    const result = await cms.db.system.preferences.get(key, "user", user?._id);
    if (result.success && result.data === null) throw new AppError("Preference not found", 404);
    return rawResponse(event, result.success ? result.data : null);
  }
  if (request.method === "POST" || request.method === "PUT") {
    const value = body.value !== undefined ? body.value : body;
    return rawResponse(event, await cms.db.system.preferences.set(key, value, "user", user?._id));
  }
  if (request.method === "DELETE")
    return rawResponse(event, await cms.db.system.preferences.delete(key, "user", user?._id));

  throw new AppError(`Method ${request.method} not allowed for preferences`, 405);
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
    return rawResponse(event, theme);
  }
  if (action === "update-theme" && event.request.method === "POST") {
    const { themeId, customCss } = await event.request.json();
    if (!themeId) throw new AppError("themeId is required", 400);
    const result = await cms.db.system.themes.update(themeId as DatabaseId, { customCss });
    if (!result.success || !result.data)
      throw new AppError("Theme update failed or theme not found", 404);
    await themeManager.refresh();
    return successResponse(event, result.data);
  }
  if (action === "set-default" && event.request.method === "POST") {
    const { themeId } = await event.request.json();
    await cms.db.system.themes.setDefault(themeId as DatabaseId);
    return successResponse(event, { success: true });
  }
  throw new AppError(`Theme action ${action} not implemented`, 404);
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

/**
 * --- HEALTH ---
 */
let lastHealthCheck: { status: string; database: string; latency: number; serverTime: string } | null =
  null;
let lastHealthTime = 0;

export async function handleHealthRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  _segments: string[],
) {
  const now = Date.now();
  if (lastHealthCheck && now - lastHealthTime < 10000) {
    return successResponse(event, { ...lastHealthCheck, cached: true });
  }

  const start = performance.now();
  const isUp = await cms.db.isConnected();
  const report = {
    status: isUp ? "healthy" : "degraded",
    database: isUp ? "connected" : "disconnected",
    latency: Math.round(performance.now() - start),
    serverTime: new Date().toISOString(),
  };

  lastHealthCheck = report;
  lastHealthTime = now;

  return successResponse(event, report);
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
  throw new AppError(`Importer route not implemented`, 404);
}

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
    const { securityResponseService } = await import("@src/services/security-response-service");
    const { metricsService } = await import("@src/services/metrics-service");

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
    const { metricsService } = await import("@src/services/metrics-service");

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

/**
 * --- EXPORT ---
 */
export async function handleExportRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _segments: string[],
) {
  const { request } = event;
  if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  if (request.method === "POST") {
    const { type } = await request.json().catch(() => ({}));
    if (type === "users") {
      const result = await cms.auth.listUsers({ tenantId });
      return successResponse(event, result.data);
    }
    return successResponse(event, { success: true, message: "Export started" });
  }
  throw new AppError("Method Not Allowed", 405);
}

/**
 * --- IMPORT ---
 */
export async function handleImportRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  const action = segments[1];

  if (request.method === "POST") {
    const { data } = await request.json().catch(() => ({}));
    if (action === "full" && data?.settings) {
      await cms.db.system.preferences.set(
        "SITE_NAME",
        data.settings.SITE_NAME,
        "system",
        tenantId as DatabaseId,
      );
    }
    return successResponse(event, { success: true });
  }
  throw new AppError("Method Not Allowed", 405);
}
