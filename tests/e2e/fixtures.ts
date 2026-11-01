/**
 * @file tests/e2e/fixtures.ts
 * @description Public entry point for every E2E spec.
 *
 * The implementation lives in `fixtures/base.ts` (hard-failing page-error and
 * console-error guards). Specs import `test`/`expect` from here; the module
 * re-exports the guarded `test` plus the whole Playwright surface (types such as
 * `Page`, `Locator`, `APIRequestContext`), so only the module specifier differs
 * from `@playwright/test`.
 */

export * from "./fixtures/base";
export { expect, test } from "./fixtures/base";
