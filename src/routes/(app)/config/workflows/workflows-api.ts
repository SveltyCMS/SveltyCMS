/**
 * @file src/routes/(app)/config/workflows/workflows-api.ts
 * @description Browser API client for workflow builder (Testing 2026 pattern).
 *
 * Thin fetchApi wrappers so the Svelte page never uses raw fetch or manual CSRF.
 *
 * ### Features:
 * - list collections / roles for builder chrome
 * - load workflow by collectionId
 * - save workflow definition
 */

import { fetchApi, unwrapList, type ApiResponse } from "@utils/api";
import type { WorkflowDefinition } from "@src/types/workflow-types";

export interface WorkflowCollectionOption {
  _id: string;
  name?: string;
}

export interface WorkflowRoleOption {
  _id?: string;
  id?: string;
  name?: string;
}

export async function listWorkflowCollections(): Promise<WorkflowCollectionOption[]> {
  const result = await fetchApi<WorkflowCollectionOption[]>("/api/collections");
  return unwrapList<WorkflowCollectionOption>(result);
}

export async function listWorkflowRoles(): Promise<WorkflowRoleOption[]> {
  const result = await fetchApi<WorkflowRoleOption[]>("/api/user/roles");
  return unwrapList<WorkflowRoleOption>(result);
}

export async function loadWorkflow(
  collectionId: string,
): Promise<ApiResponse<WorkflowDefinition | null>> {
  return fetchApi<WorkflowDefinition | null>(
    `/api/workflows?collectionId=${encodeURIComponent(collectionId)}`,
  );
}

export async function saveWorkflowDefinition(
  definition: WorkflowDefinition,
): Promise<ApiResponse<WorkflowDefinition>> {
  return fetchApi<WorkflowDefinition>("/api/workflows", {
    method: "POST",
    body: JSON.stringify(definition),
  });
}
