/**
 * @file tests/unit/utils/session-reauth.test.ts
 * @description Session-bound reauth HMAC used by API and remotes.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn(() => "test-secret-key-for-hmac"),
}));

import {
  signReauthToken,
  verifyReauthToken,
  REAUTH_TOKEN_TTL_MS,
} from "@utils/server/session-reauth.server";

describe("session reauth tokens", () => {
  it("round-trips a fresh token bound to user+session", () => {
    const exp = Date.now() + REAUTH_TOKEN_TTL_MS;
    const token = signReauthToken("user-1", "sess-1", exp);
    expect(verifyReauthToken(token, "user-1", "sess-1")).toBe(true);
    expect(verifyReauthToken(token, "user-1", "sess-other")).toBe(false);
    expect(verifyReauthToken(token, "user-other", "sess-1")).toBe(false);
  });

  it("rejects expired tokens", () => {
    const token = signReauthToken("user-1", "sess-1", Date.now() - 1000);
    expect(verifyReauthToken(token, "user-1", "sess-1")).toBe(false);
  });
});
