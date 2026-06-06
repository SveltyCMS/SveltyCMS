/**
 * @file src/utils/apiHandler.ts
 * @description Higher-order wrapper function for API endpoints.
 * Abstraction layer that eliminates try/catch blocks in individual routes.
 */

import type { RequestEvent, RequestHandler } from "@sveltejs/kit";
import { handleApiError } from "./error-handling";

type ApiHandlerCallback = (event: RequestEvent) => Promise<Response> | Response;

/**
 * Wraps a SvelteKit RequestHandler to provide unified error handling.
 * Usage:
 * export const POST = apiHandler(async ({ request }) => {
 * // ... logic ...
 * // throw new AppError('Fail', 400); // Handled automatically
 * // parse(schema, body); // Handled automatically
 * return json({ success: true });
 * });
 * @param handler The async function containing business logic
 * @returns A standard SvelteKit RequestHandler
 */
export const apiHandler = (handler: ApiHandlerCallback): RequestHandler => {
  return async (event) => {
    const start = performance.now();
    try {
      const response = await handler(event);
      if (process.env.BENCHMARK_DEBUG === "true") {
        const duration = performance.now() - start;
        console.log(
          `[API] ${event.request.method} ${event.url.pathname} -> ${response.status} (${duration.toFixed(2)}ms)`,
        );
      }
      return response;
    } catch (err: any) {
      if (process.env.BENCHMARK_DEBUG === "true") {
        const duration = performance.now() - start;
        console.log(
          `[API] ERROR ${event.request.method} ${event.url.pathname} after ${duration.toFixed(2)}ms: ${err.message}`,
        );
        if (err.stack) console.log(err.stack);
      }
      return handleApiError(err, event);
    }
  };
};
