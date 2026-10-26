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
import { seedCollectionFixture } from "../../helpers/collection-builder-flow";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Collections sidebar — SSR", () => {
  test.setTimeout(90_000);

  test("is server-rendered, so a reload never flashes the empty state", async ({ page }) => {
    // Establishes an authenticated session for the request context.
    await loginAsAdmin(page);

    // Seed the fixture instead of assuming a demo collection exists in this
    // shard's database (the prep seed only creates the admin + system schema).
    const collection = await seedCollectionFixture(page, "sidebar_ssr_");
    const path = `/en/collection/${collection.id}`;

    const response = await page.request.get(path);
    expect(response.status(), `GET ${path}`).toBe(200);
    const html = await response.text();

    // The collection row is part of the first response (preload-ready <a href>).
    expect(html).toContain(`href="${path}"`);
    // …and the empty state never shipped in the same response.
    expect(html).not.toContain("No collections found.");
  });
});
