/**
 * @file tests/unit/auth/oidc-login-redirect.test.ts
 * @description `redirect_uri` on the OIDC login start must be same-origin.
 *
 * WHY: the handler took `?redirect_uri=` verbatim, stored it in the state cookie and sent it
 * to the OP. Any allowed value turns the login start into an open redirect; where the OP
 * accepts it, the authorization code is delivered to that host.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@src/databases/auth/sso-session", () => ({
  loadSsoProvidersFromSettings: vi.fn(async () => undefined),
  getSsoProvider: vi.fn(() => ({ id: "okta", type: "oidc" })),
  generatePkce: vi.fn(() => ({ codeVerifier: "verifier", codeChallenge: "challenge" })),
  buildOidcAuthorizationUrl: vi.fn(async (_id: string, params: { redirectUri: string }) => ({
    success: true,
    url: `https://op.example.com/authorize?redirect_uri=${encodeURIComponent(params.redirectUri)}`,
  })),
}));

import { handleOidcLoginStart } from "@src/routes/api/[...path]/handlers/auth";

function mkEvent(search: string) {
  const url = new URL(`https://cms.example.com/api/auth/oidc-login${search}`);
  return {
    url,
    cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
    locals: {},
  } as never;
}

describe("OIDC login start redirect_uri", () => {
  it("rejects a foreign origin", async () => {
    await expect(
      handleOidcLoginStart(mkEvent("?provider=okta&redirect_uri=https://evil.example/cb")),
    ).rejects.toThrow(/same-origin/i);
  });

  it("rejects a protocol-relative or non-http target", async () => {
    await expect(
      handleOidcLoginStart(mkEvent("?provider=okta&redirect_uri=javascript:alert(1)")),
    ).rejects.toThrow();
  });

  it("accepts a same-origin path and uses it", async () => {
    const res = (await handleOidcLoginStart(
      mkEvent("?provider=okta&redirect_uri=/dashboard"),
    )) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain(
      encodeURIComponent("https://cms.example.com/dashboard"),
    );
  });

  it("falls back to the callback path when no redirect_uri is given", async () => {
    const res = (await handleOidcLoginStart(mkEvent("?provider=okta"))) as Response;

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain(
      encodeURIComponent("https://cms.example.com/api/auth/oidc-callback"),
    );
  });
});
