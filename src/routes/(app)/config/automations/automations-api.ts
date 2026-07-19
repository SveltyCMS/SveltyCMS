/**
 * @file src/routes/(app)/config/automations/automations-api.ts
 * @description Browser API client for workflow automations (Testing 2026 pattern).
 *
 * Mutations go through fetchApi — CSRF is automatic. No raw fetch in Svelte pages.
 */

import { fetchApi, type ApiResponse } from "@utils/api";
import type { AutomationFlow } from "@src/services/background/automation/types";

export function unwrapFlowList(result: ApiResponse<unknown>): AutomationFlow[] {
  if (!result.success) return [];
  const raw = (result as { data?: unknown }).data ?? result;
  if (Array.isArray(raw)) return raw as AutomationFlow[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: AutomationFlow[] }).data;
  }
  return [];
}

export function unwrapFlow(result: ApiResponse<unknown>): AutomationFlow | null {
  if (!result.success) return null;
  const raw = (result as { data?: unknown }).data ?? result;
  if (raw && typeof raw === "object" && "id" in (raw as object)) {
    return raw as AutomationFlow;
  }
  if (raw && typeof raw === "object" && (raw as { data?: unknown }).data) {
    return (raw as { data: AutomationFlow }).data;
  }
  return null;
}

export async function listAutomations(): Promise<ApiResponse<AutomationFlow[]>> {
  return fetchApi<AutomationFlow[]>("/api/automations");
}

export async function getAutomation(id: string): Promise<ApiResponse<AutomationFlow>> {
  return fetchApi<AutomationFlow>(`/api/automations/${id}`);
}

export async function createAutomation(
  flow: Partial<AutomationFlow>,
): Promise<ApiResponse<AutomationFlow>> {
  return fetchApi<AutomationFlow>("/api/automations", {
    method: "POST",
    body: JSON.stringify(flow),
  });
}

export async function updateAutomation(
  id: string,
  patch: Partial<AutomationFlow>,
): Promise<ApiResponse<AutomationFlow>> {
  return fetchApi<AutomationFlow>(`/api/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteAutomation(id: string): Promise<ApiResponse<{ success?: boolean }>> {
  return fetchApi(`/api/automations/${id}`, { method: "DELETE" });
}

export async function testAutomation(
  id: string,
  payload: Record<string, unknown> = {},
): Promise<ApiResponse<unknown>> {
  return fetchApi(`/api/automations/${id}/test`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveAutomation(
  flow: Partial<AutomationFlow>,
  isNew: boolean,
): Promise<ApiResponse<AutomationFlow>> {
  if (isNew || !flow.id) {
    return createAutomation(flow);
  }
  return updateAutomation(flow.id, flow);
}
