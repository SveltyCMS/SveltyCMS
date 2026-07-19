/**
 * @file tests/unit/ci/quality-gate-smoke.test.ts
 * @description Ensures pre-push precheck is change-scoped to origin/next and CI-parity capable.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTEGRATION_DB_MATRIX } from "@src/utils/test-db-credentials";

const ROOT = join(import.meta.dirname, "../../..");

describe("pre-push precheck CI smoke", () => {
  it("precheck-shared manifest includes build, integration, and benchmarks per DB", () => {
    const source = readFileSync(join(ROOT, "scripts/precheck-shared.ts"), "utf8");

    expect(source).toContain('name: "Production Build"');
    expect(source).toContain("INTEGRATION_DB_MATRIX");
    expect(source).toContain("COMPILE_ALL_ADAPTERS");
    expect(source).toContain("--no-build");
    expect(source).toContain("name: `Integration (${db})`");
    expect(source).toContain("name: `Benchmarks (${db})`");
    expect(source).toContain("run-core-benchmarks.ts");
    // Push unit gate must stay unit-only (SQLite HTTP is the separate smoke task)
    expect(source).toContain("--unit-only");
    // Diff base must prefer upstream / origin/next (not hard-coded origin/main)
    expect(source).toContain("resolveDiffBase");
    expect(source).toContain("origin/next");
    expect(source).not.toMatch(/merge-base origin\/main HEAD.*\|\|.*merge-base main HEAD/);

    expect(INTEGRATION_DB_MATRIX).toEqual(["sqlite", "mongodb", "mariadb", "postgresql"]);
  });

  it("quality-gate.ts delegates to precheck push tier", () => {
    const source = readFileSync(join(ROOT, "scripts/quality-gate.ts"), "utf8");
    expect(source).toContain("runPrecheckCli");
    expect(source).toContain('tier: "push"');
  });

  it("pre-push hook invokes precheck.ts push tier", () => {
    const hook = readFileSync(join(ROOT, ".githooks/pre-push"), "utf8");
    expect(hook).toContain("verify:push");
    expect(hook).toContain("origin/next");
  });

  it("unit tests always run on push tier (no skip property)", () => {
    const source = readFileSync(join(ROOT, "scripts/precheck-shared.ts"), "utf8");
    const unitStart = source.indexOf('name: "Full Unit Tests"');
    const unitEnd = source.indexOf('name: "CI Test Preview"', unitStart);
    const unitBlock = source.slice(unitStart, unitEnd);
    expect(unitBlock).toContain('name: "Full Unit Tests"');
    expect(unitBlock).not.toContain("skip:");
  });
});
