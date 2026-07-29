/**
 * @file src/utils/apiHandler.ts
 * @description Hardened higher-order wrapper for API endpoints.
 *
 * ### Hardening (audit 2026-07):
 * - Exception type safety: catch (err: unknown) prevents accessing properties without type guard
 * - PII-safe logging: structured metadata via logger, not console.log with raw stacks
 * - Conditional logging: duration computed only when BENCHMARK_DEBUG is active
 * - Stack trace isolation: error.stack never leaves debug mode
 *
 * Abstraction layer that eliminates try/catch blocks in individual routes.
 */

import type { RequestEvent, RequestHandler } from "@sveltejs/kit";
import { handleApiError } from "./error-handling";
import { logger } from "./logger";

const MAX_BODY_SIZE = 15 * 1024 * 1024; // 15MB

type ApiHandlerCallback = (event: RequestEvent) => Promise<Response> | Response;

/**
 * Wraps a SvelteKit RequestHandler to provide unified error handling.
 * Usage:
 * export const POST = apiHandler(async ({ request }) => {
 *   // ... logic ...
 *   // throw new AppError('Fail', 400); // Handled automatically
 *   return json({ success: true });
 * });
 * @param handler The async function containing business logic
 * @returns A standard SvelteKit RequestHandler
 */
export const apiHandler = (handler: ApiHandlerCallback): RequestHandler => {
  return async (event: RequestEvent) => {
    const start = performance.now();

    // 🛡️ DoS Prevention: reject requests with oversized bodies before parsing
    const contentLength = event.request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
      return new Response(
        JSON.stringify({
          error: "Request body exceeds maximum size",
          code: "PAYLOAD_TOO_LARGE",
        }),
        { status: 413, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const response = await handler(event);

      // 🛡️ Conditional logging: only compute duration in debug mode
      if (process.env.BENCHMARK_DEBUG === "true") {
        const duration = (performance.now() - start).toFixed(2);
        logger.info(
          `[API] ${event.request.method} ${event.url.pathname} -> ${response.status} (${duration}ms)`,
        );
      }

      return response;
    } catch (err: unknown) {
      // 🛡️ Structured error logging: no stack traces outside debug mode
      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.error("[API Error]", {
          method: event.request.method,
          path: event.url.pathname,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return handleApiError(err, event);
    }
  };
};
