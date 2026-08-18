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
import type { RequestEvent } from "@sveltejs/kit";

function buildJsonResponse(event: RequestEvent, data: any, status = 200): Response {
  let serialized = "";
  if (typeof data === "string") {
    serialized = data;
  } else {
    try {
      serialized = JSON.stringify(data);
    } catch {
      serialized = "{}";
    }
  }

  if (event?.locals) {
    (event.locals as any).apiData = data;
    (event.locals as any).apiBody = serialized;
  }

  return new Response(serialized, {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function successResponse(event: RequestEvent, result: any, status = 200) {
  let body: any;
  if (isDatabaseResult(result)) {
    if (!result.success) {
      return buildJsonResponse(event, result, result.error?.status || 400);
    }
    body = { success: true, data: result.data, meta: result.meta };
  } else {
    body = { success: true, data: result };
  }

  return buildJsonResponse(event, body, status);
}

export function rawResponse(event: RequestEvent, data: any, status = 200) {
  return buildJsonResponse(event, data, status);
}

/**
 * Convenience wrapper for 201 Created responses.
 */
export function createdResponse(event: RequestEvent, data: any) {
  const body = { success: true, data };
  return buildJsonResponse(event, body, 201);
}

/**
 * Standardized error response with optional error code.
 */
export function errorResponse(event: RequestEvent, message: string, status = 400, code?: string) {
  const body: Record<string, any> = { success: false, message };
  if (code) body.error = { code, status };
  return buildJsonResponse(event, body, status);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts clean segments from the catch-all route path.
 * Strips the leading "api/" prefix so the dispatcher sees e.g. ["user", "me"]
 * instead of ["api", "user", "me"].
 */
export function getSegments(path: string): string[] {
  if (!path) return [];
  const parts = path.split("/");
  const segments: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    if (s && s !== "api") {
      segments.push(s);
    }
  }
  return segments;
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
