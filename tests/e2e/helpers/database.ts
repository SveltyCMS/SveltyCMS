/**
 * @file tests/e2e/helpers/database.ts
 * @description Shared database reset/seed helpers for Playwright E2E tests.
 */

import { expect, type Page } from "@playwright/test";
import { ADMIN_CREDENTIALS } from "./auth";
import { TEST_API_HEADERS } from "./test-api";

/** Reset and seed the test database with the default admin user */
export async function resetAndSeedDatabase(page: Page) {
  const resetResponse = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: { action: "reset" },
  });
  expect(resetResponse.ok()).toBeTruthy();

  const seedResponse = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "seed",
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password,
    },
  });
  expect(seedResponse.ok()).toBeTruthy();
}
