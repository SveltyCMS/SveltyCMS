/**
 * @file src/routes/(app)/config/trash/trash-api.ts
 * @description Browser API client for global trash (Testing 2026 pattern).
 */

import { fetchApi, type ApiResponse } from "@utils/api";

export interface TrashItem {
  _id: string;
  title?: string;
  name?: string;
  collectionId: string;
  collectionName?: string;
  deletedAt?: string;
  deletedBy?: string;
}

export function unwrapTrashList(result: ApiResponse<unknown>): TrashItem[] {
  if (!result.success) return [];
  const raw = (result as { data?: unknown }).data ?? result;
  if (Array.isArray(raw)) return raw as TrashItem[];
  return [];
}

export async function listTrash(): Promise<ApiResponse<TrashItem[]>> {
  return fetchApi<TrashItem[]>("/api/trash");
}

export async function restoreTrashItem(
  collectionId: string,
  entryId: string,
): Promise<ApiResponse<unknown>> {
  return fetchApi("/api/trash/restore", {
    method: "POST",
    body: JSON.stringify({ collectionId, entryId }),
  });
}
