/**
 * @file src/routes/api/workflows/workflow-schemas.ts
 * @description Valibot schemas for Workflow API validation.
 */

import * as v from "valibot";

export const WorkflowStateSchema = v.object({
  id: v.string(),
  label: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  color: v.pipe(v.string(), v.regex(/^#[0-9a-fA-F]{6}$/)),
  isInitial: v.optional(v.boolean()),
  isFinal: v.optional(v.boolean()),
});

export const WorkflowTransitionSchema = v.object({
  id: v.string(),
  from: v.string(),
  to: v.string(),
  label: v.string(),
  requiredRole: v.optional(v.string()),
});

export const WorkflowDefinitionSchema = v.object({
  _id: v.optional(v.string()),
  collectionId: v.pipe(v.string(), v.minLength(1)),
  states: v.pipe(v.array(WorkflowStateSchema), v.minLength(1)),
  transitions: v.array(WorkflowTransitionSchema),
});

export const WorkflowTransitionTriggerSchema = v.object({
  entryId: v.pipe(v.string(), v.minLength(1)),
  targetStateId: v.pipe(v.string(), v.minLength(1)),
  comment: v.optional(v.string()),
});
