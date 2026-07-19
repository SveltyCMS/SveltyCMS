/**
 * @file src/routes/(app)/config/sync/sync-api.ts
 * @description Browser API for config sync status / plan / apply (Testing 2026).
 */

import { fetchApi, type ApiResponse } from "@utils/api";

export type ConfigSyncStatus = {
  status: "in_sync" | "changes_detected" | "error";
  changes?: {
    new?: { name: string; uuid: string; type: string }[];
    updated?: { name: string; uuid: string; type: string }[];
    deleted?: { name: string; uuid: string; type: string }[];
  };
  unmetRequirements?: { name: string; type: string; requirement: string }[];
};

export async function fetchSyncStatus(): Promise<ApiResponse<ConfigSyncStatus>> {
  return fetchApi<ConfigSyncStatus>("/api/config/status");
}

export async function createSyncPlan(
  mode = "merge",
): Promise<ApiResponse<{ planId?: string; mode?: string }>> {
  return fetchApi("/api/config/plan", {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export async function applySyncPlan(
  planId: string,
  mode?: string,
): Promise<ApiResponse<{ message?: string }>> {
  return fetchApi("/api/config/apply", {
    method: "POST",
    body: JSON.stringify({ planId, mode }),
  });
}
