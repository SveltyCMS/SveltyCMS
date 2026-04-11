/**
 * @file src/utils/test-worker-context.ts
 * @description Provides AsyncLocalStorage to track Playwright test worker index across asynchronous calls.
 * This allows the database adapter to switch connections per-request during parallel E2E tests.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Stores the 'x-test-worker-index' header value for the duration of a request.
 */
export const testWorkerContext = new AsyncLocalStorage<string>();
