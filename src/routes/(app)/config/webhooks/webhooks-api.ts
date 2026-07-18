/**
 * @file src/routes/(app)/config/webhooks/webhooks-api.ts
 * @description Browser API client for webhooks — thin fetchApi wrappers (CSRF automatic).
 *
 * Reference implementation for Testing 2026 ADR: keep Svelte pages free of raw fetch
 * and manual CSRF headers. Unit-test with mocked global fetch.
 *
 * ### Features:
 * - list / create / update / delete / test
 * - Uses shared fetchApi mutation CSRF policy
 */

import { fetchApi, type ApiResponse } from "@utils/api";
import type { Webhook } from "@src/services/background/webhook-service";

/** Normalize list payload from successResponse envelopes. */
export function unwrapWebhookList(result: ApiResponse<unknown>): Webhook[] {
  if (!result.success) return [];
  const raw = (result as { data?: unknown }).data ?? result;
  if (Array.isArray(raw)) return raw as Webhook[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: Webhook[] }).data;
  }
  return [];
}

export async function listWebhooks(): Promise<ApiResponse<Webhook[]>> {
  return fetchApi<Webhook[]>("/api/webhooks");
}

export async function createWebhook(body: Partial<Webhook>): Promise<ApiResponse<Webhook>> {
  return fetchApi<Webhook>("/api/webhooks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateWebhook(
  id: string,
  body: Partial<Webhook>,
): Promise<ApiResponse<Webhook>> {
  return fetchApi<Webhook>(`/api/webhooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ ...body, id }),
  });
}

export async function deleteWebhook(id: string): Promise<ApiResponse<{ success?: boolean }>> {
  return fetchApi(`/api/webhooks/${id}`, { method: "DELETE" });
}

export async function testWebhookDelivery(id: string): Promise<ApiResponse<{ success?: boolean }>> {
  return fetchApi(`/api/webhooks/${id}/test`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Create or update based on presence of id. */
export async function saveWebhook(body: Partial<Webhook>): Promise<ApiResponse<Webhook>> {
  if (body.id) {
    return updateWebhook(body.id, body);
  }
  return createWebhook(body);
}
