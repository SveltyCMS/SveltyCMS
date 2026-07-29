/**
 * @file src/routes/(app)/config/webhooks/webhooks-utils.ts
 * @description Pure helpers for webhook manager UI (validation, event filter).
 */

export const WEBHOOK_EVENT_TYPES = [
  "entry:create",
  "entry:update",
  "entry:delete",
  "entry:publish",
  "entry:unpublish",
  "media:upload",
  "media:delete",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookDraft {
  id?: string;
  name: string;
  url: string;
  active: boolean;
  events: string[];
  secret?: string;
}

/**
 * Validate webhook name (non-empty, reasonable length).
 */
export function validateWebhookName(name: string): string | null {
  const v = name.trim();
  if (!v) return "Name is required";
  if (v.length > 120) return "Name must be at most 120 characters";
  return null;
}

/**
 * Validate HTTPS (or http localhost) payload URL.
 */
export function validateWebhookUrl(url: string): string | null {
  const v = url.trim();
  if (!v) return "URL is required";
  try {
    const parsed = new URL(v);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "URL must use http or https";
    }
    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      return "HTTP is only allowed for localhost; use HTTPS in production";
    }
    return null;
  } catch {
    return "URL must be a valid absolute URL";
  }
}

/**
 * Validate draft; returns field → error map.
 */
export function validateWebhookDraft(draft: WebhookDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const nameErr = validateWebhookName(draft.name);
  if (nameErr) errors.name = nameErr;
  const urlErr = validateWebhookUrl(draft.url);
  if (urlErr) errors.url = urlErr;
  if (!draft.events?.length) {
    errors.events = "Select at least one event";
  }
  return errors;
}

/**
 * Filter webhooks by free-text search on name/url.
 */
export function filterWebhooksByQuery<T extends { name: string; url: string }>(
  rows: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.name.toLowerCase().includes(q) || r.url.toLowerCase().includes(q));
}

/** Re-export for webhook modules that import local utils only */
export { clientJsonHeaders } from "@utils/security/client-csrf";
