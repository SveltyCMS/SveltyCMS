/**
 * @file src/routes/api/[...path]/response-headers.ts
 * @description Case-insensitive merge of handler response headers with the dispatcher defaults.
 *
 * SvelteKit rejects non-verb exports from `+server.ts` (enforced by
 * `tests/unit/routes/endpoint-exports.test.ts`), so the helper lives here.
 */

/**
 * Merge a handler's response headers into the dispatcher defaults.
 *
 * HTTP header names are case-insensitive, so a handler that emits
 * `cache-control` must not add a second `Cache-Control` next to the
 * dispatcher's. The dispatcher's value wins; only novel headers are copied.
 */
export function mergeResponseHeaders(
  base: Record<string, string>,
  source: Headers,
): Record<string, string> {
  source.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    let exists = false;
    for (const existing in base) {
      if (existing.toLowerCase() === lowerKey) {
        exists = true;
        break;
      }
    }
    if (!exists) base[key] = value;
  });
  return base;
}
