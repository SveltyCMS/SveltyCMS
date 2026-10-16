/**
 * @file tests/unit/scripts/check-seam-assertions.test.ts
 * @description Self-guarding unit test for `scripts/check-seam-assertions.ts`.
 *
 * Runs the seam checker against the live repo and asserts it passes, so a future
 * weakening of any seam-critical regression guard fails the suite. Also exercises
 * the pure signal detectors against synthetic snippets to lock the heuristic.
 */

import { describe, expect, it } from "vitest";
import {
  appearsToMutate,
  checkSeamAssertions,
  detectFailurePathSignals,
  detectPersistenceSignals,
  hasFailurePathSignal,
  hasPersistenceSignal,
} from "../../../scripts/check-seam-assertions";

const ROOT = process.cwd();

describe("checkSeamAssertions (repo)", () => {
  it("passes on the current tree with every seam-critical file present", () => {
    const result = checkSeamAssertions({ rootDir: ROOT });

    expect(result.results).toHaveLength(7);
    expect(result.results.every((r) => r.pass)).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("guards the full manifest (no file silently dropped)", () => {
    const result = checkSeamAssertions({ rootDir: ROOT });
    const files = result.results.map((r) => r.file);

    expect(files).toContain("tests/e2e/routes/collection-builder/content-entries.spec.ts");
    expect(files).toContain("tests/e2e/routes/user/token-actions.spec.ts");
    expect(files).toContain("tests/e2e/routes/login/extended-auth.spec.ts");
    expect(files).toContain("tests/integration/api/token.test.ts");
    expect(files).toContain("tests/integration/routes/collection-page-load.test.ts");
    expect(files).toContain("tests/unit/routes/token-routes-handler.test.ts");
    expect(files).toContain("tests/unit/utils/error-display.test.ts");
  });
});

describe("persistence signal (E2E / integration)", () => {
  it("flags a toast-only E2E mutation (no re-read)", () => {
    const toastOnly = `
      test("delete", async ({ page }) => {
        await page.request.delete("/api/collections/x");
        await expect(page.getByText(/deleted/i)).toBeVisible();
      });
    `;
    expect(appearsToMutate(toastOnly)).toBe(true);
    expect(hasPersistenceSignal(toastOnly)).toBe(false);
    expect(detectPersistenceSignals(toastOnly)).toEqual([]);
  });

  it("accepts an E2E mutation that waits for the write and re-reads the row count", () => {
    const persisted = `
      test("delete", async ({ page }) => {
        const res = page.waitForResponse((r) => r.request().method() === "DELETE");
        await deleteBtn.click();
        await res;
        await page.reload();
        await expect(page.getByRole("row")).toHaveCount(0);
      });
    `;
    expect(hasPersistenceSignal(persisted)).toBe(true);
  });

  it("flags a toast-only integration mutation (POST then status only)", () => {
    const toastOnly = `
      it("creates", async () => {
        const res = await safeFetch(url, { method: "POST", body: "{}" });
        expect(res.status).toBe(200);
      });
    `;
    expect(appearsToMutate(toastOnly)).toBe(true);
    expect(hasPersistenceSignal(toastOnly)).toBe(false);
  });

  it("accepts an integration mutation that re-reads server truth after the write", () => {
    const persisted = `
      it("deletes then re-reads", async () => {
        const res = await safeFetch(url, { method: "DELETE" });
        expect(res.status).toBe(200);
        const check = await safeFetch(url + "/validate");
        expect(check.status).toBe(404);
      });
    `;
    expect(hasPersistenceSignal(persisted)).toBe(true);
    expect(detectPersistenceSignals(persisted)).toContain("read-after-mutation");
  });
});

describe("failure-path signal (unit)", () => {
  it("accepts a unit test that exercises the rejection/404 branch", () => {
    const failurePath = `
      it("404 on missing", async () => {
        await expect(handler()).rejects.toMatchObject({ status: 404 });
      });
    `;
    expect(hasFailurePathSignal(failurePath)).toBe(true);
    expect(detectFailurePathSignals(failurePath)).toEqual(
      expect.arrayContaining(["rejects", "404"]),
    );
  });

  it("flags a happy-path-only unit test (no failure seam)", () => {
    const happyPath = `
      it("returns 200", async () => {
        const res = await handler();
        expect(res.status).toBe(200);
      });
    `;
    expect(hasFailurePathSignal(happyPath)).toBe(false);
    expect(detectFailurePathSignals(happyPath)).toEqual([]);
  });
});
