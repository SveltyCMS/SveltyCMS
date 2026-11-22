/**
 * @file src/services/background/webhook-body.ts
 * @description Shared (browser-safe) webhook filter/body validation and merge helpers.
 *
 * The renderer and payload resolvers live in `webhook-body-render.server.ts`:
 * the admin form needs only these validators, and keeping the renderer out of
 * the shared module keeps it out of the client graph.
 *
 * ### Features:
 * - Fixed-placeholder list and 64 KiB cap shared by the admin form and the delivery handler
 * - UTF-8 byte counting, so the cap is not silently raised by multi-byte content
 * - Validation + merge semantics for `collection` and `bodyTemplate`
 * - Collection match rule where either side being absent / `"*"` means "all"
 */

export const WEBHOOK_BODY_TEMPLATE_MAX_BYTES = 64 * 1024;

/** Literal placeholders the renderer understands; everything else stays literal. */
export const WEBHOOK_BODY_TEMPLATE_PLACEHOLDERS = [
  "{{event}}",
  "{{collection}}",
  "{{entryId}}",
  "{{timestamp}}",
  "{{webhookId}}",
  "{{payload}}",
] as const;

/** UTF-8 byte length, so the cap is not silently raised by multi-byte content. */
export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Validation message for a collection filter, or `undefined` when valid. */
export function webhookCollectionError(collection: unknown): string | undefined {
  if (collection === undefined || collection === "") return undefined;
  if (typeof collection !== "string" || !collection.trim()) {
    return 'collection must be a non-empty string, "*", or empty to match all collections';
  }
  return undefined;
}

/** Validation message for a body template, or `undefined` when valid. */
export function webhookBodyTemplateError(bodyTemplate: unknown): string | undefined {
  if (bodyTemplate === undefined || bodyTemplate === "") return undefined;
  if (typeof bodyTemplate !== "string") return "Webhook body template must be a string";
  const bytes = utf8ByteLength(bodyTemplate);
  if (bytes > WEBHOOK_BODY_TEMPLATE_MAX_BYTES) {
    return `Webhook body template is ${bytes} bytes; the limit is ${WEBHOOK_BODY_TEMPLATE_MAX_BYTES} bytes`;
  }
  return undefined;
}

/** Omitted (`undefined`) keeps the stored value; an explicit empty string clears it. */
export function mergeWebhookCollection(
  incoming: string | undefined,
  existing: string | undefined,
): string | undefined {
  if (incoming === undefined) return existing;
  const trimmed = incoming.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Omitted (`undefined`) keeps the stored value; an explicit empty string clears it. */
export function mergeWebhookBodyTemplate(
  incoming: string | undefined,
  existing: string | undefined,
): string | undefined {
  if (incoming === undefined) return existing;
  return incoming === "" ? undefined : incoming;
}

/**
 * A collection filter only rejects when both sides name a collection.
 * Undefined / `"*"` on either side means "all collections", and events that
 * carry no collection (media, config, packages) are never filtered out.
 */
export function webhookCollectionMatches(filter: unknown, payloadCollection: unknown): boolean {
  // Stored config is JSON: a malformed non-string value must not break dispatch.
  const configured = typeof filter === "string" ? filter.trim() : "";
  if (!configured || configured === "*") return true;

  const resolved = typeof payloadCollection === "string" ? payloadCollection.trim() : "";
  if (!resolved || resolved === "*") return true;

  return configured === resolved;
}
