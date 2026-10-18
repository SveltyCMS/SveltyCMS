/**
 * @file tests/e2e/routes/mediagallery/folder-rbac.spec.ts
 * @description Honest RBAC check for the media folder API.
 *
 * The standard E2E harness sends `x-test-secret`, which sets `__testBypass` and
 * skips authorization entirely — so admin-only media specs stay green even when
 * the editor role cannot reach the endpoints. This spec re-enables the security
 * pipeline for the probe requests (`x-test-security: true`) and drives the real
 * dispatcher gate with an editor session.
 *
 * Regression: `/api/system-virtual-folder` required `system:settings` and the
 * built-in editor/developer roles lacked `media:*`, so a real editor saw
 * "Failed to load folders" / "Folder creation failed" in the gallery.
 */

import { expect, test, type Page } from "@playwright/test";
import { csrfToken } from "../../helpers/api";
import { loginAsAdmin, loginAsEditor } from "../../helpers/auth";

// Re-enable the *real* auth pipeline for probe requests:
// - `x-test-security: true` stops the turbo hook from setting `__testBypass`
// - an empty `x-test-secret` overrides the context default so the terminal
//   test-client short-circuit is not taken either
const SECURITY_HEADERS = { "x-test-security": "true", "x-test-secret": "" } as const;

async function csrfHeader(page: Page): Promise<Record<string, string>> {
  const token = await csrfToken(page);
  // A missing cookie is the root cause of the historic 403s here: the login
  // response set it but applySessionCookie used to discard non-session cookies.
  expect(token, "CSRF cookie missing after login").toBeTruthy();
  const origin =
    process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.ORIGIN || "http://127.0.0.1:4173";
  return { "X-CSRF-Token": token!, Origin: origin };
}

test.describe("Media folders — RBAC (non-bypassed)", () => {
  test.setTimeout(90_000);

  test("admin can list virtual folders", async ({ page }) => {
    await loginAsAdmin(page);

    const list = await page.request.get("/api/system-virtual-folder", {
      headers: SECURITY_HEADERS,
    });
    expect(list.status(), await list.text()).toBe(200);
    const body = await list.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test("editor can list, create and delete virtual folders", async ({ page }) => {
    await loginAsEditor(page);

    const list = await page.request.get("/api/system-virtual-folder", {
      headers: SECURITY_HEADERS,
    });
    expect(list.status(), await list.text()).toBe(200);
    const listBody = await list.json();
    expect(listBody.success).toBe(true);
    expect(Array.isArray(listBody.data)).toBe(true);

    const folderName = `e2e_rbac_${Date.now().toString(36).slice(-6)}`;
    const created = await page.request.post("/api/system-virtual-folder", {
      headers: { ...SECURITY_HEADERS, ...(await csrfHeader(page)) },
      data: { name: folderName },
    });
    expect(created.status(), await created.text()).toBe(200);
    const createdBody = await created.json();
    expect(createdBody.success).toBe(true);
    expect(createdBody.data?.name).toBe(folderName);
    const folderId = String(createdBody.data?._id ?? "");
    expect(folderId).not.toBe("");

    try {
      const after = await page.request.get("/api/system-virtual-folder", {
        headers: SECURITY_HEADERS,
      });
      expect(after.status()).toBe(200);
      const afterBody = await after.json();
      const names = (afterBody.data as Array<{ name?: string }>).map((folder) => folder.name);
      expect(names).toContain(folderName);
    } finally {
      const deleted = await page.request.delete(
        `/api/system-virtual-folder?folderId=${encodeURIComponent(folderId)}`,
        { headers: { ...SECURITY_HEADERS, ...(await csrfHeader(page)) } },
      );
      expect(deleted.status(), await deleted.text()).toBe(200);
    }
  });
});
