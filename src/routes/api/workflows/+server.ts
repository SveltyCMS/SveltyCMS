/**
 * @file src/routes/api/workflows/+server.ts
 * @description API endpoints for Workflow Management and Transitions.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@src/utils/api-handler";
import { workflowService } from "@src/services/workflow-service";
import { AppError } from "@src/utils/error-handler";
import * as v from "valibot";
import { WorkflowDefinitionSchema, WorkflowTransitionTriggerSchema } from "./workflow-schemas";

/**
 * GET: Load workflow for a collection or instance for an entry
 * Query params: collectionId, entryId
 */
export const GET = apiHandler(async ({ url, locals }) => {
  const { tenantId } = locals;
  const collectionId = url.searchParams.get("collectionId");
  const entryId = url.searchParams.get("entryId");

  if (entryId) {
    const instance = await workflowService.getWorkflowInstance(entryId, tenantId);
    return json({ success: true, data: instance });
  }

  if (collectionId) {
    const workflow = await workflowService.getWorkflowForCollection(collectionId, tenantId);
    return json({ success: true, data: workflow });
  }

  throw new AppError("Either collectionId or entryId is required", 400, "BAD_REQUEST");
});

/**
 * POST: Save workflow definition
 */
export const POST = apiHandler(async ({ request, locals }) => {
  const { user, tenantId } = locals;
  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const raw = await request.json();
  const definition = v.parse(WorkflowDefinitionSchema, raw);

  const saved = await workflowService.saveWorkflow(definition, user, tenantId);
  return json({ success: true, data: saved });
});

/**
 * PATCH: Trigger a state transition
 */
export const PATCH = apiHandler(async ({ request, locals }) => {
  const { user, roles, tenantId } = locals;
  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const raw = await request.json();
  const { entryId, targetStateId, comment } = v.parse(WorkflowTransitionTriggerSchema, raw);

  const instance = await workflowService.transition(
    entryId,
    targetStateId,
    user,
    roles || [],
    tenantId,
    comment,
  );
  return json({ success: true, data: instance });
});

/**
 * DELETE: Remove a workflow definition
 */
export const DELETE = apiHandler(async ({ url, locals }) => {
  const { user, tenantId } = locals;
  if (!user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const id = url.searchParams.get("id");
  if (!id) throw new AppError("id is required", 400, "BAD_REQUEST");

  await workflowService.deleteWorkflow(id, user, tenantId);
  return json({ success: true });
});
