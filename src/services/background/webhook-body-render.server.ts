/**
 * @file src/services/background/webhook-body-render.server.ts
 * @description Server-only webhook body rendering and event-payload shape resolution.
 *
 * Split from `webhook-body.ts` so the admin form imports the shared validators
 * without shipping the renderer and payload resolvers to the browser — the
 * static-client boundary gate reports any module that both graphs import.
 *
 * ### Features:
 * - Fixed-placeholder rendering (no eval, functions, or property paths)
 * - One-pass substitution, so substituted values containing `{{…}}` stay literal
 * - 64 KiB rendered-body guard with a typed error the delivery job maps to a permanent failure
 * - Defensive collection / entry-id resolution across the non-uniform event payloads
 */

import { WEBHOOK_BODY_TEMPLATE_MAX_BYTES, utf8ByteLength } from "./webhook-body";

const PLACEHOLDER_PATTERN = /\{\{\s*(event|collection|entryId|timestamp|webhookId|payload)\s*\}\}/g;

type JsonRecord = Record<string, unknown>;

export interface WebhookBodyTemplateContext {
  event: string;
  collection?: string;
  entryId?: string;
  timestamp: string;
  webhookId: string;
  payload: unknown;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function readIdentifier(record: JsonRecord | undefined, key: string): string | undefined {
  const value = record?.[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Resolve the collection an event belongs to.
 *
 * Entry events arrive in several shapes (outbox `{ collection }`, SDK
 * `{ collectionName }`, workflow `{ data: { collection } }`), while media,
 * config, backup and package events legitimately carry no collection. The
 * first non-empty known key wins; `undefined` means "not collection-scoped".
 */
export function resolveWebhookCollection(payload: unknown): string | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;

  const direct = readIdentifier(root, "collection") ?? readIdentifier(root, "collectionName");
  if (direct) return direct;

  for (const key of ["data", "entry", "document"] as const) {
    const nested = readIdentifier(asRecord(root[key]), "collection");
    if (nested) return nested;
  }

  return undefined;
}

/** Best-effort entry id for `{{entryId}}`; empty when the payload has no entry. */
export function resolveWebhookEntryId(payload: unknown): string | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;

  const direct = readIdentifier(root, "entryId") ?? readIdentifier(root, "id");
  if (direct) return direct;

  for (const key of ["entry", "document", "data"] as const) {
    const nested = asRecord(root[key]);
    const id = readIdentifier(nested, "id") ?? readIdentifier(nested, "_id");
    if (id) return id;
  }

  return undefined;
}

/** JSON serialization that cannot abort a delivery on a circular payload. */
export function serializeWebhookPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload) ?? "null";
  } catch {
    // catch-allow: a circular payload must still produce a deliverable body.
    return "null";
  }
}

export class WebhookBodyTooLargeError extends Error {
  public readonly bytes: number;

  constructor(bytes: number) {
    super(
      `Rendered webhook body is ${bytes} bytes; the limit is ${WEBHOOK_BODY_TEMPLATE_MAX_BYTES} bytes`,
    );
    this.name = "WebhookBodyTooLargeError";
    this.bytes = bytes;
  }
}

/**
 * Render a body template. One pass over the template, so substituted values
 * that happen to contain `{{…}}` are never re-interpreted.
 */
export function renderWebhookBody(template: string, context: WebhookBodyTemplateContext): string {
  const values: Record<string, string> = {
    event: context.event,
    collection: context.collection ?? "",
    entryId: context.entryId ?? "",
    timestamp: context.timestamp,
    webhookId: context.webhookId,
    payload: serializeWebhookPayload(context.payload),
  };

  const rendered = template.replace(
    PLACEHOLDER_PATTERN,
    (match: string, name: string) => values[name] ?? match,
  );

  const bytes = utf8ByteLength(rendered);
  if (bytes > WEBHOOK_BODY_TEMPLATE_MAX_BYTES) {
    throw new WebhookBodyTooLargeError(bytes);
  }

  return rendered;
}
