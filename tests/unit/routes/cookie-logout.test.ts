/**
 * @file tests/unit/routes/cookie-logout.test.ts
 * @description Unit tests for session cookie deletion attribute alignment on logout.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAuthUserRoutes } from "@src/routes/api/[...path]/handlers/auth";

describe("Cookie Logout Attribute Alignment", () => {
  let mockEvent: any;
  let deletedCookies: Array<{ name: string; opts: any }>;

  beforeEach(() => {
    deletedCookies = [];
    mockEvent = {
      request: {
        method: "POST",
        json: async () => ({}),
        headers: new Headers(),
      },
      url: new URL("https://localhost/api/auth/logout"),
      locals: {
        user: { _id: "user1" },
        isAdmin: true,
      },
      cookies: {
        get: vi.fn((_name) => "test-session-id"),
        set: vi.fn(),
        delete: vi.fn((name, opts) => {
          deletedCookies.push({ name, opts });
        }),
      },
    };
  });

  it("deletes session cookie with full matching attributes (path, httpOnly, sameSite, secure) on HTTPS", async () => {
    const cms: any = {
      auth: {
        logout: vi.fn().mockResolvedValue({ success: true }),
      },
    };

    await handleAuthUserRoutes(mockEvent, cms, "tenant1" as any, ["auth", "logout"]);

    expect(deletedCookies.length).toBeGreaterThan(0);
    const mainCookieDelete = deletedCookies.find(
      (c) => c.name.includes("session") || c.name.includes("Host"),
    );
    expect(mainCookieDelete).toBeDefined();
    expect(mainCookieDelete?.opts.path).toBe("/");
    expect(mainCookieDelete?.opts.httpOnly).toBe(true);
    expect(mainCookieDelete?.opts.secure).toBe(true);
    expect(mainCookieDelete?.opts.sameSite).toBe("strict");
  });
});
