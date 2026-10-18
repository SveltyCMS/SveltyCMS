/**
 * @file tests/unit/auth/google-auth.test.ts
 * @description Real OAuth state signing and provider URL construction.
 *
 * `google-auth.ts` had 0% unit coverage. These tests exercise the actual
 * HMAC-SHA-256 state envelope (including tamper/format attacks), the
 * fail-closed missing-secret paths, GitHub URL construction, and the Google
 * client path. No network is used: URL generation is local.
 *
 * ### Features:
 * - state signing/verification round-trip with `JWT_SECRET_KEY`
 * - missing secret fails closed; tampered/malformed state returns null
 * - malformed percent-encoding returns null instead of throwing
 * - GitHub auth URL carries client id, redirect, scope, and signed state
 * - Google auth URL construction + credential assignment
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateGithubAuthUrl,
  generateGoogleAuthUrl,
  getGithubOAuthRedirectUri,
  getOAuthRedirectUri,
  googleAuth,
  setCredentials,
  signOAuthState,
  verifyOAuthState,
} from "@src/databases/auth/google-auth";
import { publicEnv } from "@src/stores/global-settings.svelte";

const SECRET = "unit-test-oauth-state-secret-0123456789abcdef";

function setSecrets(values: Record<string, unknown>): void {
  (globalThis as any).privateEnv = values;
}

beforeEach(() => {
  (publicEnv as any).HOST_DEV = "http://localhost:5173";
  (publicEnv as any).HOST_PROD = "https://cms.test";
  setSecrets({ JWT_SECRET_KEY: SECRET });
});

afterEach(() => {
  (globalThis as any).privateEnv = undefined;
});

describe("OAuth redirect URIs", () => {
  it("uses the development host in dev mode", () => {
    expect(getOAuthRedirectUri()).toBe("http://localhost:5173/login/oauth");
    expect(getGithubOAuthRedirectUri()).toBe("http://localhost:5173/login/oauth?provider=github");
  });
});

describe("signOAuthState / verifyOAuthState", () => {
  it("round-trips a token", () => {
    const signed = signOAuthState("tenant-token");
    expect(signed).toBeTruthy();
    expect(verifyOAuthState(signed)).toBe("tenant-token");
  });

  it("returns undefined for empty tokens", () => {
    expect(signOAuthState(null)).toBeUndefined();
    expect(signOAuthState(undefined)).toBeUndefined();
    expect(signOAuthState("")).toBeUndefined();
  });

  it("fails closed when JWT_SECRET_KEY is missing", () => {
    setSecrets({});
    expect(() => signOAuthState("token")).toThrow(/JWT_SECRET_KEY/);
    expect(verifyOAuthState("token.signature")).toBeNull();
  });

  it("rejects tampered signatures", () => {
    const signed = signOAuthState("token-1")!;
    const decoded = decodeURIComponent(signed);
    const [token, signature] = decoded.split(".");

    expect(verifyOAuthState(`${token}.${signature.slice(0, -1)}0`)).toBeNull();
    expect(verifyOAuthState(`${token}.${signature}`.replace(token, "token-2"))).toBeNull();
  });

  it("rejects malformed state formats", () => {
    expect(verifyOAuthState(null)).toBeNull();
    expect(verifyOAuthState("")).toBeNull();
    expect(verifyOAuthState("no-signature")).toBeNull();
    expect(verifyOAuthState("a.b.c")).toBeNull();
    expect(verifyOAuthState("%E0%A4%A")).toBeNull();
  });

  it("encodes state so it is safe in a query string", () => {
    const signed = signOAuthState("tenant/a b+c")!;
    expect(signed).not.toContain(" ");
    expect(signed).not.toContain("+");
    expect(verifyOAuthState(signed)).toBe("tenant/a b+c");
  });
});

describe("GitHub OAuth", () => {
  it("throws when GITHUB_CLIENT_ID is missing", async () => {
    await expect(generateGithubAuthUrl()).rejects.toThrow(/GitHub OAuth is not initialized/);
  });

  it("builds the authorize URL with a signed state", async () => {
    setSecrets({ JWT_SECRET_KEY: SECRET, GITHUB_CLIENT_ID: "github-client" });

    const url = new URL(await generateGithubAuthUrl("tenant-token", "consent", "tenant-1"));
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("github-client");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:5173/login/oauth?provider=github",
    );
    expect(url.searchParams.get("scope")).toBe("user:email");
    expect(verifyOAuthState(url.searchParams.get("state"))).toBe("tenant-token");
  });

  it("uses the no-token sentinel when no state token is supplied", async () => {
    setSecrets({ JWT_SECRET_KEY: SECRET, GITHUB_CLIENT_ID: "github-client" });

    const url = new URL(await generateGithubAuthUrl());
    expect(url.searchParams.get("state")).toBe("no-token");
  });
});

describe("Google OAuth", () => {
  it("returns null when credentials are absent", async () => {
    setSecrets({ JWT_SECRET_KEY: SECRET });
    expect(await googleAuth()).toBeNull();
  });

  it("throws when generating a URL without credentials", async () => {
    setSecrets({ JWT_SECRET_KEY: SECRET });
    await expect(generateGoogleAuthUrl("token")).rejects.toThrow(/Google OAuth is not initialized/);
  });

  it("builds an authorize URL and accepts credentials", async () => {
    setSecrets({
      JWT_SECRET_KEY: SECRET,
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
    });

    const url = new URL(await generateGoogleAuthUrl("tenant-token", "select_account", "tenant-1"));
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("google-client");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:5173/login/oauth");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(verifyOAuthState(url.searchParams.get("state"))).toBe("tenant-token");

    await setCredentials({ access_token: "access-token" });
    const client = await googleAuth();
    expect(client?.credentials.access_token).toBe("access-token");
  });
});
