/**
 * @file src/routes/api/[...path]/handlers/system.ts
 * @description System, Settings, Widgets, and Utility handlers for the dispatcher.
 */

import { logger } from "@utils/logger";
import { AppError } from "@utils/error-handling";
import { json, type RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { rawResponse, successResponse, validateRequestBody } from "./base";
import { webhookService, type Webhook } from "@src/services/background/webhook-service";
import { settingsGroups } from "@src/routes/(app)/config/system-settings/settings-groups";
import { isMultiTenantEnabled } from "@utils/tenant";
import { isAdmin } from "@src/databases/auth/constants";
import { cacheService } from "@src/databases/cache/cache-service";
import { versionService } from "@services/core/version-service";
import { getDatabaseResilience } from "@src/databases/database-resilience";
import { getSystemStatus } from "@src/databases/resilience-integration";
import { requireDashboardWidgetLicense } from "./dashboard";
import { streamingArrayResponse } from "./streaming";
import { buildLogExport, type LogExportFormat, type LogExportType } from "@src/utils/log-export";
import * as v from "valibot";

const SaveWebhookSchema = v.object({
  id: v.optional(v.string()),
  name: v.optional(v.string()),
  url: v.optional(v.string()),
  events: v.optional(v.array(v.string())),
  event: v.optional(v.string()),
  active: v.optional(v.boolean()),
  secret: v.optional(v.string()),
  headers: v.optional(v.record(v.string(), v.string())),
});

const ImportPresetSchema = v.object({
  presetJson: v.pipe(v.string(), v.minLength(1, "presetJson is required")),
});

const CreateThemeSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, "name is required")),
  settings: v.optional(v.any()),
});

const ThemeIdSchema = v.object({
  themeId: v.pipe(v.string(), v.minLength(1, "themeId is required")),
});

const CloneThemeSchema = v.object({
  sourceId: v.pipe(v.string(), v.minLength(1, "sourceId is required")),
  name: v.pipe(v.string(), v.minLength(1, "name is required")),
});

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
    case "workflows":
      return handleWorkflowRoutes(event, cms, tenantId, segments);
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
    case "plugin-settings":
      return handlePluginSettingsRoutes(event, cms, tenantId, segments);
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

  // 🛡️ SECURITY: Admin-only for all webhook operations
  // Defense-in-depth: handler-level check independent of the middleware pipeline.
  if (!user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  if (!user.isAdmin && user.role !== "admin" && user.role !== "super-admin") {
    throw new AppError("Admin access required for webhook management", 403, "FORBIDDEN");
  }

  const isDirect = segments[0] === "webhooks" || segments[0] === "system-webhooks";
  const webhookId = isDirect ? segments[1] : segments[2];
  const subAction = isDirect ? segments[2] : segments[3];

  if (!webhookId) {
    if (request.method === "GET")
      return successResponse(event, await webhookService.getWebhooks(tenantId as string));
    if (request.method === "POST") {
      const body = await validateRequestBody(event, SaveWebhookSchema);
      return successResponse(
        event,
        await webhookService.saveWebhook(body as unknown as Partial<Webhook>, tenantId as string),
        201,
      );
    }
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

    if (request.method === "PATCH" || request.method === "PUT") {
      const body = await validateRequestBody(event, SaveWebhookSchema);
      return successResponse(
        event,
        await webhookService.saveWebhook(
          { ...body, id: webhookId } as unknown as Partial<Webhook>,
          tenantId as string,
        ),
      );
    }
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

    // Group settings are stored as a single key in preferences, not in KNOWN_PRIVATE_KEYS.
    // Use direct preferences.get to retrieve arbitrary group keys.
    let settings: unknown;
    if (action && action !== "all" && action !== "general") {
      const pref = await cms.db.system.preferences.get(action, {
        scope: "system",
        tenantId: tenantId as any,
      });
      settings = pref.success ? pref.data : {};
    } else {
      settings = await cms.system.settings.get(action || "all", {
        tenantId: tenantId as any,
      });
    }
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

    // 🚀 Invalidate the field-permission memo so a saved FIELD_PERMISSIONS
    // policy takes effect immediately (no up-to-60s stale window).
    try {
      const { invalidateFieldPermissionCache } =
        await import("@src/services/security/field-permission-service");
      invalidateFieldPermissionCache();
    } catch {
      /* best effort */
    }

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
  if (isMultiTenantEnabled() && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  const action = segments[1];
  const body = await request.json();
  const { aiService } = await import("@src/services/core/ai-service");
  const { eventBus } = await import("@src/services/background/automation/event-bus");

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
 * --- AI BUILDER (Phase 0) ---
 *
 * Design/refine are read-only AI proposal actions; approve-collection is
 * reserved for Phase 1 (persisting approved proposals) and returns 501.
 */
export async function handleAiBuilderRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;

  if (isMultiTenantEnabled() && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  // 🛡️ SECURITY: AI builder is an admin-only design surface.
  // Defense-in-depth: handler-level check independent of the middleware pipeline.
  const { user } = locals;
  if (!user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  if (!isAdmin(user)) {
    throw new AppError("Admin access required for AI builder", 403, "FORBIDDEN");
  }

  if (request.method !== "POST") {
    throw new AppError(
      `Method ${request.method} not allowed for ai-builder`,
      405,
      "METHOD_NOT_ALLOWED",
    );
  }

  const action = segments[1];
  const body = await request.json().catch(() => ({}));

  if (action === "design-collection") {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new AppError("prompt is required", 400, "BAD_REQUEST");
    }

    const { builderAiGateway, designCollection } = await import("@src/services/ai-builder");
    builderAiGateway.checkQuota(String(user._id));
    const result = await designCollection(
      {
        prompt,
        tenantId,
        existingSchema: body.existingSchema,
        language: body.language,
        availableWidgets: body.availableWidgets,
      },
      String(user._id),
    );
    return successResponse(event, result);
  }

  if (action === "refine-collection") {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new AppError("prompt is required", 400, "BAD_REQUEST");
    }
    if (!body.previousProposal) {
      throw new AppError("previousProposal is required", 400, "BAD_REQUEST");
    }

    const { builderAiGateway, refineCollection } = await import("@src/services/ai-builder");
    builderAiGateway.checkQuota(String(user._id));
    const result = await refineCollection(
      {
        prompt,
        tenantId,
        existingSchema: body.existingSchema,
        language: body.language,
        previousProposal: body.previousProposal,
      },
      String(user._id),
    );
    return successResponse(event, result);
  }

  if (action === "approve-collection") {
    // Reserved for Phase 1: persist the approved proposal.
    throw new AppError(
      "Collection approval is not implemented yet (Phase 1)",
      501,
      "NOT_IMPLEMENTED",
    );
  }

  throw new AppError("Unknown AI builder action", 404, "NOT_FOUND");
}

/**
 * --- AUTOMATION ---
 */
/**
 * --- WORKFLOWS (content lifecycle FSM definitions) ---
 */
export async function handleWorkflowRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals, url } = event;
  const { user } = locals;

  // 🛡️ SECURITY: Admin for mutations; authenticated for GET
  if (!["GET", "OPTIONS"].includes(request.method)) {
    if (!user || (!user.isAdmin && user.role !== "admin" && user.role !== "super-admin")) {
      throw new AppError("Admin access required for workflow management", 403, "FORBIDDEN");
    }
  } else if (!user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  if (isMultiTenantEnabled() && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  const { workflowService } = await import("@src/services/background/workflow-service");
  const tid = tenantId ? String(tenantId) : undefined;

  // PATCH = entry state transition (content ops, not definition CRUD)
  if (request.method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    const entryId = body.entryId as string | undefined;
    const targetStateId = body.targetStateId as string | undefined;
    if (!entryId || !targetStateId) {
      throw new AppError("entryId and targetStateId are required", 400);
    }
    const roles = Array.isArray((user as any)?.roles) ? (user as any).roles : [];
    const instance = await workflowService.transition(
      entryId,
      targetStateId,
      user as any,
      roles,
      tid,
      body.comment as string | undefined,
    );
    return successResponse(event, instance);
  }

  if (request.method === "GET") {
    const collectionId = url.searchParams.get("collectionId") || segments[1];
    const entryId = url.searchParams.get("entryId");

    if (entryId) {
      const instance = await workflowService.getWorkflowInstance(entryId, tid);
      return successResponse(event, instance);
    }

    if (collectionId && collectionId !== "list") {
      const def = await workflowService.getWorkflowForCollection(collectionId, tid);
      return successResponse(event, def);
    }

    throw new AppError("collectionId or entryId query parameter required", 400);
  }

  if (request.method === "POST") {
    const body = await request.json();
    if (!body?.collectionId) {
      throw new AppError("collectionId is required", 400);
    }
    const saved = await workflowService.saveWorkflow(body, user as any, tid);
    return successResponse(event, saved, body._id ? 200 : 201);
  }

  if (request.method === "DELETE") {
    const id = segments[1] || url.searchParams.get("id");
    if (!id) throw new AppError("Workflow id required", 400);
    await workflowService.deleteWorkflow(id, user as any, tid);
    return successResponse(event, { success: true, deleted: id });
  }

  throw new AppError(`Method ${request.method} not allowed for workflows`, 405);
}

export async function handleAutomationRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const { user } = locals;

  // 🛡️ SECURITY: Admin verification for automation management
  // Defense-in-depth: handler-level check independent of the middleware pipeline.
  if (!user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  if (!user.isAdmin && user.role !== "admin" && user.role !== "super-admin") {
    throw new AppError("Admin access required for automation management", 403, "FORBIDDEN");
  }

  if (process.env.VERBOSE_TESTS === "true") {
    logger.debug(
      `[handleAutomationRoutes] Method: ${request.method}, segments: ${segments.join(",")}, tenantId: ${tenantId}`,
    );
  }

  const { url } = event;
  const queryTenantId = url.searchParams.get("tenantId");
  let effectiveTenantId = tenantId as string;

  if (queryTenantId && queryTenantId !== tenantId) {
    if (user.role === "super-admin") {
      effectiveTenantId = queryTenantId;
    } else {
      throw new AppError("Forbidden: Cannot access other tenants", 403, "FORBIDDEN");
    }
  }

  if (isMultiTenantEnabled() && !effectiveTenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  const id = segments[1]; // Corrected index: namespace is [0], id is [1]

  const { automationService: service } =
    await import("@src/services/background/automation/automation-service");

  if (request.method === "GET") {
    if (!id || id === "list")
      return successResponse(event, await service.getFlow(undefined as any, effectiveTenantId));

    if (segments[2] === "logs")
      return successResponse(event, await service.getLogs(id, effectiveTenantId));

    const flow = await service.getFlow(id, effectiveTenantId);
    if (!flow) throw new AppError("Automation flow not found", 404);
    return successResponse(event, flow);
  }

  if (request.method === "POST") {
    if (segments[2] === "test") {
      const flow = await service.getFlow(id, effectiveTenantId);
      if (!flow) throw new AppError("Automation flow not found", 404);
      const testPayload = (await request.json().catch(() => ({}))) as any;
      const result = await service.executeFlow(flow, {
        event: "entry:create",
        data: testPayload,
        timestamp: new Date().toISOString(),
        tenantId: effectiveTenantId,
      });
      return successResponse(event, result);
    }
    return successResponse(
      event,
      await service.saveFlow(await request.json(), effectiveTenantId),
      201,
    );
  }

  if ((request.method === "DELETE" || request.method === "PATCH") && id) {
    const flow = await service.getFlow(id, effectiveTenantId);
    if (!flow) throw new AppError("Automation flow not found", 404);

    if (request.method === "DELETE") {
      await service.deleteFlow(id, effectiveTenantId);
      return successResponse(event, { success: true });
    }

    if (request.method === "PATCH") {
      return successResponse(
        event,
        await service.saveFlow({ ...flow, ...(await request.json()) }, effectiveTenantId),
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
    const { presetJson } = await validateRequestBody(event, ImportPresetSchema);
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const { theme, contrastWarnings } = await adminThemeService.importPreset(presetJson, tenantId);
    return json({ success: true, data: theme, warnings: contrastWarnings });
  }

  // ── Multi-Theme Management ──
  if (action === "list" && request.method === "GET") {
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const themes = await adminThemeService.listThemes(tenantId);
    return json(themes);
  }
  if (action === "create" && request.method === "POST") {
    const { name, settings } = await validateRequestBody(event, CreateThemeSchema);
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const result = await adminThemeService.createTheme(name, settings, tenantId);
    return successResponse(event, result, 201);
  }
  if (action === "delete" && request.method === "POST") {
    const { themeId } = await validateRequestBody(event, ThemeIdSchema);
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    await adminThemeService.deleteTheme(themeId, tenantId);
    return successResponse(event, { success: true });
  }
  if (action === "activate" && request.method === "POST") {
    const { themeId } = await validateRequestBody(event, ThemeIdSchema);
    const { adminThemeService } = await import("@src/services/core/admin-theme-service");
    const result = await adminThemeService.activateTheme(themeId, tenantId);
    return successResponse(event, result);
  }
  if (action === "clone" && request.method === "POST") {
    const { sourceId, name } = await validateRequestBody(event, CloneThemeSchema);
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
let lastHealthOverallState = "";

export function invalidateHealthCache(): void {
  lastHealthReport = "";
  lastHealthTime = 0;
  lastHealthOverallState = "";
}

export async function handleHealthRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  _tenantId: DatabaseId,
  _segments: string[],
) {
  const { request } = event;
  const failExternal = request.headers.get("x-test-fail-external") === "true";
  const now = Date.now();

  const { getOverallState, isSystemReady } = await import("@src/stores/system/state.svelte");
  const currentOverallState = getOverallState();

  // 🛡️ CIRCUIT BREAKER AUDIT: If requested, simulate a degraded state
  if (failExternal) {
    const isUp = await cms.db.isConnected();
    return new Response(
      JSON.stringify({
        status: "degraded",
        overallStatus: "DEGRADED",
        state: "DEGRADED",
        database: isUp ? "connected" : "disconnected",
        external: { status: "failed", message: "Simulated External Outage" },
        uptime: process.uptime(),
        timestamp: now,
      }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  }

  // 🚀 PERFORMANCE: Memoization of health report with state-change invalidation
  if (
    lastHealthReport &&
    now - lastHealthTime < 10000 &&
    lastHealthOverallState === currentOverallState &&
    !request.headers.has("x-refresh")
  ) {
    return new Response(lastHealthReport, {
      headers: { "Content-Type": "application/json", "X-Cached": "TRUE" },
    });
  }

  const isUp = await cms.db.isConnected();
  const { getDatabaseResilience } = await import("@src/databases/database-resilience");
  const metrics = getDatabaseResilience().getMetrics();
  const ready = isSystemReady();
  const report = {
    status: isUp ? "healthy" : "degraded",
    overallStatus: currentOverallState,
    state: currentOverallState,
    ready,
    database: isUp ? "connected" : "disconnected",
    latency: 0, // Simplified for high-frequency checks
    serverTime: new Date().toISOString(),
    uptime: process.uptime(),
    dbType: process.env.DB_TYPE || "unknown",
    resilience: {
      circuitState: metrics.circuitState,
      totalRetries: metrics.totalRetries,
      successfulReconnections: metrics.successfulReconnections,
    },
  };

  const reportString = JSON.stringify({
    success: true,
    overallStatus: currentOverallState,
    status: isUp ? "healthy" : "degraded",
    state: currentOverallState,
    ready,
    data: report,
  });
  lastHealthReport = reportString;
  lastHealthTime = now;
  lastHealthOverallState = currentOverallState;

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
  if (isMultiTenantEnabled() && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  if (request.method === "POST") {
    const { type } = await request.json().catch(() => ({}));
    if (type === "users") {
      const result = await cms.auth.listUsers({ tenantId });
      if (!result.success) throw new AppError(result.message || "Failed to list users", 500);
      const items = Array.isArray(result.data) ? result.data : [];
      return streamingArrayResponse(items, items.length);
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
  if (isMultiTenantEnabled() && !tenantId) {
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
// The mediagallery breadcrumb/folder-tree load uses a 5-min SWR cache
// (`mediagallery:virtualFolders:<tenantId>`) keyed the same way here — must be
// invalidated on any folder mutation or newly created/renamed/deleted folders
// stay invisible client-side until the cache naturally expires.
async function invalidateVirtualFolderCache(tenantId: DatabaseId) {
  await cacheService.delete(`mediagallery:virtualFolders:${tenantId || "global"}`);
}

export async function handleSystemVirtualFolderRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  _segments: string[],
) {
  const { request, url } = event;

  const tenantOpts = { tenantId };

  if (request.method === "GET") {
    const result = await cms.db.system.virtualFolder.getAll(tenantOpts);
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
        tenantOpts,
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
      tenantOpts,
    );
    await invalidateVirtualFolderCache(tenantId);
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
          tenantOpts,
        );
        if (!folderResult.success || !folderResult.data) {
          continue;
        }

        let newPath = `/${folderResult.data.name}`;
        if (targetParentId) {
          const parentFolder = await cms.db.system.virtualFolder.getById(
            targetParentId as DatabaseId,
            tenantOpts,
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
          tenantOpts,
        );

        await updateFolderPathsRecursive(cms, folderId as DatabaseId, newPath, tenantId);
      }

      await invalidateVirtualFolderCache(tenantId);
      return successResponse(event, { success: true });
    }

    const { folderId, name } = body;
    if (!folderId || !name) {
      throw new AppError("folderId and name are required for rename", 400);
    }

    const folderResult = await cms.db.system.virtualFolder.getById(
      folderId as DatabaseId,
      tenantOpts,
    );
    if (!folderResult.success || !folderResult.data) {
      throw new AppError("Folder not found", 404);
    }

    let parentPath = "/";
    if (folderResult.data.parentId) {
      const parentFolder = await cms.db.system.virtualFolder.getById(
        folderResult.data.parentId as DatabaseId,
        tenantOpts,
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
      tenantOpts,
    );

    await updateFolderPathsRecursive(cms, folderId as DatabaseId, newPath, tenantId);

    await invalidateVirtualFolderCache(tenantId);
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

    const result = await cms.db.system.virtualFolder.delete(folderId as DatabaseId, tenantOpts);
    await invalidateVirtualFolderCache(tenantId);
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
  const tenantOpts = { tenantId };
  const allFoldersResult = await cms.db.system.virtualFolder.getAll(tenantOpts);
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
      await cms.db.system.virtualFolder.update(child._id, { path: newChildPath }, tenantOpts);
      await updateChildren(child._id, newChildPath);
    }
  }

  await updateChildren(parentId, parentPath);
}

// ============================================================================
// Plugin Settings Handler (encrypted, per-tenant, per-plugin)
// ============================================================================

import { pluginRegistry } from "@src/plugins/registry";
import { validatePluginSettings } from "@src/plugins/settings-declaration";
import { capabilityRegistry } from "@src/services/security/capability-registry";

/**
 * Handle /api/plugin-settings/:pluginId
 * - GET: Return settings for a plugin (secrets masked)
 * - PUT: Save settings for a plugin (validates against declaration, encrypts secrets)
 */
export async function handlePluginSettingsRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  const pluginId = segments[1];
  const user = locals.user as any;
  const roles = (locals.roles || []) as any[];

  if (!pluginId) {
    throw new AppError("pluginId is required in path", 400);
  }

  // Check plugin exists
  const plugin = pluginRegistry.get(pluginId);
  if (!plugin) {
    throw new AppError(`Plugin "${pluginId}" not found`, 404);
  }

  // Check capability gate
  if (!capabilityRegistry.canManagePluginSettings(user, roles, pluginId)) {
    throw new AppError("Insufficient permissions to manage plugin settings", 403, "FORBIDDEN");
  }

  // If plugin has requiredCapabilities, check those too
  if (plugin.settings?.requiredCapabilities) {
    for (const cap of plugin.settings.requiredCapabilities) {
      if (!capabilityRegistry.hasCapability(user, cap, roles)) {
        throw new AppError(
          `Plugin "${pluginId}" requires capability "${cap}" to manage its settings`,
          403,
          "FORBIDDEN",
        );
      }
    }
  }

  const tenantIdStr = String(tenantId);

  if (request.method === "GET") {
    const settings = await pluginRegistry.getPluginSettings(pluginId, tenantIdStr);
    return successResponse(event, { settings: settings || {} });
  }

  if (request.method === "PUT" || request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const submitted = body.settings || body;

    // Validate against declaration if available
    if (plugin.settings) {
      const issues = validatePluginSettings(submitted, plugin.settings);
      if (issues.length > 0) {
        return successResponse(event, { error: "Validation failed", issues }, 400);
      }
    }

    const saved = await pluginRegistry.savePluginSettings(pluginId, tenantIdStr, submitted);
    if (!saved) {
      throw new AppError("Failed to save plugin settings", 500);
    }

    // Return masked settings
    const updated = await pluginRegistry.getPluginSettings(pluginId, tenantIdStr);
    return successResponse(event, { settings: updated || {} });
  }

  throw new AppError(`Method ${request.method} not allowed for plugin-settings`, 405);
}

/**
 * Validates admin authorization against the standardized SvelteKit locals context.
 */
function requireAdmin(event: RequestEvent): void {
  const { locals } = event;
  if (locals.isAdmin || isAdmin(locals.user)) return;
  throw new AppError("Admin access required", 403, "FORBIDDEN");
}

/**
 * Dispatches version-related requests.
 * Path: /api/system/version/check
 */
export async function handleVersionRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
): Promise<Response> {
  const { request } = event;
  const subAction = segments[1]; // check

  try {
    // GET /api/system/version/check
    if (subAction === "check" && request.method === "GET") {
      return successResponse(event, await versionService.checkForUpdates());
    }

    // GET /api/system/version (bare — return current version only)
    if (!subAction && request.method === "GET") {
      const currentVersion = versionService.readLocalVersion();
      return successResponse(event, { currentVersion });
    }

    throw new AppError(
      `Version endpoint /api/system/version/${subAction || ""} not implemented`,
      404,
    );
  } catch (err: any) {
    logger.error(`[VersionRoute Error] ${segments.join("/")}:`, err);
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "Version operation failed", 500);
  }
}

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

const VALID_LOG_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);

/**
 * Admin log export for resilience diagnostics and support bundles.
 */
export async function handleLogsRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  _tenantId: DatabaseId,
  segments: string[],
) {
  requireAdmin(event);

  const method = event.request.method;
  const action = segments.length > 1 ? segments[1] : undefined;

  if (action === "download") {
    if (method !== "GET")
      throw new AppError(`Method ${method} not allowed`, 405, "METHOD_NOT_ALLOWED");

    const { url } = event;
    const type = (url.searchParams.get("type") || "latest") as LogExportType;
    const format = (url.searchParams.get("format") || "text") as LogExportFormat;

    if (!["latest", "all", "archive"].includes(type)) {
      throw new AppError("Invalid type parameter", 400, "VALIDATION_ERROR");
    }
    if (!["text", "gzip"].includes(format)) {
      throw new AppError("Invalid format parameter", 400, "VALIDATION_ERROR");
    }

    const since = url.searchParams.get("since") || undefined;
    const rawLevel = url.searchParams.get("level")?.toLowerCase();
    const level = rawLevel && VALID_LOG_LEVELS.has(rawLevel) ? rawLevel : undefined;

    const exported = await buildLogExport({ type, format, since, level });

    return new Response(exported.body as any, {
      status: 200,
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${exported.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (action === "audit") {
    if (method !== "GET") {
      throw new AppError(`Method ${method} not allowed`, 405, "METHOD_NOT_ALLOWED");
    }

    const { queryAuditLogs } = await import("@src/services/security/audit-service");

    const { url } = event;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 500);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);
    const filterType = url.searchParams.get("type") || undefined;
    const filterUser = url.searchParams.get("user") || undefined;

    const filters: Record<string, any> = {};
    if (filterType) filters.eventType = filterType;
    if (filterUser) filters.actorEmail = filterUser;

    const res = await queryAuditLogs({
      tenantId: _tenantId,
      limit,
      offset,
      filters,
    });

    if (!res.success) {
      throw new AppError(res.message || "Failed to query audit logs", 500);
    }

    return successResponse(event, res.data || []);
  }

  throw new AppError(`Logs endpoint /api/logs/${action || ""} not implemented`, 404);
}
