/**
 * @file src/routes/api/[...path]/handlers/base.ts
 * @description Common types and response helpers for API handlers.
 */

import { json } from "@sveltejs/kit";

/**
 * Standard success response wrapper
 */
export function successResponse(data: any, status = 200) {
  return json({ success: true, data }, { status });
}

/**
 * Raw response for endpoints that expect specific shapes (e.g. legacy/third-party)
 */
export function rawResponse(data: any, status = 200) {
  return json(data, { status });
}

/**
 * Standard created response wrapper (201)
 */
export function createdResponse(data: any) {
  return json({ success: true, data }, { status: 201 });
}

/**
 * Type-safe extraction of URL segments for the dispatcher
 */
export function getSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}
