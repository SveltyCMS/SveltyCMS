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

import { fetchApi, type ApiResponse } from "@utils/api";
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

function unwrapArray<T>(result: ApiResponse<unknown>): T[] {
  if (!result.success) return [];
  const raw = (result as { data?: unknown }).data ?? result;
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

export async function listWorkflowCollections(): Promise<WorkflowCollectionOption[]> {
  const result = await fetchApi<WorkflowCollectionOption[]>("/api/collections");
  return unwrapArray<WorkflowCollectionOption>(result);
}

export async function listWorkflowRoles(): Promise<WorkflowRoleOption[]> {
  const result = await fetchApi<WorkflowRoleOption[]>("/api/user/roles");
  return unwrapArray<WorkflowRoleOption>(result);
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
