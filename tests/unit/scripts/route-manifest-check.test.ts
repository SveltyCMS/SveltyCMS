/**
 * @file tests/unit/scripts/route-manifest-check.test.ts
 * @description Pins the fast-tier route manifest gate.
 *
 * `tests/unit/route-test-coverage.test.ts` proves the manifest matches the real
 * tree; this test proves the *fast-tier wrapper* asks the same question for every
 * manifest row, so a moved test file fails in seconds instead of waiting for the
 * full unit suite.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROUTE_COVERAGE } from "../../route-test-coverage";
import { validateRouteManifest } from "../../../scripts/check/check-route-manifest";
import { FAST_CHECKS } from "../../../scripts/check/rule-registry";

const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");

describe("route manifest fast check", () => {
  it("is registered in the fast-check suite", () => {
    const spec = FAST_CHECKS.find((check) => check.id === "check-route-manifest");

    expect(spec?.script).toBe("scripts/check/check-route-manifest.ts");
    expect(spec?.owner).toBe("tests");
  });

  it("accepts the current repository", () => {
    expect(validateRouteManifest(PROJECT_ROOT)).toEqual([]);
  });

  it("checks every manifest row, not just one", () => {
    // An empty project has no routes and no test files, so every manifest row
    // must be reported as stale. A gate that only inspected a single row would
    // return one gap here.
    const empty = mkdtempSync(join(tmpdir(), "route-manifest-"));

    try {
      const gaps = validateRouteManifest(empty);

      expect(gaps.length).toBeGreaterThanOrEqual(APP_ROUTE_COVERAGE.length);
      expect(gaps.every((gap) => gap.startsWith("[stale-route]"))).toBe(true);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
