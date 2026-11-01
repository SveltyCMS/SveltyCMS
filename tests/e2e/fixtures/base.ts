/**
 * @file tests/e2e/fixtures/base.ts
 * @description Hard-failing E2E guards: an uncaught page exception or an unexpected
 * `console.error` fails the test immediately.
 *
 * Background: the 2026-10-31 audit found a `RangeError: Maximum call stack size
 * exceeded` that had been visible in the console for weeks before anyone clicked
 * Delete (finding M3). The repository already had a zero-error helper
 * (`helpers/zero-error-guard.ts`), but only 3 of 68 specs attached it - the guard
 * was opt-in, so the bug walked straight past it.
 *
 * Both categories are FATAL here:
 * - `pageerror`  -> every uncaught browser exception,
 * - `console.error` -> every console error that is not on the whitelist below.
 *
 * ## Expecting a failure instead of disabling the guard
 *
 * Some specs deliberately drive a failing path (an expired share link, a mocked
 * 500, an ffmpeg-less transcode). The app logging an error there is correct
 * behaviour, so the spec DECLARES it instead of switching the guard off:
 *
 * ```ts
 * test.use({
 *   // explained in the spec: this case asserts the 410 error page
 *   expectedConsoleErrors: [/status of 410 \(Gone\)/],
 * });
 * ```
 *
 * Every declaration must carry a comment saying WHY the error is expected: a
 * declaration without a reason is indistinguishable from a silenced bug. Entries
 * match the captured message (substring for a string, `RegExp.test` for a
 * RegExp); anything unmatched stays fatal. `pageerror` is never expectable - an
 * uncaught exception is always a defect.
 *
 * `zeroErrorGuard: false` remains the last resort for a spec that visits a third
 * party or a deliberately broken page. Prefer a declaration: it is narrower, and
 * it documents the contract in the spec that relies on it.
 *
 * Known browser-internal noise lives in `BROWSER_NOISE` (and is also filtered at
 * capture time by the helper). Anything that is a real product error must not be
 * added there.
 */

import { expect, test as base } from "@playwright/test";
import { attachZeroErrorGuard, getZeroErrorContext } from "../helpers/zero-error-guard";

// Re-export the whole Playwright surface. The explicit `test`/`expect` below
// shadow the star export, so specs get the guarded `test`.
export * from "@playwright/test";

/**
 * Errors the browser itself produces and that are not product defects.
 * Keep this list short and justified - every entry is a blind spot.
 */
export const BROWSER_NOISE: readonly RegExp[] = [
  /ResizeObserver loop limit exceeded/i,
  /ResizeObserver loop completed with undelivered notifications/i,
  /Failed to load resource: the server responded with a status of (401|403|404)\b/i,
  /net::ERR_ABORTED/i,
  /net::ERR_FAILED/i,
  /net::ERR_NAME_NOT_RESOLVED/i,
  /favicon\.ico/i,
  /api2?\.iconify\.design/i,
  /api\.(unisvg|simplesvg)\.com/i,
  // The widget marketplace is an external service and CI runs without a CORS
  // proxy, so the browser rejects the prefetch itself: the API answers without
  // Access-Control-Allow-Origin.
  /marketplace\.sveltycms\.com.*blocked by CORS policy/i,
  // Same prefetch, reported at the network layer without the CORS explanation.
  /marketplace\.sveltycms\.com.*-> net::ERR_FAILED/i,
];

const isNoise = (text: string): boolean => BROWSER_NOISE.some((re) => re.test(text));

/** Global escape hatch for a run, never for a single spec (per-spec opt-out is `zeroErrorGuard: false`). */
const GUARD_DISABLED = process.env.ZERO_ERROR_GUARD === "off";

/** A declared expectation: substring for a string, `RegExp.test` for a RegExp. */
export type ExpectedError = string | RegExp;

const isExpected = (entry: string, expected: readonly ExpectedError[]): boolean =>
  expected.some((pattern) =>
    typeof pattern === "string" ? entry.includes(pattern) : pattern.test(entry),
  );

export type GuardOptions = {
  /** Set to false in a spec that deliberately visits a broken page or a third party. */
  zeroErrorGuard: boolean;
  /**
   * `console.error` messages this spec deliberately provokes. Every entry needs a
   * comment in the spec explaining why the app is expected to log it.
   */
  expectedConsoleErrors: ExpectedError[];
  /**
   * Same-origin HTTP 5xx this spec deliberately provokes, matched against
   * `"<METHOD> <url> -> HTTP <status>"` (a mocked 500, a missing ffmpeg, ...).
   */
  expectedServerErrors: ExpectedError[];
  /**
   * Failed requests this spec deliberately provokes, matched against
   * `"<METHOD> <url> -> <errorText>"` (scripts blocked on purpose, ...).
   */
  expectedFailedRequests: ExpectedError[];
};

export const test = base.extend<GuardOptions>({
  zeroErrorGuard: [true, { option: true }],
  expectedConsoleErrors: [[], { option: true }],
  expectedServerErrors: [[], { option: true }],
  expectedFailedRequests: [[], { option: true }],

  page: async (
    { page, zeroErrorGuard, expectedConsoleErrors, expectedServerErrors, expectedFailedRequests },
    use,
  ) => {
    if (GUARD_DISABLED || !zeroErrorGuard) {
      await use(page);
      return;
    }

    attachZeroErrorGuard(page);
    await use(page);

    const ctx = getZeroErrorContext(page);

    const consoleErrors = ctx.consoleErrors
      .filter((entry) => !isNoise(entry))
      .filter((entry) => !isExpected(entry, expectedConsoleErrors));
    const failedRequests = ctx.failedRequests
      .filter((entry) => !isNoise(entry))
      .filter((entry) => !isExpected(entry, expectedFailedRequests));
    const serverErrors = ctx.serverErrors
      .filter((entry) => !isNoise(entry))
      .filter((entry) => !isExpected(entry, expectedServerErrors));

    // 1. Uncaught exceptions: always fatal, never expectable. This is the M3 class.
    expect(
      ctx.pageErrors,
      `[E2E PageError Guard] Uncaught page exception(s):\n${ctx.pageErrors.join("\n\n")}`,
    ).toEqual([]);

    // 2. console.error: fatal, minus browser-internal noise and declared expectations.
    expect(
      consoleErrors,
      `[E2E Console Error Guard] Unexpected console.error(s):\n${consoleErrors.join("\n\n")}`,
    ).toEqual([]);

    // 3. Failed requests and same-origin 5xx: fatal, minus noise and expectations.
    expect(
      failedRequests,
      `[E2E Network Guard] Failed request(s):\n${failedRequests.join("\n")}`,
    ).toEqual([]);

    expect(
      serverErrors,
      `[E2E Server Guard] Unhandled server error(s) (HTTP 5xx):\n${serverErrors.join("\n")}`,
    ).toEqual([]);
  },
});

export { expect };
