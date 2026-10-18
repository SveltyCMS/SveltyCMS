/**
 * @file src/routes/api/[...path]/handlers/testing/testing-config-seeds.ts
 * @description Config-route E2E seeds: webhooks, automations, workflows, and plugin toggles.
 */

import { AppError } from "@utils/error-handling";
import { generateUUID } from "@utils/native-utils";
import { loadDbModule, rawResponse, type TestingContext } from "./testing-shared";

export async function handleTestingConfigSeedRoutes(
  ctx: TestingContext,
): Promise<Response | undefined> {
  const { tenantId, params, action } = ctx;

  if (action === "seed-webhook") {
    const { webhookService } = await import("@src/services/background/webhook-service");
    const stamp = generateUUID().slice(0, 8);
    const webhook = await webhookService.saveWebhook(
      {
        id: params.id as string | undefined,
        name: (params.name as string) || `E2E Webhook ${stamp}`,
        url: (params.url as string) || `https://example.com/e2e-hook/${stamp}`,
        events: (params.events as any) || ["entry:publish"],
        active: params.active !== false,
        secret: (params.secret as string) || `e2e-secret-${stamp}`,
      },
      String(tenantId),
    );
    return rawResponse({ success: true, webhook, data: webhook });
  }

  if (action === "delete-webhook") {
    const id = params.id as string;
    if (!id) throw new AppError("id required for delete-webhook", 400);
    const { webhookService } = await import("@src/services/background/webhook-service");
    await webhookService.deleteWebhook(id, String(tenantId));
    return rawResponse({ success: true, deleted: id });
  }

  if (action === "seed-automation") {
    const { automationService } =
      await import("@src/services/background/automation/automation-service");
    const stamp = generateUUID().slice(0, 8);
    const flow = await automationService.saveFlow(
      {
        id: params.id as string | undefined,
        name: (params.name as string) || `E2E Automation ${stamp}`,
        description: (params.description as string) || "Seeded for E2E deep flow",
        active: params.active !== false,
        trigger: params.trigger || { type: "manual", events: [] },
        operations: params.operations || [
          {
            id: generateUUID(),
            type: "log",
            config: { message: "E2E seed log: {{ trigger.event }}", level: "info" },
          },
        ],
      },
      String(tenantId),
    );
    return rawResponse({ success: true, flow, data: flow });
  }

  if (action === "delete-automation") {
    const id = params.id as string;
    if (!id) throw new AppError("id required for delete-automation", 400);
    const { automationService } =
      await import("@src/services/background/automation/automation-service");
    await automationService.deleteFlow(id, String(tenantId));
    return rawResponse({ success: true, deleted: id });
  }

  if (action === "seed-workflow") {
    const { workflowService } = await import("@src/services/background/workflow-service");
    const stamp = generateUUID().slice(0, 8);
    const collectionId =
      (params.collectionId as string) || (params.collection as string) || `e2e_col_${stamp}`;
    const adminUser = {
      _id: (params.userId as string) || "system",
      role: "admin",
      isAdmin: true,
      email: "e2e@sveltycms.test",
    } as any;
    const definition = {
      _id: params.id as string | undefined,
      collectionId,
      name: (params.name as string) || `E2E Workflow ${stamp}`,
      description: params.description as string | undefined,
      states: (params.states as any[]) || [
        { id: "draft", label: "Draft", color: "#94a3b8", isInitial: true },
        { id: "review", label: "In Review", color: "#fbbf24" },
        { id: "published", label: "Published", color: "#22c55e", isFinal: true },
      ],
      transitions: (params.transitions as any[]) || [
        { id: "t1", from: "draft", to: "review", label: "Submit" },
        { id: "t2", from: "review", to: "published", label: "Approve" },
        { id: "t3", from: "review", to: "draft", label: "Reject" },
      ],
    };
    const tid = tenantId ? String(tenantId) : undefined;
    const saved = await workflowService.saveWorkflow(definition, adminUser, tid);
    return rawResponse({ success: true, workflow: saved, data: saved });
  }

  if (action === "delete-workflow") {
    const id = params.id as string;
    if (!id) throw new AppError("id required for delete-workflow", 400);
    const { workflowService } = await import("@src/services/background/workflow-service");
    const adminUser = {
      _id: "system",
      role: "admin",
      isAdmin: true,
      email: "e2e@sveltycms.test",
    } as any;
    const tid = tenantId ? String(tenantId) : undefined;
    await workflowService.deleteWorkflow(id, adminUser, tid);
    return rawResponse({ success: true, deleted: id });
  }

  if (action === "enable-plugin") {
    const pluginId = (params.pluginId || params.id) as string;
    if (!pluginId) throw new AppError("pluginId required for enable-plugin", 400);
    // Fail closed on weird ids (path traversal / injection surface)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(pluginId)) {
      throw new AppError("Invalid pluginId", 400, "INVALID_PLUGIN_ID");
    }
    try {
      const { pluginRegistry } = await import("@src/plugins");
      const enabled = params.enabled !== false;
      // Pass the live adapter so lazy activation (togglePlugin) can run the
      // plugin's pending migrations on first enable — boot no longer runs
      // migrations for default-disabled plugins.
      let dbAdapter: unknown;
      try {
        const { getDb } = await loadDbModule();
        dbAdapter = getDb();
      } catch {
        dbAdapter = undefined;
      }
      const ok = await pluginRegistry.togglePlugin(
        pluginId,
        enabled,
        String(tenantId),
        // Never accept client-supplied userId for audit attribution via testing API
        "system",
        dbAdapter as never,
      );
      if (!ok) {
        return rawResponse(
          {
            success: false,
            code: "PLUGIN_UNAVAILABLE",
            message: `Plugin "${pluginId}" could not be toggled (missing or settings service unavailable)`,
            pluginId,
          },
          503,
        );
      }
      return rawResponse({ success: true, pluginId, enabled });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return rawResponse({ success: false, code: "PLUGIN_UNAVAILABLE", message, pluginId }, 503);
    }
  }

  return undefined;
}
