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

import { AppError, type AppErrorCode } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import { safeParse, type GenericSchema, type InferOutput } from "valibot";

const STATIC_JSON_HEADERS = { "content-type": "application/json" } as const;

function buildJsonResponse(
  event: RequestEvent,
  data: any,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  let serialized = "";
  if (typeof data === "string") {
    serialized = data;
  } else if (data === undefined) {
    serialized = '{"success":true}';
  } else {
    try {
      serialized = JSON.stringify(data) ?? "{}";
    } catch {
      serialized = "{}";
    }
  }

  if (event?.locals) {
    // codeql[js/stack-trace-exposure]: same-response fast-path stash consumed
    // by token-resolution/ETag middleware; locals is never serialized into
    // responses or logs (handleApiError/handleError scrub in production).
    (event.locals as any).apiData = data;
    (event.locals as any).apiBody = serialized;
  }

  const headers: Record<string, string> = extraHeaders
    ? {
        ...STATIC_JSON_HEADERS,
        "content-length": String(Buffer.byteLength(serialized)),
        ...extraHeaders,
      }
    : {
        ...STATIC_JSON_HEADERS,
        "content-length": String(Buffer.byteLength(serialized)),
      };

  return new Response(serialized, {
    status,
    headers,
  });
}

export function successResponse(
  event: RequestEvent,
  result: any,
  status = 200,
  extraHeaders?: Record<string, string>,
) {
  let body: any;
  if (isDatabaseResult(result)) {
    if (!result.success) {
      return buildJsonResponse(event, result, result.error?.statusCode || 400, extraHeaders);
    }
    body =
      result.meta !== undefined
        ? { success: true, data: result.data, meta: result.meta }
        : { success: true, data: result.data };
  } else {
    body = { success: true, data: result };
  }

  return buildJsonResponse(event, body, status, extraHeaders);
}

/**
 * High-performance JSON response builder for pre-serialized or schema-fast payloads.
 * Bypasses intermediate wrapping object allocations.
 */
export function fastSuccessResponse(
  event: RequestEvent,
  serializedData: string,
  rawData?: any,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const serialized = `{"success":true,"data":${serializedData}}`;
  if (event?.locals) {
    // codeql[js/stack-trace-exposure]: same-response fast-path stash consumed
    // by token-resolution/ETag middleware; locals is never serialized into
    // responses or logs (handleApiError/handleError scrub in production).
    (event.locals as any).apiData = rawData;
    (event.locals as any).apiBody = serialized;
  }
  const headers: Record<string, string> = extraHeaders
    ? {
        ...STATIC_JSON_HEADERS,
        "content-length": String(Buffer.byteLength(serialized)),
        ...extraHeaders,
      }
    : {
        ...STATIC_JSON_HEADERS,
        "content-length": String(Buffer.byteLength(serialized)),
      };

  return new Response(serialized, {
    status,
    headers,
  });
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
export function errorResponse(
  event: RequestEvent,
  message: string,
  status = 400,
  code?: AppErrorCode,
) {
  const body: Record<string, any> = { success: false, message };
  if (code) body.error = { code, status };
  return buildJsonResponse(event, body, status);
}

/**
 * Parses and validates request body with a Valibot schema.
 * Throws a formatted AppError(400, "VALIDATION_FAILED") if parsing or validation fails.
 */
export async function validateRequestBody<TSchema extends GenericSchema>(
  event: RequestEvent,
  schema: TSchema,
): Promise<InferOutput<TSchema>> {
  let rawBody: unknown;
  try {
    rawBody = await event.request.json();
  } catch {
    throw new AppError("Invalid JSON body in request", 400, "BAD_REQUEST");
  }

  const result = safeParse(schema, rawBody);
  if (!result.success) {
    const issues = result.issues.map((issue) => {
      const pathKeys = issue.path
        ?.map((p: any) => p.key)
        .filter((key) => key !== undefined && key !== null)
        .join(".");
      return pathKeys ? `${pathKeys}: ${issue.message}` : issue.message;
    });
    throw new AppError(issues[0] || "Validation failed", 400, "VALIDATION_FAILED", { issues });
  }

  return result.output;
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
  error?: { code?: string; message?: string; statusCode?: number };
} {
  return obj && typeof obj === "object" && typeof (obj as any).success === "boolean";
}

/**
 * Not-allowed helper — throws a 405 for unsupported HTTP methods.
 */
export function notAllowed(): never {
  throw new AppError("Method not allowed", 405, "METHOD_NOT_ALLOWED");
}
