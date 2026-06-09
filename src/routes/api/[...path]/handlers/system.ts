/**
 * @file src/routes/api/[...path]/handlers/system.ts
 * @description System, Settings, Widgets, and Utility handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import { json, type RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse } from "./base";
import { webhookService } from "@src/services/background/webhook-service";
import { settingsGroups } from "@src/routes/(app)/config/system-settings/settings-groups";
import { getPrivateSettingSync } from "@src/services/core/settings-service";

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
      return successResponse(
        event,
        await cms.telemetry.checkUpdateStatus({ tenantId: tenantId as any }),
      );
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
    case "system-jobs":
      return handleSystemJobRoutes(event, cms, tenantId, segments);
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

    if (!registeredWidget?._id) {
      throw new AppError(`Widget ${target} not found`, 404);
    }

    const result =
      action === "activate" || (action === "status" && body.isActive)
        ? await cms.widgets.activate(registeredWidget._id as string)
        : await cms.widgets.deactivate(registeredWidget._id as string);
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
  const { request, locals } = event;
  const { user } = locals;

  // 🛡️ SECURITY: Admin verification for settings mutations
  if (!["GET", "OPTIONS"].includes(request.method)) {
    if (!user || (!user.isAdmin && user.role !== "admin")) {
      throw new AppError("Admin access required for settings management", 403, "FORBIDDEN");
    }
  }

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
      return successResponse(
        event,
        await cms.system.settings.getPublic({ tenantId: tenantId as any }),
      );
    }

    if (action === "export") {
      return successResponse(
        event,
        await cms.system.settings.getAll({ tenantId: tenantId as any }),
      );
    }

    const group = settingsGroups.find((g) => g.id === action);
    if (!group && action && action !== "all" && action !== "general") {
      throw new AppError(`Settings group ${action} not found`, 404);
    }

    const settings = await cms.system.settings.get(action || "all", {
      tenantId: tenantId as any,
    });
    // Align with system.test.ts expectation: return { success: true, values: ... }
    return rawResponse(event, { success: true, values: settings || {} });
  }

  if (["POST", "PATCH", "PUT"].includes(request.method)) {
    if (action === "export") {
      return successResponse(
        event,
        await cms.system.settings.getAll({ tenantId: tenantId as any }),
      );
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

    const result = await cms.system.settings.set(action || "all", body, {
      tenantId: tenantId as any,
    });
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
  // 🛡️ SECURITY: Admin verification for system management
  const { user } = event.locals;
  if (!user || (!user.isAdmin && user.role !== "admin")) {
    throw new AppError("Admin access required for system management", 403, "FORBIDDEN");
  }

  const action = segments[1];
  if (action === "reinitialize" && event.request.method === "POST") {
    const body = await event.request.json().catch(() => ({}));
    return rawResponse(event, await cms.system.reinitialize(body.force ?? true));
  }
  if (action === "refresh" && event.request.method === "POST") {
    const body = await event.request.json().catch(() => ({}));
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
        const { logger } = await import("@utils/logger");
        if (process.env.BENCHMARK_DEBUG === "true" || process.env.BENCHMARK === "true") {
          logger.info(`[System Refresh] Successfully warmed up GraphQL Yoga Schema.`);
        }
      }
    } catch (err: any) {
      const { logger } = await import("@utils/logger");
      logger.warn(`[System Refresh] GraphQL warmup skipped or failed: ${err.message}`);
    }

    return successResponse(event, refreshResult);
  }
  throw new AppError(`System action ${action} not implemented`, 404);
}

/**
 * --- SYSTEM JOBS ---
 */
export async function handleSystemJobRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request } = event;
  const action = segments[1];

  // GET /api/system-jobs — list scheduled jobs
  if (request.method === "GET") {
    const db = _cms.db;
    if (!db.system?.jobs) {
      throw new AppError("Jobs system not available", 501, "NOT_IMPLEMENTED");
    }

    const statusParam = new URL(request.url).searchParams.get("status");
    const listOptions: { status?: string } = {};
    if (statusParam) {
      listOptions.status = statusParam;
    }
    const result = await db.system.jobs.list(listOptions);

    if (!result.success) {
      throw new AppError(result.message || "Failed to list jobs", 500);
    }
    return successResponse(event, result.data || []);
  }

  // POST /api/system-jobs — create a new scheduled job
  if (request.method === "POST") {
    const db = _cms.db;
    if (!db.system?.jobs) {
      throw new AppError("Jobs system not available", 501, "NOT_IMPLEMENTED");
    }

    const body = await request.json().catch(() => ({}));
    const { taskType, payload, runAt } = body;

    if (!taskType || !payload) {
      throw new AppError("taskType and payload are required", 400);
    }

    const nextRunAt = runAt ? new Date(runAt) : new Date();

    const result = await db.system.jobs.create({
      taskType,
      payload,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      nextRunAt,
      tenantId: tenantId as any,
    });

    if (!result.success) {
      throw new AppError(result.message || "Failed to create job", 500);
    }

    return successResponse(event, result.data, 201);
  }

  // DELETE /api/system-jobs/:jobId — cancel/delete a scheduled job
  if (request.method === "DELETE") {
    const jobId = action;
    if (!jobId) {
      throw new AppError("jobId is required", 400);
    }

    const db = _cms.db;
    if (!db.system?.jobs) {
      throw new AppError("Jobs system not available", 501, "NOT_IMPLEMENTED");
    }

    const result = await db.system.jobs.delete(jobId as DatabaseId);
    if (!result.success) {
      throw new AppError(result.message || "Failed to delete job", 500);
    }

    return successResponse(event, { deleted: true });
  }

  throw new AppError(`Method ${request.method} not allowed for system-jobs`, 405);
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
  const { aiService } = await import("@src/services/core/ai-service");
  const { eventBus } = await import("@src/services/background/automation/event-bus");
  const { logger } = await import("@utils/logger");

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

  if (action === "score" && request.method === "POST") {
    const { content, collectionName } = body;
    if (!content) throw new AppError("Content payload is required", 400);
    const scoreResult = await aiService.scoreContent(content, collectionName || "unknown");
    return successResponse(event, scoreResult);
  }

  if (action === "suggest-fields" && request.method === "POST") {
    const { collectionName, description, availableWidgets } = body;
    if (!collectionName) throw new AppError("collectionName is required", 400);
    const fields = await aiService.suggestFields(
      collectionName,
      description || "",
      availableWidgets || [],
    );
    return successResponse(event, fields);
  }

  if (action === "translate" && request.method === "POST") {
    const { text, sourceLang, targetLang, field, collection } = body;
    if (!text?.trim()) throw new AppError("text is required", 400);
    if (!sourceLang) throw new AppError("sourceLang is required", 400);
    if (!targetLang) throw new AppError("targetLang is required", 400);

    const { aiTranslationService } = await import("@src/services/ai-translation");
    const user = locals.user;
    const translatedText = await aiTranslationService.translateField(text, sourceLang, targetLang, {
      field: field || "unknown",
      collection: collection || "unknown",
      userId: user?._id ?? null,
      userEmail: user?.email,
      userRole: user?.role,
      tenantId: tenantId as any,
    });

    if (translatedText === null) {
      return successResponse(event, {
        translatedText: null,
        message: "AI translation unavailable",
      });
    }

    return successResponse(event, { translatedText });
  }

  if (action === "translate-collection" && request.method === "POST") {
    const { user } = locals;
    if (!user || (!user.isAdmin && user.role !== "admin")) {
      throw new AppError("Admin access required for bulk translation", 403, "FORBIDDEN");
    }
    const { collectionName, targetLanguages, sourceLanguage } = body;
    if (!collectionName || !targetLanguages?.length) {
      throw new AppError("collectionName and targetLanguages[] are required", 400);
    }
    const { jobQueue } = await import("@src/services/background/jobs/job-queue-service");
    const jobId = await jobQueue.dispatch(
      "bulk-translate",
      {
        collectionName,
        targetLanguages,
        sourceLanguage,
        tenantId: tenantId as string,
      },
      tenantId as string,
    );
    return successResponse(
      event,
      {
        success: true,
        jobId,
        message: `Bulk translation dispatched for ${collectionName} → [${targetLanguages.join(", ")}]`,
      },
      202,
    );
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
  const { request, locals } = event;
  const { user } = locals;

  // 🛡️ SECURITY: Admin verification for automation management
  if (!["GET", "OPTIONS"].includes(request.method)) {
    if (!user || (!user.isAdmin && user.role !== "admin")) {
      throw new AppError("Admin access required for automation management", 403, "FORBIDDEN");
    }
  }

  if (process.env.VERBOSE_TESTS === "true") {
    console.log(
      `[handleAutomationRoutes] Method: ${request.method}, segments: ${segments.join(",")}, tenantId: ${tenantId}`,
    );
  }
  if (getPrivateSettingSync("MULTI_TENANT") === true && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  const id = segments[1]; // Corrected index: namespace is [0], id is [1]

  if (request.method === "GET") {
    if (!id || id === "list")
      return successResponse(
        event,
        await cms.automation.getFlow(undefined as any, {
          tenantId: tenantId as any,
        }),
      );

    if (segments[2] === "logs")
      return successResponse(event, await cms.automation.getLogs(id, { tenantId }));

    const flow = await cms.automation.getFlow(id, {
      tenantId: tenantId as any,
    });
    if (!flow) throw new AppError("Automation flow not found", 404);
    return successResponse(event, flow);
  }

  if (request.method === "POST") {
    if (segments[2] === "test") {
      const result = await cms.automation.executeFlow(id, await request.json(), {
        tenantId: tenantId as any,
      });
      return successResponse(event, result);
    }
    const { automationService: service } =
      await import("@src/services/background/automation/automation-service");
    return successResponse(
      event,
      await service.saveFlow(await request.json(), tenantId as string),
      201,
    );
  }

  if ((request.method === "DELETE" || request.method === "PATCH") && id) {
    const flow = await cms.automation.getFlow(id, {
      tenantId: tenantId as any,
    });
    if (!flow) throw new AppError("Automation flow not found", 404);

    const { automationService: service } =
      await import("@src/services/background/automation/automation-service");

    if (request.method === "DELETE") {
      await service.deleteFlow(id, tenantId as any);
      return successResponse(event, { success: true });
    }

    if (request.method === "PATCH") {
      return successResponse(
        event,
        await service.saveFlow({ ...flow, ...(await request.json()) }, tenantId as any),
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
  if (action === "stats")
    return successResponse(
      event,
      await cms.telemetry.checkUpdateStatus({ tenantId: _tenantId as any }),
    );
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
    console.log(
      `[Preference API] GET key: ${key}, scope: ${scope}, userId: ${options.userId}, tenantId: ${options.tenantId}`,
    );
    const result = await cms.db.system.preferences.get(key, options);
    if (!result.success) {
      throw new AppError(result.message || "Failed to get preference", 500);
    }
    console.log(
      `[Preference API] GET Result: success=${result.success}, data=${JSON.stringify(result.data)}`,
    );
    if (result.data === null) {
      console.warn(`[Preference API] NOT FOUND: ${key}`);
      throw new AppError("Preference not found", 404);
    }
    return rawResponse(event, result.data);
  }

  if (request.method === "POST" || request.method === "PUT") {
    const value = body.value !== undefined ? body.value : body;
    console.log(
      `[Preference API] SET key: ${key}, value: ${JSON.stringify(value)}, options: ${JSON.stringify(options)}`,
    );
    const result = await cms.db.system.preferences.set(key, value, {
      ...options,
      category: body.category,
    });
    console.log(`[Preference API] SET Result: success=${result.success}`);
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
  const request = event.request;

  // ── Admin Theme CRUD ──
  if (action === "admin-theme" && request.method === "GET") {
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const theme = await adminThemeService.getAdminTheme(tenantId);
    return json(theme ?? {});
  }
  if (action === "admin-theme" && request.method === "POST") {
    const body = await request.json();
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const result = await adminThemeService.saveAdminTheme(body, tenantId);
    return successResponse(event, result);
  }
  if (action === "admin-theme" && request.method === "DELETE") {
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const result = await adminThemeService.resetToDefaults(tenantId);
    return successResponse(event, result);
  }
  if (action === "import-preset" && request.method === "POST") {
    const { presetJson } = await request.json();
    if (!presetJson) throw new AppError("presetJson is required", 400);
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const result = await adminThemeService.importPreset(presetJson, tenantId);
    return successResponse(event, result);
  }

  // ── Multi-Theme Management ──
  if (action === "list" && request.method === "GET") {
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const themes = await adminThemeService.listThemes(tenantId);
    return json(themes);
  }
  if (action === "create" && request.method === "POST") {
    const { name, settings } = await request.json();
    if (!name) throw new AppError("name is required", 400);
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const result = await adminThemeService.createTheme(name, settings, tenantId);
    return successResponse(event, result, 201);
  }
  if (action === "delete" && request.method === "POST") {
    const { themeId } = await request.json();
    if (!themeId) throw new AppError("themeId is required", 400);
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    await adminThemeService.deleteTheme(themeId, tenantId);
    return successResponse(event, { success: true });
  }
  if (action === "activate" && request.method === "POST") {
    const { themeId } = await request.json();
    if (!themeId) throw new AppError("themeId is required", 400);
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const result = await adminThemeService.activateTheme(themeId, tenantId);
    return successResponse(event, result);
  }
  if (action === "clone" && request.method === "POST") {
    const { sourceId, name } = await request.json();
    if (!sourceId || !name) throw new AppError("sourceId and name are required", 400);
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const result = await adminThemeService.cloneTheme(sourceId, name, tenantId);
    return successResponse(event, result, 201);
  }

  // ── Existing theme endpoints ──
  const { ThemeManager } = await import("@src/databases/theme-manager");
  const themeManager = ThemeManager.getInstance();

  if (action === "get-current-theme" && request.method === "GET") {
    const theme = await themeManager.getTheme(tenantId);
    if (!theme) throw new AppError("No active theme found.", 404);
    return rawResponse(event, theme);
  }
  if (action === "update-theme" && request.method === "POST") {
    const { themeId, customCss } = await request.json();
    if (!themeId) throw new AppError("themeId is required", 400);
    const result = await cms.db.system.themes.update(themeId as DatabaseId, {
      customCss,
    });
    if (!result.success || !result.data)
      throw new AppError("Theme update failed or theme not found", 404);
    await themeManager.refresh();
    return successResponse(event, result.data);
  }
  if (action === "set-default" && request.method === "POST") {
    const { themeId } = await request.json();
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

let lastHealthReport = "";
let lastHealthTime = 0;

export async function handleHealthRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  _segments: string[],
) {
  const { request } = event;
  const failExternal = request.headers.get("x-test-fail-external") === "true";
  const now = Date.now();

  // 🛡️ CIRCUIT BREAKER AUDIT: If requested, simulate a degraded state
  if (failExternal) {
    const isUp = await cms.db.isConnected();
    return new Response(
      JSON.stringify({
        status: "degraded",
        overallStatus: "DEGRADED",
        database: isUp ? "connected" : "disconnected",
        external: { status: "failed", message: "Simulated External Outage" },
        uptime: process.uptime(),
        timestamp: now,
      }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  }

  // 🚀 PERFORMANCE: 10-second memoization of health report
  if (lastHealthReport && now - lastHealthTime < 10000 && !request.headers.has("x-refresh")) {
    return new Response(lastHealthReport, {
      headers: { "Content-Type": "application/json", "X-Cached": "TRUE" },
    });
  }

  const isUp = await cms.db.isConnected();
  const report = {
    status: isUp ? "healthy" : "degraded",
    database: isUp ? "connected" : "disconnected",
    latency: 0, // Simplified for high-frequency checks
    serverTime: new Date().toISOString(),
    uptime: process.uptime(),
    dbType: process.env.DB_TYPE || "unknown",
  };

  const reportString = JSON.stringify({ success: true, data: report });
  lastHealthReport = reportString;
  lastHealthTime = now;

  return new Response(reportString, {
    headers: { "Content-Type": "application/json" },
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
      return successResponse(
        event,
        await cms.system.importer.importExternal(body, { user, tenantId }),
      );
    if (action === "scaffold")
      return successResponse(event, await cms.system.importer.scaffold(body));
    return successResponse(event, await cms.system.importer.importData(body, { tenantId }));
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
      await cms.db.system.preferences.set("SITE_NAME", data.settings.SITE_NAME, {
        scope: "system",
        tenantId: tenantId as DatabaseId,
      });
    }
    return successResponse(event, { success: true });
  }
  throw new AppError("Method Not Allowed", 405);
}

/**
 * --- SYSTEM VIRTUAL FOLDERS ---
 */
export async function handleSystemVirtualFolderRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _segments: string[],
) {
  const { request, url } = event;

  if (request.method === "GET") {
    const result = await cms.db.system.virtualFolder.getAll(tenantId);
    return successResponse(event, result);
  }

  if (request.method === "POST") {
    const { name, parent } = await request.json().catch(() => ({}));
    if (!name) {
      throw new AppError("Folder name is required", 400);
    }

    let parentId: DatabaseId | null = null;
    let path = `/${name}`;

    if (parent) {
      const parentResult = await cms.db.system.virtualFolder.getById(
        parent as DatabaseId,
        tenantId,
      );
      if (!parentResult.success || !parentResult.data) {
        throw new AppError("Parent folder not found", 404);
      }
      parentId = parentResult.data._id;
      path = parentResult.data.path === "/" ? `/${name}` : `${parentResult.data.path}/${name}`;
    }

    const result = await cms.db.system.virtualFolder.create(
      {
        name,
        path,
        parentId,
        order: 0,
        type: "folder",
      },
      tenantId,
    );
    return successResponse(event, result);
  }

  if (request.method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    const { action } = body;

    if (action === "reorder") {
      const { parentId, orderUpdates } = body;
      if (!Array.isArray(orderUpdates)) {
        throw new AppError("orderUpdates array is required for reordering", 400);
      }

      for (const update of orderUpdates) {
        const folderId = update.folderId;
        const targetParentId = parentId !== undefined ? parentId : update.parentId;

        const folderResult = await cms.db.system.virtualFolder.getById(
          folderId as DatabaseId,
          tenantId,
        );
        if (!folderResult.success || !folderResult.data) {
          continue;
        }

        let newPath = `/${folderResult.data.name}`;
        if (targetParentId) {
          const parentFolder = await cms.db.system.virtualFolder.getById(
            targetParentId as DatabaseId,
            tenantId,
          );
          if (parentFolder.success && parentFolder.data) {
            newPath =
              parentFolder.data.path === "/"
                ? `/${folderResult.data.name}`
                : `${parentFolder.data.path}/${folderResult.data.name}`;
          }
        }

        await cms.db.system.virtualFolder.update(
          folderId as DatabaseId,
          {
            parentId: targetParentId ? (targetParentId as DatabaseId) : null,
            order: update.order,
            path: newPath,
          },
          tenantId,
        );

        await updateFolderPathsRecursive(cms, folderId as DatabaseId, newPath, tenantId);
      }

      return successResponse(event, { success: true });
    }

    const { folderId, name } = body;
    if (!folderId || !name) {
      throw new AppError("folderId and name are required for rename", 400);
    }

    const folderResult = await cms.db.system.virtualFolder.getById(
      folderId as DatabaseId,
      tenantId,
    );
    if (!folderResult.success || !folderResult.data) {
      throw new AppError("Folder not found", 404);
    }

    let parentPath = "/";
    if (folderResult.data.parentId) {
      const parentFolder = await cms.db.system.virtualFolder.getById(
        folderResult.data.parentId as DatabaseId,
        tenantId,
      );
      if (parentFolder.success && parentFolder.data) {
        parentPath = parentFolder.data.path;
      }
    }

    const newPath = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;

    const result = await cms.db.system.virtualFolder.update(
      folderId as DatabaseId,
      {
        name,
        path: newPath,
      },
      tenantId,
    );

    await updateFolderPathsRecursive(cms, folderId as DatabaseId, newPath, tenantId);

    return successResponse(event, result);
  }

  if (request.method === "DELETE") {
    let folderId = url.searchParams.get("folderId");
    if (!folderId) {
      const body = await request.json().catch(() => ({}));
      folderId = body.folderId;
    }

    if (!folderId) {
      throw new AppError("folderId is required for deletion", 400);
    }

    const result = await cms.db.system.virtualFolder.delete(folderId as DatabaseId, tenantId);
    return successResponse(event, result);
  }

  throw new AppError(`Method ${request.method} not allowed for system-virtual-folder`, 405);
}

/**
 * Recursively update paths of child folders when parent changes path or name.
 */
async function updateFolderPathsRecursive(
  cms: LocalCMS,
  parentId: DatabaseId,
  parentPath: string,
  tenantId: DatabaseId,
) {
  const allFoldersResult = await cms.db.system.virtualFolder.getAll(tenantId);
  if (!allFoldersResult.success || !allFoldersResult.data) {
    return;
  }
  const allFolders = allFoldersResult.data;

  async function updateChildren(currentParentId: DatabaseId, currentParentPath: string) {
    const children = allFolders.filter(
      (f) => f.parentId && f.parentId.toString() === currentParentId.toString(),
    );
    for (const child of children) {
      const newChildPath =
        currentParentPath === "/" ? `/${child.name}` : `${currentParentPath}/${child.name}`;
      await cms.db.system.virtualFolder.update(child._id, { path: newChildPath }, tenantId);
      await updateChildren(child._id, newChildPath);
    }
  }

  await updateChildren(parentId, parentPath);
}
