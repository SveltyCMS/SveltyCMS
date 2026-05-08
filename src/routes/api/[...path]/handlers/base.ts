/**
 * @file src/routes/api/[...path]/handlers/base.ts
 * @description Common types and response helpers for API handlers.
 */

import { json, type RequestEvent } from "@sveltejs/kit";

/**
 * Standard success response wrapper
 */
export function successResponse(event: RequestEvent, result: any, status = 200) {
  // 🚀 SMART UNWRAPPING: If result is a DatabaseResult, handle it directly
  if (result && typeof result === "object" && "success" in result) {
    if (result.success === false) {
      const errorStatus = result.error?.status || 500;
      return json(result, { status: errorStatus });
    }
    // Unwrap successful DatabaseResult to avoid { success: true, data: { success: true, data: ... } }
    const body = { success: true, data: result.data, meta: result.meta };
    if (event?.locals) (event.locals as any).apiData = body;
    return json(body, { status });
  }

  const body = { success: true, data: result };
  if (event?.locals) (event.locals as any).apiData = body;
  return json(body, { status });
}

/**
 * Raw response for endpoints that expect specific shapes (e.g. legacy/third-party)
 */
export function rawResponse(event: RequestEvent, data: any, status = 200) {
  if (event?.locals) (event.locals as any).apiData = data;
  return json(data, { status });
}

/**
 * Standard created response wrapper (201)
 */
export function createdResponse(event: RequestEvent, data: any) {
  const body = { success: true, data };
  if (event?.locals) (event.locals as any).apiData = body;
  return json(body, { status: 201 });
}

/**
 * Type-safe extraction of URL segments for the dispatcher
 */
export function getSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}
