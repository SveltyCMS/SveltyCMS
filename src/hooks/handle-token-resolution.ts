/**
 * @file src/hooks/handle-token-resolution.ts
 * @description Hardened RBAC-aware token resolution with content-length synchronization and size-safety checks.
 */

import { processTokensInResponse } from "@src/services/token/helper";
import type { Handle } from "@sveltejs/kit";
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

    // Size gating on both content-length and actual body
    const contentLengthStr = response.headers.get("content-length");
    if (contentLengthStr) {
      const contentLength = parseInt(contentLengthStr, 10);
      if (!isNaN(contentLength) && contentLength > MAX_JSON_SIZE) return response;
    }

    const clonedResponse = response.clone();
    const responseText = await clonedResponse.text();

    if (responseText.length > MAX_JSON_SIZE) return response;

    let body: any;
    try {
      body = JSON.parse(responseText);
    } catch {
      return response;
    }

    const processed = await processTokensInResponse(
      body,
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
