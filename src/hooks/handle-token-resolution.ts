/**
 * @file src/hooks/handle-token-resolution.ts
 * @description
 * Hardened RBAC-aware token resolution with content-length synchronization and size-safety checks.
 *
 * Rewrites token placeholders in JSON API payloads using the caller's roles/tenant.
 * Rebuilds Response with mutable headers + updated Content-Length after mutation.
 *
 * ### Features:
 * - Compressed bodies (Content-Encoding) pass through untouched — decompression runs in a later hook
 * - JSON primitives (true / 42 / "OK") pass through untouched — only objects/arrays are rewritten
 */

import { processTokensInResponse } from "@src/services/token/helper";
import {
  applyFieldPermissionsToBody,
  getCollectionFromPath,
} from "@src/services/security/field-permission-service";
import type { Handle } from "@sveltejs/kit/hooks";
import { handleApiError } from "@utils/error-handling";

const MAX_JSON_SIZE = 5 * 1024 * 1024;
const EXCLUDED_PREFIXES = [
  "/api/system",
  "/api/dashboard",
  "/api/auth",
  "/api/token",
  "/api/graphql",
];

export const handleTokenResolution: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;

  // Fast-path triage before resolve to save microtask cycles
  if (!pathname.startsWith("/api/")) return resolve(event);

  if (event.request.headers.get("X-Svelty-Internal") === "true") return resolve(event);

  for (let i = 0; i < EXCLUDED_PREFIXES.length; i++) {
    if (pathname.startsWith(EXCLUDED_PREFIXES[i])) return resolve(event);
  }

  try {
    const response = await resolve(event);

    const status = response.status;
    if (status < 200 || status >= 300 || status === 204) return response;

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) return response;

    // Never read a compressed body as text: gzip/br bytes would fail JSON.parse
    // (500s). Token resolution must run BEFORE compression layers, so skip any
    // response that is already content-encoded.
    if (response.headers.has("content-encoding")) return response;

    // Size gating on both content-length and actual body
    const contentLengthStr = response.headers.get("content-length");
    if (contentLengthStr) {
      const contentLength = parseInt(contentLengthStr, 10);
      if (!isNaN(contentLength) && contentLength > MAX_JSON_SIZE) return response;
    }

    // 🚀 Avoid a second response.clone().text() on the hot path. buildJsonResponse
    // (routes/api/[...path]/handlers/base.ts) already stashes BOTH the serialized
    // body (`apiBody`) and the raw payload (`apiData`) into locals for every
    // standard API response. Prefer those over re-reading the body — cloning +
    // text() re-serializes the entire payload on every request (token-free ones
    // included), a pure cost for a check that almost always returns early.
    const apiBody = (event.locals as any).apiBody;
    const apiData = (event.locals as any).apiData ?? (event.locals as any).__apiData;
    let responseText: string;

    if (typeof apiBody === "string") {
      responseText = apiBody;
    } else if (apiData !== undefined) {
      responseText = typeof apiData === "string" ? apiData : JSON.stringify(apiData);
    } else {
      const clonedResponse = response.clone();
      responseText = await clonedResponse.text();
    }

    if (responseText.length > MAX_JSON_SIZE || !responseText.includes("{{")) return response;

    let body: any;
    try {
      body = JSON.parse(responseText);
    } catch {
      return response;
    }

    // JSON primitives (true / 42 / "OK") are valid payloads but carry no fields
    // or tokens to rewrite — pass them through untouched. Arrays are typeof
    // "object" and still flow through.
    if (!body || typeof body !== "object") return response;

    // 🔐 FIELD-LEVEL PERMISSIONS: strip fields the caller's role may not read
    // (e.g. editor sees title/body but not internal_notes). Runs only when a
    // FIELD_PERMISSIONS policy exists for this collection+role — otherwise the
    // body passes through untouched with zero cost.
    const fieldFiltered = applyFieldPermissionsToBody(
      body,
      getCollectionFromPath(pathname),
      (event.locals as any).user?.role,
      (event.locals as any).isAdmin === true,
    );

    const processed = await processTokensInResponse(
      fieldFiltered,
      event.locals.user || undefined,
      (event.locals as any).contentLanguage || "en",
      {
        tenantId: (event.locals as any).tenantId,
        roles: (event.locals as any).roles,
      },
    );

    const serializedPayload = JSON.stringify(processed);

    // Recalculate Content-Length for mutated payload
    const mutableHeaders = new Headers(response.headers);
    mutableHeaders.set("Content-Length", String(Buffer.byteLength(serializedPayload, "utf-8")));
    mutableHeaders.set("X-Token-Resolved", "true");

    return new Response(serializedPayload, {
      status: response.status,
      statusText: response.statusText,
      headers: mutableHeaders,
    });
  } catch (err) {
    return handleApiError(err, event);
  }
};
