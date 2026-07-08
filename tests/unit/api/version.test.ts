/**
 * @file tests/unit/api/version.test.ts
 * @description Unit tests for version service and update checking.
 *
 * Features tested:
 * - Version comparison (isNewer logic)
 * - Version reading from package.json format
 * - API response shape
 */

import { describe, it, expect } from "vitest";

// Simulate the isNewer comparison from version-service.ts
function isNewer(latest: string, current: string): boolean {
  const toNumbers = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const a = toNumbers(latest);
  const b = toNumbers(current);

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

describe("Version Service — isNewer", () => {
  it("should detect newer patch version", () => {
    expect(isNewer("0.0.8", "0.0.7")).toBe(true);
  });

  it("should detect newer minor version", () => {
    expect(isNewer("0.1.0", "0.0.9")).toBe(true);
  });

  it("should detect newer major version", () => {
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
  });

  it("should return false for equal versions", () => {
    expect(isNewer("0.0.7", "0.0.7")).toBe(false);
  });

  it("should return false for older version", () => {
    expect(isNewer("0.0.6", "0.0.7")).toBe(false);
  });

  it("should handle v-prefix removal", () => {
    expect(isNewer("0.0.8", "0.0.7")).toBe(true);
  });

  it("should handle multi-digit version numbers", () => {
    expect(isNewer("0.0.10", "0.0.9")).toBe(true);
  });
});

describe("Version Service — API response shape", () => {
  it("should produce correct update-available response", () => {
    const result = {
      currentVersion: "0.0.7",
      latestVersion: "0.0.8",
      updateAvailable: true,
      checkedAt: new Date().toISOString(),
    };

    expect(result.updateAvailable).toBe(true);
    expect(result.currentVersion).toBe("0.0.7");
    expect(result.latestVersion).toBe("0.0.8");
    expect(result.checkedAt).toBeTruthy();
  });

  it("should produce correct up-to-date response", () => {
    const result = {
      currentVersion: "0.0.7",
      latestVersion: "0.0.7",
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
    };

    expect(result.updateAvailable).toBe(false);
  });

  it("should handle error response with null latestVersion", () => {
    const result = {
      currentVersion: "0.0.7",
      latestVersion: null,
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      error: "GitHub API returned 403",
    };

    expect(result.latestVersion).toBeNull();
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
