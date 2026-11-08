/**
 * @file src/utils/rethrow.ts
 * @description Framework-signal passthrough for `catch` blocks.
 *
 * A redirect or an HTTP error raised by SvelteKit is control flow, not a
 * failure: wrapping it in a generic error changes the response the user gets.
 * `rethrow` forwards those signals untouched and is a no-op for everything
 * else, so it is safe to call at the top of every `catch`.
 *
 * It lives in its own module because client code needs it while it must not
 * reach the server-side error machinery (`AppError`, response formatting,
 * logging). `@utils/error-handling` re-exports both names for server callers.
 *
 * Features:
 * - `isHttpError` inspects `status` + `body` for cross-bundle resilience
 * - No dependencies beyond `@sveltejs/kit`
 */

import { isRedirect, type HttpError } from "@sveltejs/kit";

/** True when `err` is a SvelteKit HTTP error (4xx/5xx) carrying a body. */
export function isHttpError(err: unknown): err is HttpError {
  if (typeof err !== "object" || err === null) return false;
  if (!("status" in err) || !("body" in err)) return false;
  const status = (err as { status: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 600;
}

/**
 * Re-throws redirects and HTTP errors so SvelteKit can handle them natively.
 * For all other errors this is a no-op. Call at the top of every catch block
 * to prevent accidental wrapping of framework signals.
 */
export function rethrow(err: unknown): void {
  if (isRedirect(err) || isHttpError(err)) throw err;
}
