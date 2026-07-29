/**
 * @file src/utils/response-headers.ts
 * @description ETag and conditional response helpers for HTTP caching.
 *
 * ### Hardening (audit 2026-07):
 * - Cache-Control: added 'no-cache' to force ETag revalidation on every request
 * - Multi-ETag support: split/map/some for RFC 7232 compliance (comma-separated tags)
 * - Quote injection prevention: escapes embedded double-quotes in ETag values
 * - Performance: some() for early exit on first ETag match
 *
 * Features:
 * - ETag generation from content versions
 * - If-None-Match conditional request evaluation
 * - Cache-Control header management
 */

/**
 * Sets the ETag header and Cache-Control directives.
 * 🛡️ Security: Enforces 'no-cache' for dynamic content to ensure revalidation.
 */
export function setETag(headers: Headers, contentVersion: string | number): void {
  // ETag must be a quoted string per RFC 7232
  const etag = `"${String(contentVersion).replace(/"/g, '\\"')}"`;

  headers.set("ETag", etag);

  // 'no-cache' forces the browser to revalidate with the server before using the cache,
  // making the ETag effective. 'private' ensures CDNs/proxies don't cache sensitive data.
  headers.set("Cache-Control", "private, no-cache, must-revalidate");
}

/**
 * Evaluates an incoming request for conditional GET (304 Not Modified).
 * 🚀 Performance: Uses some() to stop at the first match.
 */
export function isNotModified(request: Request, contentVersion: string | number): boolean {
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (!ifNoneMatch) return false;

  const currentVersion = String(contentVersion);

  // Split by comma (to handle multiple ETags) and normalize quotes
  const etags = ifNoneMatch.split(",").map((tag) => tag.trim().replace(/^"?|"?$/g, ""));

  // 🚀 Performance: Use some() to stop at the first match
  return etags.some((tag) => tag === currentVersion);
}
