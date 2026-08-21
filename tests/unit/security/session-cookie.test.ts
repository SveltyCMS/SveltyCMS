/**
 * @file tests/unit/security/session-cookie.test.ts
 * @description Comprehensive unit tests for session cookie resolution,
 * protocol-aware precedence, and multi-variant cookie deletion.
 */

import { describe, it, expect, vi } from "vitest";
import { readSessionCookie, clearAllSessionCookies } from "@src/utils/security/session-cookie";
import { HOST_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@src/databases/auth/constants";

describe("session-cookie — readSessionCookie", () => {
  it("returns undefined when cookies reader is null or missing get function", () => {
    expect(readSessionCookie(null)).toBeUndefined();
    expect(readSessionCookie({} as any)).toBeUndefined();
  });

  it("prioritizes __Host- cookie on secure connections", () => {
    const mockCookies = {
      get: vi.fn((name: string) => {
        if (name === HOST_SESSION_COOKIE_NAME) return "host-token-123";
        if (name === SESSION_COOKIE_NAME) return "plain-token-456";
        return undefined;
      }),
    };

    const token = readSessionCookie(mockCookies, true);
    expect(token).toBe("host-token-123");
  });

  it("falls back to plain session cookie on insecure connections", () => {
    const mockCookies = {
      get: vi.fn((name: string) => {
        if (name === SESSION_COOKIE_NAME) return "plain-token-456";
        if (name === HOST_SESSION_COOKIE_NAME) return "host-token-123";
        return undefined;
      }),
    };

    const token = readSessionCookie(mockCookies, false);
    expect(token).toBe("plain-token-456");
  });
});

describe("session-cookie — clearAllSessionCookies", () => {
  it("gracefully ignores null or invalid cookie deleters", () => {
    expect(() => clearAllSessionCookies(null)).not.toThrow();
    expect(() => clearAllSessionCookies({} as any)).not.toThrow();
  });

  it("deletes all 3 variants with host path locked to / and strict sameSite on secure", () => {
    const deleted: Array<{ name: string; opts: any }> = [];
    const mockCookies = {
      delete: vi.fn((name: string, opts: any) => {
        deleted.push({ name, opts });
      }),
    };

    clearAllSessionCookies(mockCookies, "/custom/path");

    expect(deleted).toHaveLength(3);

    const hostDeleted = deleted.find((d) => d.name === HOST_SESSION_COOKIE_NAME);
    expect(hostDeleted).toBeDefined();
    expect(hostDeleted?.opts.path).toBe("/"); // RFC 6265bis __Host- must be /
    expect(hostDeleted?.opts.secure).toBe(true);
    expect(hostDeleted?.opts.sameSite).toBe("strict");

    const plainDeleted = deleted.find((d) => d.name === SESSION_COOKIE_NAME);
    expect(plainDeleted).toBeDefined();
    expect(plainDeleted?.opts.path).toBe("/custom/path");
    expect(plainDeleted?.opts.httpOnly).toBe(true);
  });
});
