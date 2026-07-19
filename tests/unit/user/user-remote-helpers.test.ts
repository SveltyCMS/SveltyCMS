/**
 * @file tests/unit/user/user-remote-helpers.test.ts
 * @description Unit tests for pure helpers in user-remote-utils.ts
 * (payload shaping + CSRF header builder).
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildUpdateProfileBody,
  remoteJsonHeaders,
} from "../../../src/routes/(app)/user/user-remote-utils";
import { CSRF_TOKEN_COOKIE_NAME, CSRF_TOKEN_HEADER } from "@utils/security/csrf-utils";

describe("buildUpdateProfileBody", () => {
  it("uses explicit user_id and keeps other fields in newUserData", () => {
    const body = buildUpdateProfileBody({
      user_id: "u42",
      username: "alice",
      email: "a@b.co",
    });
    expect(body).toEqual({
      user_id: "u42",
      newUserData: { username: "alice", email: "a@b.co" },
    });
    expect(body.newUserData).not.toHaveProperty("user_id");
  });

  it("defaults user_id to self when missing or blank", () => {
    expect(buildUpdateProfileBody({ username: "x" }).user_id).toBe("self");
    expect(buildUpdateProfileBody({ user_id: "  ", username: "x" }).user_id).toBe("self");
    expect(buildUpdateProfileBody({ user_id: "", username: "x" }).user_id).toBe("self");
  });

  it("preserves password fields inside newUserData only", () => {
    const body = buildUpdateProfileBody({
      user_id: "self",
      password: "NewPass1!",
      currentPassword: "OldPass1!",
    });
    expect(body.user_id).toBe("self");
    expect(body.newUserData).toEqual({
      password: "NewPass1!",
      currentPassword: "OldPass1!",
    });
  });
});

describe("remoteJsonHeaders", () => {
  function mockCookies(cookies: Record<string, string | undefined>) {
    return {
      get: vi.fn((name: string) => cookies[name]),
    };
  }

  it("always sets Content-Type application/json", () => {
    const headers = remoteJsonHeaders(mockCookies({}));
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("includes X-CSRF-Token from plain csrf_token cookie", () => {
    const headers = remoteJsonHeaders(
      mockCookies({ [CSRF_TOKEN_COOKIE_NAME]: "plain-token-value" }),
    );
    expect(headers[CSRF_TOKEN_HEADER]).toBe("plain-token-value");
  });

  it("prefers __Host-csrf_token over plain cookie", () => {
    const headers = remoteJsonHeaders(
      mockCookies({
        [`__Host-${CSRF_TOKEN_COOKIE_NAME}`]: "host-token",
        [CSRF_TOKEN_COOKIE_NAME]: "plain-token",
      }),
    );
    expect(headers[CSRF_TOKEN_HEADER]).toBe("host-token");
  });

  it("omits CSRF header when no cookie is present", () => {
    const headers = remoteJsonHeaders(mockCookies({}));
    expect(headers[CSRF_TOKEN_HEADER]).toBeUndefined();
  });
});
