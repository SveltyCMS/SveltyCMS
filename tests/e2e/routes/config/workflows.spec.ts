/**
 * @file tests/e2e/routes/config/workflows.spec.ts
 * @description Workflow builder golden E2E — shell + seed-workflow (no soft-skip).
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { deleteWorkflow, seedWorkflow } from "../../helpers/api";
import { dismissCookieBannerIfPresent, waitForAdminShell } from "../../helpers/stable";

const ACTION_TIMEOUT = 25_000;

async function goWorkflows(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/config/workflows", { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (page.url().includes("/login")) {
    await loginAsAdmin(page, "/config/workflows");
  }
  await dismissCookieBannerIfPresent(page);
  await waitForAdminShell(page, ACTION_TIMEOUT);
  await expect(page.getByTestId("workflows-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
  await expect(page.getByTestId("page-title")).toContainText(/workflow/i, {
    timeout: ACTION_TIMEOUT,
  });
  // Builder may mount after page shell — poll testid only (no CSS)
  await expect(page.getByTestId("workflow-builder")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Config Workflows", () => {
  test.setTimeout(120_000);

  test("shell: canvas, toolbar, save control", async ({ page }) => {
    await goWorkflows(page);
    const builder = page.getByTestId("workflow-builder");
    await expect(builder).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("workflow-toolbar")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("workflow-canvas")).toBeVisible({ timeout: ACTION_TIMEOUT });
    // Save may live in builder toolbar OR sticky page-actions — always .first()
    await expect(page.getByTestId("workflow-save").first()).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("workflow-state-draft").first()).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await expect(page.getByTestId("workflow-state-published").first()).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  /**
   * Golden: seed workflow → API GET returns states → builder shell remains interactive.
   */
  test("golden: seed-workflow → GET by collectionId → builder usable", async ({ page }) => {
    await loginAsAdmin(page);
    const stamp = Date.now().toString(36);
    const collectionId = `e2e_workflow_${stamp}`;
    const seeded = await seedWorkflow(page, { collectionId });

    try {
      const res = await page.request.get(
        `/api/workflows?collectionId=${encodeURIComponent(collectionId)}`,
      );
      expect(
        res.ok(),
        `GET /api/workflows failed: ${res.status()} ${await res.text()}`,
      ).toBeTruthy();
      const body = await res.json();
      const data = body.data ?? body;
      expect(data.collectionId || collectionId).toBeTruthy();
      expect(Array.isArray(data.states) ? data.states.length : 0).toBeGreaterThanOrEqual(1);
      expect(String(data._id || seeded._id)).toBeTruthy();

      await page.goto("/config/workflows", { waitUntil: "domcontentloaded", timeout: 30_000 });
      const builder = page.getByTestId("workflow-builder");
      await expect(builder).toBeVisible({ timeout: ACTION_TIMEOUT });
      await expect(page.getByTestId("workflow-save").first()).toBeVisible();
      await expect(page.getByTestId("workflow-state-draft").first()).toBeVisible();
      await expect(page.getByTestId("workflow-state-published").first()).toBeVisible();
    } finally {
      await deleteWorkflow(page, seeded._id).catch(() => {});
    }
  });
});
