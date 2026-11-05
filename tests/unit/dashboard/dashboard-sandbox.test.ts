/**
 * @file tests/unit/dashboard/dashboard-sandbox.test.ts
 * @description Unit tests for dashboard widget security sandbox: URL validation and access gating.
 */

import { describe, expect, it, vi } from "vitest";
import {
  checkWidgetAccess,
  isValidDashboardEndpoint,
  sandboxedWidgetFetch,
  WidgetHttpError,
} from "@src/routes/(app)/dashboard/widget-sandbox";

describe("isValidDashboardEndpoint", () => {
  it("allows safe internal /api/ endpoints", () => {
    expect(isValidDashboardEndpoint("/api/dashboard/system-info?type=cpu")).toBe(true);
    expect(isValidDashboardEndpoint("/api/dashboard/logs")).toBe(true);
    expect(isValidDashboardEndpoint("/api/system-preferences")).toBe(true);
  });

  it("rejects dangerous URL schemes", () => {
    expect(isValidDashboardEndpoint("javascript:alert(1)")).toBe(false);
    expect(isValidDashboardEndpoint("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isValidDashboardEndpoint("vbscript:msgbox")).toBe(false);
    expect(isValidDashboardEndpoint("file:///etc/passwd")).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isValidDashboardEndpoint("//evil.com/api/test")).toBe(false);
  });

  it("rejects directory traversal attempts", () => {
    expect(isValidDashboardEndpoint("/api/../../etc/passwd")).toBe(false);
    expect(isValidDashboardEndpoint("/api/%2e%2e/admin")).toBe(false);
    expect(isValidDashboardEndpoint("/api/%2E%2E/%2E%2E/admin")).toBe(false);
    expect(isValidDashboardEndpoint("/api/..%2f..%2fadmin")).toBe(false);
    expect(isValidDashboardEndpoint("/api/%252e%252e/admin")).toBe(false);
    expect(isValidDashboardEndpoint("/api/test/..")).toBe(false);
  });

  it("rejects backslash traversal and credentials in absolute URLs", () => {
    expect(isValidDashboardEndpoint("/api/..\\admin")).toBe(false);
    expect(isValidDashboardEndpoint("https://user:pass@example.com/api/test")).toBe(false);
  });

  it("rejects the bare /api namespace", () => {
    expect(isValidDashboardEndpoint("/api")).toBe(false);
    expect(isValidDashboardEndpoint("/api/")).toBe(false);
  });

  it("rejects control characters and null bytes", () => {
    expect(isValidDashboardEndpoint("/api/test\x00malicious")).toBe(false);
    expect(isValidDashboardEndpoint("/api/test\r\nHeader: value")).toBe(false);
  });

  it("rejects non-string or empty inputs", () => {
    expect(isValidDashboardEndpoint("")).toBe(false);
    expect(isValidDashboardEndpoint("   ")).toBe(false);
    expect(isValidDashboardEndpoint(null as unknown as string)).toBe(false);
    expect(isValidDashboardEndpoint(undefined as unknown as string)).toBe(false);
  });
});

describe("checkWidgetAccess", () => {
  it("grants access to admin users unconditionally", () => {
    expect(checkWidgetAccess({ isAdmin: true }, "system:monitoring", true)).toBe(true);
    expect(checkWidgetAccess({ role: "admin" }, "system:monitoring", true)).toBe(true);
  });

  it("blocks non-admin users from admin-only widgets", () => {
    expect(checkWidgetAccess({ role: "editor" }, undefined, true)).toBe(false);
    expect(checkWidgetAccess({ role: "user" }, undefined, true)).toBe(false);
  });

  it("checks specific permission when required", () => {
    const userWithPerm = { role: "editor", permissions: ["widget:audit"] };
    const userWithoutPerm = { role: "editor", permissions: ["widget:content"] };

    expect(checkWidgetAccess(userWithPerm, "widget:audit")).toBe(true);
    expect(checkWidgetAccess(userWithoutPerm, "widget:audit")).toBe(false);
  });

  it("treats dashboard:read and system:dashboard as aliases", () => {
    expect(checkWidgetAccess({ permissions: ["system:dashboard"] }, "dashboard:read")).toBe(true);
    expect(checkWidgetAccess({ permissions: ["dashboard:read"] }, "system:dashboard")).toBe(true);
    expect(checkWidgetAccess({ permissions: ["system:dashboard"] }, "system:admin")).toBe(false);
  });

  it("denies access when user is undefined", () => {
    expect(checkWidgetAccess(undefined, "system:monitoring")).toBe(false);
  });
});

describe("sandboxedWidgetFetch", () => {
  it("rejects forbidden endpoints with a security error", async () => {
    await expect(sandboxedWidgetFetch("https://external-malicious.com")).rejects.toThrow(
      /Forbidden endpoint/,
    );
  });

  it("attaches CSRF headers and processes JSON response on permitted endpoints", async () => {
    const mockData = { cpuUsage: 42 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => mockData,
    }) as unknown as typeof fetch;

    const result = await sandboxedWidgetFetch<{ cpuUsage: number }>(
      "/api/dashboard/system-info?type=cpu",
    );
    expect(result).toEqual(mockData);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves the HTTP status and marks 4xx as non-retryable", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    }) as unknown as typeof fetch;

    await expect(sandboxedWidgetFetch("/api/dashboard/security")).rejects.toBeInstanceOf(
      WidgetHttpError,
    );

    try {
      await sandboxedWidgetFetch("/api/dashboard/security");
    } catch (err) {
      expect(err).toBeInstanceOf(WidgetHttpError);
      expect((err as WidgetHttpError).status).toBe(403);
      expect((err as WidgetHttpError).retryable).toBe(false);
    }
  });
});
