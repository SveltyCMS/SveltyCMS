/**
 * @file tests/unit/scripts/upgrade-options.test.ts
 * @description Unit tests for the upgrade CLI flag parsing (scripts/upgrade.ts).
 *
 * Features tested:
 * - defaults (dry-run off, tests/SBOM on, benchmarks opt-in, branch `next`)
 * - every supported flag
 * - `--branch` allowlist rejects shell-injection attempts
 */
import { describe, it, expect } from "vitest";
import { parseOptions } from "../../../scripts/upgrade";

describe("upgrade CLI options", () => {
  it("defaults to a merge upgrade on `next` with benchmarks opt-in", () => {
    expect(parseOptions([])).toEqual({
      dryRun: false,
      skipTests: false,
      skipSbom: false,
      skipMerge: false,
      force: false,
      branch: "next",
      benchmarks: false,
    });
  });

  it("parses every supported flag", () => {
    expect(
      parseOptions([
        "--dry-run",
        "--skip-tests",
        "--skip-sbom",
        "--skip-merge",
        "--force",
        "--benchmarks",
      ]),
    ).toEqual({
      dryRun: true,
      skipTests: true,
      skipSbom: true,
      skipMerge: true,
      force: true,
      branch: "next",
      benchmarks: true,
    });
  });

  it("accepts a safe --branch and rejects shell-injection attempts", () => {
    expect(parseOptions(["--branch=release/2027"]).branch).toBe("release/2027");
    expect(() => parseOptions(["--branch=next; rm -rf /"])).toThrow(/Invalid --branch value/);
    expect(() => parseOptions(["--branch=$(whoami)"])).toThrow(/Invalid --branch value/);
  });
});
