/**
 * @file tests/e2e/routes/dashboard/dashboard.spec.ts
 * @description E2E smoke tests for /dashboard — widget grid, add widget, monitoring widgets.
 */

import { test } from "@playwright/test";

test.describe("Dashboard", () => {
  // Dashboard route and widget system are on the 2026 roadmap and not yet implemented.
  // These tests will be enabled once the feature is built.
  test.skip("Dashboard route not yet implemented — see roadmap-2026.mdx", async () => {});
});
