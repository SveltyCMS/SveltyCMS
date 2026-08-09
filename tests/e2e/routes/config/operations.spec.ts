/**
 * @file tests/e2e/routes/config/operations.spec.ts
 * @description E2E for operations config pages — monitor, queue (testids + filters + delete job confirm).
 * System-settings deep coverage lives in system/settings.spec.ts.
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

const ACTION_TIMEOUT = 20_000;

async function loginAndGo(page: Page, path: string) {
  await loginAsAdmin(page);
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
}

// Tests are independent (read-only page loads + URL-filter toggle) — no serial
// mode needed, so the file parallelizes across workers on local runs.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Operations Pages", () => {
  test.setTimeout(90_000);

  test("monitor page loads with stats and service health", async ({ page }) => {
    await loginAndGo(page, "/config/monitor");
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("page-title")).toContainText(/monitor/i);
    await expect(page.getByTestId("monitor-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("monitor-stats")).toBeVisible();
    await expect(page.getByTestId("monitor-card-security")).toBeVisible();
    await expect(page.getByTestId("monitor-card-system")).toBeVisible();
    await expect(page.getByTestId("monitor-service-health")).toBeVisible();
    await expect(page.getByTestId("monitor-overall-state")).toBeVisible();
    await expect(page.getByTestId("monitor-link-settings")).toBeVisible();
  });

  test("queue page loads with stats and jobs table", async ({ page }) => {
    await loginAndGo(page, "/config/queue");
    await expect(page.getByTestId("page-title")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("page-title")).toContainText(/queue/i);
    await expect(page.getByTestId("queue-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("queue-stats")).toBeVisible();
    await expect(page.getByTestId("queue-stat-total")).toBeVisible();
    await expect(page.getByTestId("queue-jobs-table")).toBeVisible();
    await expect(page.getByTestId("queue-refresh")).toBeVisible();
    await expect(page.getByTestId("queue-clear-completed")).toBeVisible();
  });

  test("delete job confirm dialog removes the job row", async ({ page }) => {
    // No `seed-job` action exists in the testing API, so create a job through
    // the existing admin API path (`POST /api/system-jobs` — the queue page's
    // own data source, requires `system:settings`).
    await loginAsAdmin(page);
    const taskType = `e2e-delete-${Date.now().toString(36)}`;
    const createRes = await page.request.post("/api/system-jobs", {
      data: { taskType, payload: { source: "operations.spec" } },
    });
    expect(createRes.ok(), `create job HTTP ${createRes.status()}`).toBeTruthy();
    const createBody = await createRes.json().catch(() => ({}));
    const jobId = String(createBody?.data?._id || createBody?.data?.id || "");
    expect(
      jobId,
      `system-jobs create must return a job id: ${JSON.stringify(createBody).slice(0, 300)}`,
    ).toBeTruthy();

    try {
      await page.goto("/config/queue", { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect(page.getByTestId("queue-page")).toBeVisible({ timeout: ACTION_TIMEOUT });

      // The seeded job row is visible with its task type.
      const row = page.locator("tr", { hasText: taskType });
      await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT });

      // Delete via the row action and confirm in the portal dialog.
      await row.getByTestId("queue-job-delete").click();
      const confirmBtn = page.getByTestId("modal-confirm");
      await expect(confirmBtn).toBeVisible({ timeout: ACTION_TIMEOUT });
      await confirmBtn.click();

      // Outcome: the row is removed from the jobs table after invalidateAll.
      await expect(row).toHaveCount(0, { timeout: ACTION_TIMEOUT });
    } finally {
      // Belt-and-braces cleanup: delete the job via API if the UI journey
      // failed before the confirm (tolerates 404 when already deleted).
      await page.request
        .delete(`/api/system-jobs/${encodeURIComponent(jobId)}`)
        .catch(() => undefined);
    }
  });

  test("queue status filter updates URL", async ({ page }) => {
    await loginAndGo(page, "/config/queue");
    await expect(page.getByTestId("queue-stat-failed")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await page.getByTestId("queue-stat-failed").click();
    await expect(page).toHaveURL(/status=failed/, { timeout: ACTION_TIMEOUT });
    await expect(page.getByTestId("queue-filter-badge")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await page.getByTestId("queue-clear-filter").click();
    await expect(page).not.toHaveURL(/status=failed/, { timeout: ACTION_TIMEOUT });
  });

  test("extensions page loads", async ({ page }) => {
    await loginAndGo(page, "/config/extensions");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });
});
