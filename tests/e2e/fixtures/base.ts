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
 * Known browser-internal noise lives in `BROWSER_NOISE` (and is also filtered at
 * capture time by the helper). Anything that is a real product error must not be
 * added there - if a spec legitimately visits a broken page, it opts out with
 * `test.use({ zeroErrorGuard: false })`, which is visible in review.
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
  /api\.iconify\.design/i,
];

const isNoise = (text: string): boolean => BROWSER_NOISE.some((re) => re.test(text));

/** Global escape hatch for a run, never for a single spec (per-spec opt-out is `zeroErrorGuard: false`). */
const GUARD_DISABLED = process.env.ZERO_ERROR_GUARD === "off";

export type GuardOptions = {
  /** Set to false in a spec that deliberately visits a broken page or a third party. */
  zeroErrorGuard: boolean;
};

export const test = base.extend<GuardOptions>({
  zeroErrorGuard: [true, { option: true }],

  page: async ({ page, zeroErrorGuard }, use) => {
    if (GUARD_DISABLED || !zeroErrorGuard) {
      await use(page);
      return;
    }

    attachZeroErrorGuard(page);
    await use(page);

    const ctx = getZeroErrorContext(page);

    const consoleErrors = ctx.consoleErrors.filter((entry) => !isNoise(entry));
    const failedRequests = ctx.failedRequests.filter((entry) => !isNoise(entry));

    // 1. Uncaught exceptions: always fatal. This is the M3 class.
    expect(
      ctx.pageErrors,
      `[E2E PageError Guard] Uncaught page exception(s):\n${ctx.pageErrors.join("\n\n")}`,
    ).toEqual([]);

    // 2. console.error: fatal, minus browser-internal noise.
    expect(
      consoleErrors,
      `[E2E Console Error Guard] Unexpected console.error(s):\n${consoleErrors.join("\n\n")}`,
    ).toEqual([]);

    // 3. Failed requests and same-origin 5xx: fatal, minus noise.
    expect(
      failedRequests,
      `[E2E Network Guard] Failed request(s):\n${failedRequests.join("\n")}`,
    ).toEqual([]);

    expect(
      ctx.serverErrors,
      `[E2E Server Guard] Unhandled server error(s) (HTTP 5xx):\n${ctx.serverErrors.join("\n")}`,
    ).toEqual([]);
  },
});

export { expect };
