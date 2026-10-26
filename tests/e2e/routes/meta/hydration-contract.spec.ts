/**
 * @file tests/e2e/routes/meta/hydration-contract.spec.ts
 * @description Contract for progressive hydration — the marker and the gate.
 *
 * Two assertions that fail loudly when the contract breaks:
 *  1. `<html data-hydrated="true">` appears once the client took over (the
 *     marker every hydration helper and every gated control depends on).
 *  2. A gated control is `disabled` in the server HTML and `enabled` after
 *     hydration: the SSR half is read with `page.request.get()`, where no
 *     JavaScript runs, and the transition is asserted on the live page.
 *
 * The attribute name comes from the helpers (`HYDRATION_ATTRIBUTE`), which
 * mirrors `HYDRATION_ATTRIBUTE` in `src/stores/hydration.svelte.ts`; the gate is
 * published by `src/routes/+layout.svelte` (`hydration.markHydrated()`).
 */

import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../../helpers/auth";
import { HYDRATION_ATTRIBUTE, HYDRATION_SELECTOR } from "../../helpers/hydration";

const ACTION_TIMEOUT = 20_000;

/** A control that binds `disabled={!hydration.hydrated}` (webhooks page). */
const GATED_TESTID = "webhooks-add";
const GATED_PATH = "/config/webhooks";

// Independent of the stored auth state — login explicitly in each test.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Progressive hydration contract", () => {
  test("root layout publishes the hydration marker", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(GATED_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });

    await expect(page.locator(HYDRATION_SELECTOR)).toHaveCount(1, { timeout: ACTION_TIMEOUT });
    await expect(page.locator("html")).toHaveAttribute(HYDRATION_ATTRIBUTE, "true");
  });

  test("gated control is disabled in the server HTML and enabled after hydration", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // ── SSR half: an APIRequestContext response runs no JavaScript. ──
    const ssr = await page.request.get(GATED_PATH);
    expect(ssr.ok(), `GET ${GATED_PATH} status=${ssr.status()}`).toBeTruthy();
    const html = await ssr.text();

    // The marker must be a client-side fact — a server-rendered `data-hydrated`
    // would make every "wait for hydration" think the page is interactive.
    expect(html, `${HYDRATION_ATTRIBUTE} must not be server-rendered`).not.toContain(
      `${HYDRATION_ATTRIBUTE}="true"`,
    );

    const serverTag = html.match(new RegExp(`<button(?=[^>]*data-testid="${GATED_TESTID}")[^>]*>`));
    expect(
      serverTag,
      `no SSR <button data-testid="${GATED_TESTID}"> in the response`,
    ).not.toBeNull();
    expect(serverTag?.[0], `"${GATED_TESTID}" must ship disabled`).toMatch(/\sdisabled(?=[\s=>])/);

    // ── Client half: hydration must lift the gate on the live page. ──
    await page.goto(GATED_PATH, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const control = page.getByTestId(GATED_TESTID);
    await expect(control).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(control).toBeEnabled({ timeout: ACTION_TIMEOUT });
  });
});
