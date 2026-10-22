/**
 * @file tests/e2e/routes/collection-builder/sidebar-ssr.spec.ts
 * @description Server-render contract for the collections sidebar.
 *
 * The tree used to be populated only by a client-only `$effect` in
 * `(app)/+layout.svelte`, so the SSR HTML (and the hydration frame) rendered
 * "No collections found." before the effect filled the store — a visible
 * empty → filled flash on every reload of `/en/collection/pages`.
 *
 * This test asserts the stronger contract directly on the HTTP response: the
 * collection row is in the server HTML and the empty state is not.
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Collections sidebar — SSR", () => {
  test.setTimeout(90_000);

  test("is server-rendered, so a reload never flashes the empty state", async ({ page }) => {
    // Establishes an authenticated session for the request context.
    await loginAsAdmin(page);

    const response = await page.request.get("/en/collection/pages");
    expect(response.status(), "GET /en/collection/pages").toBe(200);
    const html = await response.text();

    // The collection row is part of the first response (preload-ready <a href>).
    expect(html).toContain('href="/en/collection/pages"');
    // …and the empty state never shipped in the same response.
    expect(html).not.toContain("No collections found.");
  });
});
