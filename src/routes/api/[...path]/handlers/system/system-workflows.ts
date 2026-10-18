/**
 * @file src/routes/api/[...path]/handlers/system/system-workflows.ts
 * @description Workflow definition/transition and automation-flow routes.
 */

import { logger } from "@src/utils/logger";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";

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

  // PATCH = entry state transition OR assignee assignment (content ops, not definition CRUD)
  if (request.method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    const entryId = body.entryId as string | undefined;
    const targetStateId = body.targetStateId as string | undefined;
    if (!entryId) {
      throw new AppError("entryId is required", 400);
    }
    const roles = Array.isArray((user as any)?.roles) ? (user as any).roles : [];

    // Assignee handoff: PATCH with assigneeId and no targetStateId.
    if (body.assigneeId && !targetStateId) {
      const assigned = await workflowService.assign(
        entryId,
        body.assigneeId as string,
        user as any,
        tid,
      );
      return successResponse(event, assigned);
    }

    if (!targetStateId) {
      throw new AppError("targetStateId or assigneeId is required", 400);
    }
    const instance = await workflowService.transition(
      entryId,
      targetStateId,
      user as any,
      roles,
      tid,
      body.comment as string | undefined,
      body.assigneeId as string | undefined,
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
