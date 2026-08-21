/**
 * @file tests/unit/security/safe-redirect.test.ts
 * @description Unit tests for safeRedirect open-redirect mitigation.
 */

import { describe, expect, it } from "vitest";
import { safeRedirect } from "@src/utils/security/safe-redirect";

describe("safeRedirect", () => {
  it("allows safe relative paths", () => {
    expect(safeRedirect("/dashboard", "/")).toBe("/dashboard");
    expect(safeRedirect("/config/collectionbuilder?foo=1", "/")).toBe(
      "/config/collectionbuilder?foo=1",
    );
    expect(safeRedirect("/settings/profile#section", "/")).toBe("/settings/profile#section");
  });

  it("blocks external URLs with protocol", () => {
    expect(safeRedirect("https://evil.com", "/fallback")).toBe("/fallback");
    expect(safeRedirect("http://evil.com/login", "/fallback")).toBe("/fallback");
    expect(safeRedirect("javascript:alert(1)", "/fallback")).toBe("/fallback");
  });

  it("blocks protocol-relative URLs", () => {
    expect(safeRedirect("//evil.com", "/fallback")).toBe("/fallback");
    expect(safeRedirect("//evil.com/path", "/fallback")).toBe("/fallback");
    expect(safeRedirect("/\\evil.com", "/fallback")).toBe("/fallback");
  });

  it("handles null, undefined, and empty inputs gracefully", () => {
    expect(safeRedirect(null, "/default")).toBe("/default");
    expect(safeRedirect(undefined, "/default")).toBe("/default");
    expect(safeRedirect("", "/default")).toBe("/default");
    expect(safeRedirect("   ", "/default")).toBe("/default");
  });
});
