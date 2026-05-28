/**
 * @file src/routes/api/[...path]/handlers/base.ts
 * @description Common response utilities, type guards, and helpers for API handlers.
 *
 * Features:
 * - Standardized success/error/created response wrappers
 * - DatabaseResult auto-unwrapping to prevent nested wrappers
 * - Type-safe segment extraction from catch-all route paths
 * - Middleware-compatible locals storage for debugging
 */

import { AppError } from "@utils/error-handling";
import { json, type RequestEvent } from "@sveltejs/kit";

// ─── Response Helpers ────────────────────────────────────────────────────────

/**
 * Standard success response wrapper.
 * Automatically detects and unwraps DatabaseResult objects to prevent
 * nested `{ success: true, data: { success: true, data: ... } }` patterns.
 */
export function successResponse(event: RequestEvent, result: any, status = 200) {
  if (isDatabaseResult(result)) {
    if (!result.success) {
      return json(result, { status: result.error?.status || 400 });
    }
    const body = { success: true, data: result.data, meta: result.meta };
    stashInLocals(event, body);
    return json(body, { status });
  }

  const body = { success: true, data: result };
  stashInLocals(event, body);
  return json(body, { status });
}

/**
 * Raw response for endpoints that need custom shapes (legacy APIs,
 * third-party integrations, dashboard widgets, etc.).
 */
export function rawResponse(event: RequestEvent, data: any, status = 200) {
  stashInLocals(event, data);
  return json(data, { status });
}

/**
 * Convenience wrapper for 201 Created responses.
 */
export function createdResponse(event: RequestEvent, data: any) {
  const body = { success: true, data };
  stashInLocals(event, body);
  return json(body, { status: 201 });
}

/**
 * Standardized error response with optional error code.
 */
export function errorResponse(event: RequestEvent, message: string, status = 400, code?: string) {
  const body: Record<string, any> = { success: false, message };
  if (code) body.error = { code, status };
  stashInLocals(event, body);
  return json(body, { status });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts clean segments from the catch-all route path.
 * Strips the leading "api/" prefix so the dispatcher sees e.g. ["user", "me"]
 * instead of ["api", "user", "me"].
 */
export function getSegments(path: string): string[] {
  return path
    .split("/")
    .filter(Boolean)
    .filter((s) => s !== "api");
}

/**
 * Type guard for DatabaseResult pattern used across all adapters.
 */
export function isDatabaseResult(obj: any): obj is {
  success: boolean;
  data?: any;
  message?: string;
  meta?: any;
  error?: { status: number };
} {
  return obj && typeof obj === "object" && typeof (obj as any).success === "boolean";
}

/**
 * Not-allowed helper — throws a 405 for unsupported HTTP methods.
 */
export function notAllowed(): never {
  throw new AppError("Method not allowed", 405);
}

// ─── Internal ────────────────────────────────────────────────────────────────

/** Stores response data in event.locals for middleware/logging/debugging. */
function stashInLocals(event: RequestEvent, data: any) {
  if (event?.locals) (event.locals as any).apiData = data;
}
