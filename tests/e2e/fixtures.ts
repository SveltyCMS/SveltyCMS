/**
 * @file tests/e2e/fixtures.ts
 * @description Single entry point for every E2E spec, so no journey can silently
 * regress with an uncaught browser exception again.
 *
 * Background: the 2026-10-31 audit found a `RangeError: Maximum call stack size
 * exceeded` that had been visible in the console for weeks before anyone clicked
 * Delete (finding M3). The repository already had a zero-error helper
 * (`helpers/zero-error-guard.ts`), but only 3 of 68 specs attached it — the guard
 * was opt-in, so the bug walked straight past it.
 *
 * This module extends Playwright's `test` with an AUTOMATIC guard:
 *
 * - every test gets the guard attached before it runs (no spec has to remember),
 * - uncaught page errors (`pageerror`) ALWAYS fail the test — that is the M3 class,
 * - console errors, failed requests and same-origin HTTP 5xx are collected and
 *   printed in the failure output; they fail the test only with
 *   `ZERO_ERROR_STRICT=1`, because the harness produces known noise and a
 *   wall-to-wall strict flip would be a separate, reviewable step,
 * - a spec opts out with `test.use({ zeroErrorGuard: false })` — visible in
 *   review, unlike a forgotten import.
 *
 * Specs import `test`/`expect` from here instead of `@playwright/test`; everything
 * else (types such as `Page`, `Locator`, `APIRequestContext`) is re-exported, so
 * only the module specifier changes.
 */

import { expect, test as base } from "@playwright/test";
import { attachZeroErrorGuard, getZeroErrorContext } from "./helpers/zero-error-guard";

// Re-export the whole Playwright surface. The explicit `test`/`expect` below
// shadow the star export, so specs get the guarded `test`.
export * from "@playwright/test";

const STRICT = process.env.ZERO_ERROR_STRICT === "1";

export type GuardOptions = {
  /** Set to false in a spec that deliberately visits a broken page or a third party. */
  zeroErrorGuard: boolean;
};

export const test = base.extend<GuardOptions>({
  zeroErrorGuard: [true, { option: true }],

  page: async ({ page, zeroErrorGuard }, use, testInfo) => {
    if (!zeroErrorGuard) {
      await use(page);
      return;
    }

    attachZeroErrorGuard(page);
    await use(page);

    const ctx = getZeroErrorContext(page);
    const noisy = [
      ...ctx.consoleErrors.map((e) => `console.error: ${e}`),
      ...ctx.failedRequests.map((e) => `failed request: ${e}`),
      ...ctx.serverErrors.map((e) => `server error: ${e}`),
    ];

    // Uncaught exceptions are never acceptable, in any spec, in any mode.
    expect(
      ctx.pageErrors,
      `Uncaught browser page errors detected:\n${ctx.pageErrors.join("\n\n")}`,
    ).toEqual([]);

    if (STRICT) {
      expect(
        noisy,
        `Browser/wire errors detected (ZERO_ERROR_STRICT=1):\n${noisy.join("\n")}`,
      ).toEqual([]);
    } else if (noisy.length > 0) {
      // Visible in the report without failing an otherwise green journey; the
      // strict switch (and the audit's console-error class) rides on this list.
      await testInfo.attach("browser-errors-not-fatal", {
        body: noisy.join("\n"),
        contentType: "text/plain",
      });
      // eslint-disable-next-line no-console
      console.warn(
        `[zero-error-guard] ${noisy.length} non-fatal browser error(s):\n${noisy.join("\n")}`,
      );
    }
  },
});

export { expect };
