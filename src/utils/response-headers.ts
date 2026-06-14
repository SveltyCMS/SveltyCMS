/**
 * @file src/utils/response-headers.ts
 * @description ETag and conditional response helpers for HTTP caching.
 *
 * Features:
 * - ETag generation from content versions
 * - If-None-Match conditional request evaluation
 * - Cache-Control header management
 */

/**
 * Sets the ETag header on a response Headers object.
 * The ETag value is derived from the content version, allowing clients
 * to perform conditional requests via If-None-Match.
 *
 * @param headers - The response Headers object to modify
 * @param contentVersion - A string or number representing the content version
 */
export function setETag(headers: Headers, contentVersion: string | number): void {
  const etag = `"${String(contentVersion)}"`;
  headers.set("ETag", etag);
  headers.set("Cache-Control", "private, must-revalidate");
}

/**
 * Evaluates an incoming request for conditional GET (304 Not Modified).
 *
 * Checks the `If-None-Match` header against the provided content version.
 * If they match, the client already has the latest version and a 304
 * response should be returned.
 *
 * @param request - The incoming Request object
 * @param contentVersion - A string or number representing the current content version
 * @returns `true` if the client's cached version is still fresh (return 304), `false` otherwise
 */
export function isNotModified(request: Request, contentVersion: string | number): boolean {
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (!ifNoneMatch) return false;

  // ETag values are wrapped in quotes; strip them for comparison
  const normalizedMatch = ifNoneMatch.replace(/^"?|"?$/g, "");
  return normalizedMatch === String(contentVersion);
}
