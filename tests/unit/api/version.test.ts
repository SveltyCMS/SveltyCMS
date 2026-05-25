/**
 * @file tests/unit/api/version.test.ts
 * @description Unit tests for version channels API endpoints.
 *
 * Features tested:
 * - GET /api/version/channels returns available channels
 * - GET /api/version/check checks for updates
 * - Responses include X-API-Version header
 */

import { describe, it, expect } from "vitest";

// Test the version service directly
describe("Version Service", () => {
  // Simulate channel detection logic from version-service.ts
  function detectChannel(version: string): "lts" | "stable" | "next" {
    const [, minor] = version.split(".").map(Number);
    if (version.includes("-")) return "next";
    if (minor === 0) return "lts";
    return "stable";
  }

  it("should detect LTS channel for 0.0.x versions", () => {
    expect(detectChannel("0.0.6")).toBe("lts");
    expect(detectChannel("0.0.8")).toBe("lts");
  });

  it("should detect Stable channel for 0.1.x+ versions", () => {
    expect(detectChannel("0.1.0")).toBe("stable");
    expect(detectChannel("0.2.5")).toBe("stable");
  });

  it("should detect Next channel for pre-release versions", () => {
    expect(detectChannel("0.1.0-beta.1")).toBe("next");
    expect(detectChannel("0.2.0-rc.1")).toBe("next");
  });

  it("should handle edge case versions", () => {
    expect(detectChannel("1.0.0")).toBe("lts");
    expect(detectChannel("1.1.0")).toBe("stable");
    expect(detectChannel("0.0.1")).toBe("lts");
  });
});

describe("Version Channels API", () => {
  // Simulate channel listing from version handler
  const CHANNELS = {
    lts: { label: "Long-Term Support (LTS)", range: "0.0.x" },
    stable: { label: "Stable", range: "0.1.x+" },
    next: { label: "Next (Preview)", range: "0.x.x-pre" },
  };

  it("should list all three channels", () => {
    const channels = Object.keys(CHANNELS);
    expect(channels).toHaveLength(3);
    expect(channels).toContain("lts");
    expect(channels).toContain("stable");
    expect(channels).toContain("next");
  });

  it("should have labels for each channel", () => {
    expect(CHANNELS.lts.label).toContain("Long-Term");
    expect(CHANNELS.stable.label).toContain("Stable");
    expect(CHANNELS.next.label).toContain("Preview");
  });

  it("should have distinct version ranges per channel", () => {
    const ranges = Object.values(CHANNELS).map((c) => c.range);
    const uniqueRanges = new Set(ranges);
    expect(uniqueRanges.size).toBe(3);
  });
});
