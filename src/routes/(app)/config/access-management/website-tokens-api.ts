/**
 * @file src/routes/(app)/config/access-management/website-tokens-api.ts
 * @description Browser API client for website tokens (Testing 2026 pattern).
 *
 * Mutations and list queries use fetchApi so CSRF is automatic.
 */

import { fetchApi, type ApiResponse } from "@utils/api";
import type { WebsiteToken } from "@src/content/types";
import type { User } from "@src/databases/auth/types";

export interface WebsiteTokensListResult {
  items: WebsiteToken[];
  totalItems: number;
}

export async function listUsersForTokens(): Promise<User[]> {
  const result = await fetchApi<User[]>("/api/user");
  if (!result.success) return [];
  const raw = (result as { data?: unknown }).data ?? result;
  if (Array.isArray(raw)) return raw as User[];
  return [];
}

export async function listWebsiteTokens(
  params: URLSearchParams,
): Promise<ApiResponse<WebsiteToken[]> & { pagination?: { totalItems?: number } }> {
  return fetchApi<WebsiteToken[]>(`/api/website-tokens?${params.toString()}`);
}

export function unwrapWebsiteTokensList(
  result: ApiResponse<unknown> & { pagination?: { totalItems?: number } },
): WebsiteTokensListResult {
  if (!result.success) return { items: [], totalItems: 0 };
  const raw = (result as { data?: unknown }).data ?? result;
  const items = Array.isArray(raw) ? (raw as WebsiteToken[]) : [];
  const totalItems = Number(result.pagination?.totalItems ?? items.length);
  return { items, totalItems };
}

export async function createWebsiteToken(body: {
  name: string;
  permissions: string[];
  expiresAt: string | null;
  tenantId?: string | null;
}): Promise<ApiResponse<WebsiteToken> & { statusHint?: number }> {
  return fetchApi<WebsiteToken>("/api/website-tokens", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteWebsiteTokenById(id: string): Promise<ApiResponse<unknown>> {
  return fetchApi(`/api/website-tokens/${id}`, { method: "DELETE" });
}

export async function bulkDeleteWebsiteTokens(ids: string[]): Promise<{ successCount: number }> {
  const results = await Promise.all(ids.map((id) => deleteWebsiteTokenById(id)));
  return { successCount: results.filter((r) => r.success).length };
}
