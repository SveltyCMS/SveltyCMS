/**
 * @file src/hooks/handle-token-resolution.ts
 * @description
 * Middleware hook for RBAC-aware token resolution in API responses.
 * Replaces dynamic tokens (e.g. [[SITE_NAME]]) with actual values based on user permissions.
 *
 * Performance:
 * - Status-gated: only processes 2xx responses.
 * - Size-gated: skips payloads > 5MB to prevent memory spikes.
 * - Internal-bypass: skips requests with X-Svelty-Internal header.
 */

import { processTokensInResponse } from "@src/services/token/helper";
import type { Handle } from "@sveltejs/kit";
import { handleApiError } from "@utils/error-handling";

const MAX_JSON_SIZE = 5 * 1024 * 1024; // 5MB limit for token processing
const EXCLUDED_PREFIXES = [
  "/api/system",
  "/api/dashboard",
  "/api/auth",
  "/api/token",
  "/api/graphql",
];

export const handleTokenResolution: Handle = async ({ event, resolve }) => {
  try {
    const response = await resolve(event);

    // 1. PERFORMANCE: Only process successful JSON API responses
    const status = response.status;
    if (status < 200 || status >= 300) return response;

    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) return response;

    const pathname = event.url.pathname;
    if (!pathname.startsWith("/api/")) return response;

    // 2. SECURITY: Bypass if internal header is present or path is excluded
    if (event.request.headers.get("X-Svelty-Internal") === "true") return response;

    if (EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return response;
    }

    // 3. PERFORMANCE: Size-gating to prevent OOM on massive responses
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_JSON_SIZE) {
      return response;
    }

    // 4. CLONE & PARSE
    // Clone response to read body (streaming-safe)
    const clonedResponse = response.clone();
    const body = await clonedResponse.json();

    // 5. RBAC-Aware Processing
    const processed = await processTokensInResponse(
      body,
      event.locals.user || undefined,
      (event.locals as any).contentLanguage || "en",
      {
        tenantId: (event.locals as any).tenantId,
        roles: (event.locals as any).roles,
      },
    );

    // Return new response with processed body
    return new Response(JSON.stringify(processed), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err) {
    // Unified error handling for token processing failures
    return handleApiError(err, event);
  }
};
