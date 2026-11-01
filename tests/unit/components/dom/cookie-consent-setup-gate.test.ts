/**
 * @file tests/unit/components/dom/cookie-consent-setup-gate.test.ts
 * @description The GDPR consent banner must not auto-open on `/setup`.
 *
 * The consent POST routes through the system-state gate, which answers 503
 * while the site is still in SETUP; opening the banner there produced a
 * console/network error and asked visitors to consent before a site existed.
 * The banner stays active on every other route so post-setup consent audit
 * logging is unchanged.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  page: { url: new URL("http://localhost/setup") },
}));

vi.mock("$app/state", () => ({ page: h.page }));

import CookieConsent from "@src/plugins/cookie-consent/cookie-consent.svelte";
import { renderComponent, settle, type RenderedComponent } from "./render";

/** The banner container (only rendered while `showBanner` is true). */
function consentBanner(): Element | null {
  return document.querySelector('[aria-labelledby="cookie-heading"]');
}

/** Wait past the component's 600 ms appearance delay, then flush effects. */
async function waitForBannerWindow(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  await settle();
}

describe("Cookie consent banner — setup gating", () => {
  let rendered: RenderedComponent | null = null;

  beforeEach(() => {
    localStorage.clear();
    h.page.url = new URL("http://localhost/setup");
  });

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
  });

  it("does not auto-open on the setup wizard", async () => {
    rendered = renderComponent(CookieConsent);

    await waitForBannerWindow();

    expect(consentBanner()).toBeNull();
  });

  it("still opens after setup on normal routes", async () => {
    h.page.url = new URL("http://localhost/dashboard");
    rendered = renderComponent(CookieConsent);

    await waitForBannerWindow();

    expect(consentBanner()).not.toBeNull();
  });
});
