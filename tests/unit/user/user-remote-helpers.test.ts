/**
 * @file tests/unit/user/user-remote-helpers.test.ts
 * @description Unit tests for pure helpers in user-remote-utils.ts
 * (payload shaping, CSRF header builder, session mapping, table sanitization, and token expiration helpers).
 *
 * ### Features:
 * - buildUpdateProfileBody
 * - remoteJsonHeaders
 * - mapActiveSessions
 * - sanitizeUserTableRow
 * - convertLegacyExpiresFormat / convertExpiresToHours / convertDateToExpiresFormat
 */

import { describe, it, expect, vi } from "vitest";
import {
  buildUpdateProfileBody,
  convertDateToExpiresFormat,
  convertExpiresToHours,
  convertLegacyExpiresFormat,
  mapActiveSessions,
  remoteJsonHeaders,
  sanitizeUserTableRow,
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

describe("mapActiveSessions", () => {
  it("drops rotated sessions and flags at most one current session", () => {
    const raw = [
      { id: "s1", ipAddress: "127.0.0.1", createdAt: "2026-01-01T00:00:00Z" },
      { _id: "s1", ip: "127.0.0.1", createdAt: "2026-01-01T00:00:00Z" },
      { _id: "s2", rotated: true },
      { _id: "s3", userAgent: "Mozilla/5.0" },
    ];
    const mapped = mapActiveSessions(raw, "s1");
    expect(mapped).toHaveLength(3);
    expect(mapped.filter((s) => s.isCurrent)).toHaveLength(1);
    expect(mapped[0]._id).toBe("s1");
    expect(mapped[0].ip).toBe("127.0.0.1");
    expect(mapped[2].userAgent).toBe("Mozilla/5.0");
  });
});

describe("sanitizeUserTableRow", () => {
  it("strips credential and lockout fields while preserving safe attributes", () => {
    const sanitized = sanitizeUserTableRow({
      _id: 42,
      username: "ada",
      email: "ada@example.com",
      password: "secret",
      totpSecret: "seed",
      failedAttempts: 3,
      lockoutUntil: "2026-01-01T00:00:00Z",
    });
    expect(sanitized).toEqual({
      _id: "42",
      username: "ada",
      email: "ada@example.com",
    });
  });

  it("returns null for non-objects", () => {
    expect(sanitizeUserTableRow(null)).toBeNull();
    expect(sanitizeUserTableRow("invalid")).toBeNull();
  });
});

describe("token expiration helpers", () => {
  it("converts legacy expiration codes into canonical labels", () => {
    expect(convertLegacyExpiresFormat("1h")).toBe("2 hrs");
    expect(convertLegacyExpiresFormat("2h")).toBe("2 hrs");
    expect(convertLegacyExpiresFormat("12h")).toBe("12 hrs");
    expect(convertLegacyExpiresFormat("1d")).toBe("2 days");
    expect(convertLegacyExpiresFormat("2d")).toBe("2 days");
    expect(convertLegacyExpiresFormat("7d")).toBe("1 week");
    expect(convertLegacyExpiresFormat("14d")).toBe("2 weeks");
    expect(convertLegacyExpiresFormat("30d")).toBe("1 month");
    expect(convertLegacyExpiresFormat("90d")).toBe("1 month");
    expect(convertLegacyExpiresFormat("1 week")).toBe("1 week");
    expect(convertLegacyExpiresFormat("unknown")).toBe("2 days");
  });

  it("converts canonical labels into hours", () => {
    expect(convertExpiresToHours("2 hrs")).toBe(2);
    expect(convertExpiresToHours("12 hrs")).toBe(12);
    expect(convertExpiresToHours("2 days")).toBe(48);
    expect(convertExpiresToHours("1 week")).toBe(168);
    expect(convertExpiresToHours("2 weeks")).toBe(336);
    expect(convertExpiresToHours("1 month")).toBe(720);
    expect(convertExpiresToHours("other")).toBe(48);
  });

  it("maps expiration Date/ISO strings to the closest label", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    expect(convertDateToExpiresFormat(null, now)).toBe("2 days");
    expect(convertDateToExpiresFormat("invalid-date", now)).toBe("2 days");
    expect(convertDateToExpiresFormat(new Date(now + 1 * 3600_000), now)).toBe("2 hrs");
    expect(convertDateToExpiresFormat(new Date(now + 6 * 3600_000), now)).toBe("12 hrs");
    expect(convertDateToExpiresFormat(new Date(now + 36 * 3600_000), now)).toBe("2 days");
    expect(convertDateToExpiresFormat(new Date(now + 5 * 24 * 3600_000), now)).toBe("1 week");
    expect(convertDateToExpiresFormat(new Date(now + 10 * 24 * 3600_000), now)).toBe("2 weeks");
    expect(convertDateToExpiresFormat(new Date(now + 25 * 24 * 3600_000), now)).toBe("1 month");
  });
});
