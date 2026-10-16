/**
 * @file tests/unit/route-test-coverage.test.ts
 * @description Enforces the admin route → test coverage manifest in CI.
 *
 * This is the gate that answers "does every `(app)` route have a test at some
 * layer?". It fails on untracked routes, stale manifest entries, and missing or
 * empty covering test files, so a route can never silently lose its only test.
 */

import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  APP_ROUTE_COVERAGE,
  enumerateAppRouteGroups,
  verifyAppRouteCoverage,
} from "../route-test-coverage";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

describe("admin route → test coverage gate", () => {
  it("discovers route groups from disk", () => {
    const routes = enumerateAppRouteGroups(PROJECT_ROOT);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes).toContain("dashboard");
    expect(routes).toContain("user");
    expect(routes).toContain("config/system-settings");
  });

  it("has no duplicate manifest entries", () => {
    const keys = APP_ROUTE_COVERAGE.map((e) => e.route);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("passes full coverage verification (inventory + file parity)", () => {
    const result = verifyAppRouteCoverage({ projectRoot: PROJECT_ROOT });
    if (!result.passed) {
      // Surface every gap at once so a failing CI run is self-explanatory.
      const detail = result.gaps
        .map((g) => `  [${g.type}] ${g.route}${g.filePath ? ` → ${g.filePath}` : ""}`)
        .join("\n");
      expect(result.gaps, `route coverage gaps:\n${detail}`).toEqual([]);
    }
    expect(result.passed).toBe(true);
  });
});
