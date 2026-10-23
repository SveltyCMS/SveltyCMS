/**
 * @file tests/e2e/helpers/zero-error-guard.ts
 * @description Zero-Error Trap fixture for Playwright E2E tests.
 *
 * Ensures that no uncaught page errors, console exceptions, or unexpected
 * failed network requests escape detection during an automated user journey.
 *
 * ### Features:
 * - captures browser runtime exceptions (`pageerror`)
 * - captures console error messages (`console.error`)
 * - records failed network requests (`requestfailed`)
 * - `assertNoZeroErrors(page)` fails the test with every captured entry
 * - idempotent attach (safe to call from multiple `beforeEach` layers)
 */

import { expect, type Page } from "@playwright/test";

export interface ErrorGuardContext {
  pageErrors: string[];
  consoleErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
}

const activeGuards = new WeakMap<Page, ErrorGuardContext>();

/**
 * Noise that is expected in the test harness and is not a product defect:
 * - favicon / icon-CDN requests are external and frequently aborted
 * - fail-closed auth probes answer 401/403/404 by design
 * - ResizeObserver depth warnings come from the browser, not our code
 */
const IGNORED_CONSOLE_PATTERNS: readonly RegExp[] = [
  /favicon\.ico/i,
  /api\.iconify\.design/i,
  /ResizeObserver loop/i,
  /net::ERR_FAILED/i,
  /net::ERR_ABORTED/i,
  /net::ERR_NAME_NOT_RESOLVED/i,
  /Failed to load resource: the server responded with a status of (401|403|404)\b/i,
];

const IGNORED_REQUEST_PATTERNS: readonly RegExp[] = [
  /api\.iconify\.design/i,
  /favicon\.ico/i,
  /net::ERR_ABORTED/i,
];

function isIgnored(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

/**
 * Attaches the zero-error trap to a Playwright page.
 * Call this in `beforeEach` or at the start of a test. Re-attaching a page
 * returns the existing context instead of registering duplicate listeners.
 */
export function attachZeroErrorGuard(page: Page): ErrorGuardContext {
  const existing = activeGuards.get(page);
  if (existing) return existing;

  const ctx: ErrorGuardContext = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
    serverErrors: [],
  };

  activeGuards.set(page, ctx);

  page.on("pageerror", (error) => {
    const msg = error.stack ?? error.message;
    ctx.pageErrors.push(msg);
    // eslint-disable-next-line no-console
    console.error("[ZeroErrorGuard] uncaught pageerror:", msg);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const locUrl = message.location()?.url || "";
    if (isIgnored(text, IGNORED_CONSOLE_PATTERNS) || isIgnored(locUrl, IGNORED_CONSOLE_PATTERNS)) {
      return;
    }
    ctx.consoleErrors.push(text);
    // eslint-disable-next-line no-console
    console.error("[ZeroErrorGuard] console.error:", text);
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    const failure = req.failure()?.errorText ?? "unknown";
    const entry = `${req.method()} ${url} -> ${failure}`;
    if (isIgnored(url, IGNORED_REQUEST_PATTERNS) || isIgnored(failure, IGNORED_REQUEST_PATTERNS)) {
      return;
    }
    ctx.failedRequests.push(entry);
    // eslint-disable-next-line no-console
    console.error(`[ZeroErrorGuard] requestfailed: ${entry}`);
  });

  // Catch same-origin HTTP 5xx responses (unhandled server errors)
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 500) {
      const url = res.url();
      let isSameOrigin = false;
      try {
        const pageOrigin = new URL(page.url()).origin;
        isSameOrigin = url.startsWith(pageOrigin) || url.startsWith("/");
      } catch {
        isSameOrigin = url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost");
      }

      if (isSameOrigin) {
        const entry = `${res.request().method()} ${url} -> HTTP ${status}`;
        ctx.serverErrors.push(entry);
        // eslint-disable-next-line no-console
        console.error(`[ZeroErrorGuard] serverError (HTTP 5xx): ${entry}`);
      }
    }
  });

  return ctx;
}

/** Returns the captured errors for a page (empty context when not attached). */
export function getZeroErrorContext(page: Page): ErrorGuardContext {
  return (
    activeGuards.get(page) ?? {
      pageErrors: [],
      consoleErrors: [],
      failedRequests: [],
      serverErrors: [],
    }
  );
}

/**
 * Asserts that the page encountered zero uncaught errors.
 * Call this in `afterEach` or at critical workflow checkpoints.
 */
export function assertNoZeroErrors(page: Page): void {
  const ctx = activeGuards.get(page);
  if (!ctx) return;

  expect(
    ctx.pageErrors,
    `Uncaught browser page errors detected:\n${ctx.pageErrors.join("\n\n")}`,
  ).toEqual([]);

  expect(
    ctx.consoleErrors,
    `Browser console.error entries detected:\n${ctx.consoleErrors.join("\n\n")}`,
  ).toEqual([]);

  expect(
    ctx.failedRequests,
    `Failed network requests detected:\n${ctx.failedRequests.join("\n")}`,
  ).toEqual([]);

  expect(
    ctx.serverErrors,
    `Unhandled server errors (HTTP 5xx) detected:\n${ctx.serverErrors.join("\n")}`,
  ).toEqual([]);
}
