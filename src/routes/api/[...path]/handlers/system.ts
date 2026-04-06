/**
 * @file src/routes/api/[...path]/handlers/system.ts
 * @description System, Settings, Widgets, and Utility handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "../../cms";
import type { DatabaseId } from "@src/content/types";
import { successResponse, rawResponse } from "./base";
import { settingsGroups } from "../../../(app)/config/system-settings/settings-groups";

export async function handleSystemRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: string | null,
  namespace: string,
  segments: string[],
) {
  const { request, locals } = event;
  const { user } = locals;
  const method = segments[1];

  // --- Widgets ---
  if (namespace === "widgets") {
    if (request.method === "GET") {
      if (method === "active") {
        const widgetList = await cms.widgets.list(tenantId || "default");
        const activeWidgets = widgetList.filter((w: any) => w.isActive);
        return successResponse(event, activeWidgets);
      }
      if (method === "list") {
        const widgetList = await cms.widgets.list(tenantId || "default");
        return successResponse(event, {
          widgets: widgetList,
          summary: {
            total: widgetList.length,
            active: widgetList.filter((w: any) => w.isActive).length,
            core: widgetList.filter((w: any) => w.isCore).length,
            custom: widgetList.filter((w: any) => !w.isCore).length,
          },
          tenantId: tenantId || "default-tenant",
        });
      }
    }
    if (request.method === "POST") {
      if (method === "activate" && segments[2]) {
        const result = await cms.widgets.activate(segments[2]);
        return rawResponse(event, result);
      }
      if (method === "deactivate" && segments[2]) {
        const result = await cms.widgets.deactivate(segments[2]);
        return rawResponse(event, result);
      }
      if (method === "install") {
        const { widgetId } = await request.json();
        await cms.widgets.activate(widgetId);
        return successResponse(event, { widgetId });
      }
      if (method === "uninstall") {
        const { widgetName } = await request.json();
        await cms.widgets.deactivate(widgetName);
        return successResponse(event, { widgetName });
      }
    }
  }

  // --- System Management ---
  if (namespace === "system") {
    if (method === "reinitialize" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const result = await cms.system.reinitialize(body.force ?? true);
      return rawResponse(event, result);
    }
  }

  // --- Settings ---
  if (namespace === "settings") {
    if (request.method === "GET" && method === "all") {
      const data = await cms.system.settings.getAll(tenantId || "default");
      const groups: Record<string, Record<string, any>> = {};
      const flatSettings = { ...(data.public as any), ...(data.private as any) };

      for (const group of settingsGroups) {
        groups[group.id] = {};
        for (const field of group.fields) {
          groups[group.id][field.key] = flatSettings[field.key];
        }
      }
      return successResponse(event, groups);
    }

    if (request.method === "GET" && method === "public") {
      const data = await cms.system.settings.getAll(tenantId || "default");
      const publicSettings = data.public || {};

      if (segments[2] === "stream") {
        const stream = new ReadableStream({
          start(controller) {
            let isClosed = false;
            controller.enqueue(`data: ${JSON.stringify(publicSettings)}\n\n`);
            const interval = setInterval(() => {
              if (!isClosed) {
                try {
                  controller.enqueue(`: keep-alive\n\n`);
                } catch {
                  isClosed = true;
                  clearInterval(interval);
                }
              }
            }, 30000);
            request.signal.addEventListener("abort", () => {
              if (!isClosed) {
                isClosed = true;
                clearInterval(interval);
                try {
                  controller.close();
                } catch {}
              }
            });
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }
      return successResponse(event, publicSettings);
    }

    if (request.method === "POST" && method === "import") {
      const snapshot = await request.json();
      const result = await cms.system.settings.updateFromSnapshot(snapshot);
      return successResponse(event, result);
    }
  }

  // --- Importers & Migration ---
  if (namespace === "system-settings" && request.method === "POST" && method === "import") {
    const body = await request.json();
    const result = await cms.system.importer.importData(body, tenantId as DatabaseId);
    return rawResponse(event, result);
  }
  if (namespace === "importer") {
    if (request.method === "POST" && method === "scaffold") {
      const body = await request.json();
      const result = await cms.system.importer.scaffold(body);
      return rawResponse(event, result);
    }
    if (request.method === "POST" && method === "external") {
      const body = await request.json();
      const result = await cms.system.importer.importExternal(body, user, tenantId as DatabaseId);
      return rawResponse(event, result);
    }
  }
  if (namespace === "import-data" && request.method === "POST") {
    const body = await request.json();
    const result = await cms.system.importer.importData(body, tenantId as DatabaseId);
    return rawResponse(event, result);
  }

  // --- AI & Automation ---
  if (namespace === "ai") {
    const body = await request.json();
    if (method === "chat")
      return successResponse(event, await cms.ai.chat(body.userMessage, body.history));
    if (method === "enrich")
      return successResponse(event, await cms.ai.enrichText(body.text, body.action, body.language));
  }
  if (namespace === "automations" && request.method === "GET") {
    return successResponse(event, await cms.automation.getFlows(tenantId || "default"));
  }

  // --- Metrics & Telemetry ---
  if (namespace === "metrics") return successResponse(event, await cms.metrics.getReport());
  if (namespace === "telemetry" && method === "stats")
    return successResponse(event, await cms.telemetry.checkUpdateStatus());

  throw new AppError(`System endpoint /api/${segments.join("/")} not implemented`, 404);
}
