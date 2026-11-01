/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/login-invite-default.test.ts
 * @description Regression pin for invitation landing (retest m7).
 *
 * An invite link used to open the generic Sign In / Sign Up chooser and made the
 * invitee click Sign Up. With a recognised invitation the page must open the
 * Sign Up form directly; ordinary visits keep the chooser.
 *
 * The page is mounted at `/login` because route context is part of the surface:
 * `VersionCheck` (rendered inside the chooser branch) skips its authenticated update
 * check there. The component also guards its async check against teardown (an
 * `onDestroy` flag plus a direct location check instead of reading route `$derived`s
 * after the invite redirect destroys the chooser), so unmounting cannot produce a
 * Svelte `derived_inert` warning.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@src/routes/login/+page.svelte";
import { page } from "$app/state";
import { renderPage, settle } from "./render";

const baseData = {
  hasAdminUser: true,
  returningUser: false,
  demoMode: false,
  showDatabaseError: false,
  canReset: false,
  firstCollectionPath: "",
  showGoogleOAuth: false,
  showGithubOAuth: false,
  isOpenSignup: false,
  ssoProviders: [],
  hasExistingOAuthUsers: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("Login page — invitation landing (retest m7)", () => {
  // jsdom serves `/`; the login surface is `/login`, and the page's update-check
  // guard keys off it (see the file header).
  beforeEach(() => {
    window.history.replaceState({}, "", "/login");
  });

  it("opens the Sign Up form directly for a recognised invitation", async () => {
    Object.assign(page.data, baseData);
    const rendered = renderPage(LoginPage, {
      ...baseData,
      isInviteFlow: true,
      token: "invite-token-123",
      invitedEmail: "invitee@example.com",
    });

    try {
      await settle();
      expect(rendered.target.querySelector("#usernamesignUp")).not.toBeNull();
      expect(rendered.target.textContent).toContain("Complete Invitation");
    } finally {
      rendered.cleanup();
    }
  });

  it("opens the Sign Up form for an invalid invitation so the error is visible", async () => {
    Object.assign(page.data, baseData);
    const rendered = renderPage(LoginPage, {
      ...baseData,
      inviteError: "This invitation token appears to be invalid, expired, or already used.",
    });

    try {
      await settle();
      expect(rendered.target.querySelector("#usernamesignUp")).not.toBeNull();
      expect(rendered.target.textContent).toContain("invalid, expired, or already used");
    } finally {
      rendered.cleanup();
    }
  });

  it("keeps the chooser for an ordinary visit", async () => {
    Object.assign(page.data, baseData);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const rendered = renderPage(LoginPage, { ...baseData });
    try {
      await settle();
      expect(rendered.target.querySelector("#usernamesignUp")).toBeNull();
      expect(rendered.target.querySelector("#signup-form")).toBeNull();
    } finally {
      rendered.cleanup();
    }
  });
});
