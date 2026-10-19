/**
 * @file src/utils/security/constant-time.ts
 * @description Constant-time buffer comparison shared by token and
 * share-link verification.
 *
 * Pads the shorter input to the longer length before `timingSafeEqual`, so the
 * comparison never short-circuits on a length mismatch (which would leak the
 * expected digest length). Callers must pass Buffers, never user strings.
 */

import { timingSafeEqual } from "node:crypto";

/** Compare two buffers without leaking length or content via timing. */
export function constantTimeBufferEqual(a: Buffer, b: Buffer): boolean {
  const maxLen = Math.max(a.length, b.length);
  const paddedA = Buffer.alloc(maxLen, 0);
  const paddedB = Buffer.alloc(maxLen, 0);
  a.copy(paddedA);
  b.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB);
}
