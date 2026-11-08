/**
 * @file src/services/sdk/namespaces/collections/http-bridge.ts
 * @description HTTP write ingestion helpers for collection endpoints and write lane.
 *
 * Features:
 * - Unwraps legacy `{ data, tenantId }` write payloads
 * - Detects publish write operations
 * - Staged draft promotion for publish operations
 * - RFC 7240 minimal write acknowledgment (`Prefer: return=minimal`)
 * - Optimistic locking / expectedVersion extraction from headers, body, and query params
 */

import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { StatusTypes } from "@src/content/types";
import type { DatabaseResult } from "@src/databases/db-interface";
import { fastSuccessResponse } from "@src/routes/api/[...path]/handlers/base";
import { fastEscapeString } from "@utils/fast-json";
import { prefersMinimalReturn } from "@utils/http-preferences";

export { prefersMinimalReturn };

/** Statuses that mean "publish" in a write payload (`published` is the workflow alias). */
export const PUBLISH_STATUSES = new Set<string>([StatusTypes.publish, "published"]);

/**
 * Admin list/edit clients historically wrapped writes as `{ data, tenantId }`.
 * Only unwrap when those are the sole keys so a real `data` widget field is preserved.
 */
export function unwrapWritePayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    let hasExtras = false;
    for (const k in obj) {
      if (Object.hasOwn(obj, k) && k !== "data" && k !== "tenantId") {
        hasExtras = true;
        break;
      }
    }
    if (!hasExtras) return obj.data;
  }
  return raw;
}

/**
 * A publish request is the only write that promotes a staged draft. A plain
 * Save keeps writing the live row from the submitted form, exactly as before.
 */
export function isPublishWrite(rawData: unknown): boolean {
  if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) return false;
  const status = (rawData as Record<string, unknown>).status;
  return typeof status === "string" && PUBLISH_STATUSES.has(status);
}

/**
 * Promote the author's staged draft for a publish request.
 *
 * `null` means "no draft for this author" and the caller keeps the historical
 * write path. A failed draft lookup is returned as-is: writing the live row from
 * the submitted form after failing to read the staged content would silently
 * drop that content, so the publish fails closed instead. The SDK method owns the
 * author/ownership gate, the live-write-first ordering and the revision snapshot.
 */
export async function promoteStagedDraft(
  cms: LocalCMS,
  collectionId: string,
  entryId: string | undefined,
  tenantId: DatabaseId,
  user: unknown,
  options: { expectedVersion?: string | number | null } = {},
): Promise<DatabaseResult<unknown> | null> {
  const draft = await cms.drafts.getDraft(collectionId, entryId, { user, tenantId });
  if (!draft.success) return draft;
  if (!draft.data) return null;

  return cms.drafts.promoteDraft(collectionId, String(draft.data._id), {
    user,
    tenantId,
    status: StatusTypes.publish,
    ...(options.expectedVersion !== undefined &&
    options.expectedVersion !== null &&
    options.expectedVersion !== ""
      ? { expectedVersion: options.expectedVersion }
      : {}),
    // Deliberately NOT `skipReturning`: that adapter path cannot tell a
    // zero-row UPDATE from a successful one, so a deleted live row would
    // "promote" and then discard the draft. Promotion is rare; read the row.
  });
}

/** RFC 7240 status-only ack shared by the create/update promotion paths and write lane. */
export function minimalWriteAck(
  event: RequestEvent,
  result: unknown,
  status = 200,
  fallbackId?: string,
  extraHeaders?: Record<string, string>,
): Response {
  let rawId: unknown = fallbackId;
  if (rawId === undefined && result && typeof result === "object") {
    const resObj = result as Record<string, unknown>;
    const data = resObj.data !== undefined ? resObj.data : resObj;
    if (data && typeof data === "object") {
      rawId = (data as Record<string, unknown>)._id ?? (data as Record<string, unknown>).id;
    }
    if (rawId === undefined) {
      rawId = resObj._id ?? resObj.id;
    }
  }
  const safeId = fastEscapeString(String(rawId ?? ""));
  return fastSuccessResponse(event, `{"_id":"${safeId}"}`, { _id: rawId }, status, extraHeaders);
}

/**
 * 🔒 OPTIMISTIC LOCKING: Extract the version the client loaded.
 * `If-Match` wins over a body field (HTTP semantics); query param is the escape hatch.
 * If present in data, `expectedVersion` is deleted from data so it is never persisted as a schema field.
 */
export function extractExpectedVersion(
  event: RequestEvent,
  data?: unknown,
): string | number | undefined;
export function extractExpectedVersion(
  request: Request,
  url: URL,
  data?: unknown,
): string | number | undefined;
export function extractExpectedVersion(
  eventOrRequest: RequestEvent | Request,
  urlOrData?: URL | unknown,
  maybeData?: unknown,
): string | number | undefined {
  let request: Request;
  let url: URL;
  let data: unknown;

  if ("request" in eventOrRequest && "url" in eventOrRequest) {
    request = eventOrRequest.request;
    url = eventOrRequest.url;
    data = urlOrData;
  } else {
    request = eventOrRequest;
    url = urlOrData as URL;
    data = maybeData;
  }

  const bodyExpected =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>).expectedVersion
      : undefined;
  if (bodyExpected !== undefined && data && typeof data === "object") {
    delete (data as Record<string, unknown>).expectedVersion;
  }

  const ifMatch = request.headers.get("if-match");
  if (ifMatch !== null && ifMatch !== "") {
    return ifMatch;
  }

  if (typeof bodyExpected === "string" || typeof bodyExpected === "number") {
    return bodyExpected;
  }

  const searchParam = url.search ? url.searchParams.get("expectedVersion") : null;
  if (searchParam !== null && searchParam !== "") {
    return searchParam;
  }

  return undefined;
}
