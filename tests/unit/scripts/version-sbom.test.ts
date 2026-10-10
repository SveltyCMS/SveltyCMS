/**
 * @file tests/unit/scripts/version-sbom.test.ts
 * @description Contract tests for the SBOM ↔ manifest lockstep in
 * `scripts/version.ts` (`readPackageIdentity`, `syncSbomVersion`, `findSbomDrift`)
 * and the `--verify` CLI flag. The release workflow runs `version:verify` before
 * tagging, so a stale or hand-edited `sbom.json` must fail loudly instead of
 * shipping under a mismatched version. The functions are pure and imported
 * directly — the process is never spawned.
 *
 * Features:
 * - SBOM root-component rewrite preserves every unrelated byte
 * - drift detection covers name, version and purl separately
 * - `--verify` parsing (+ `--dry-run` coexistence) is asserted on the contract
 */

import { describe, it, expect } from "vitest";
import {
  findSbomDrift,
  parseCliArgs,
  readPackageIdentity,
  syncSbomVersion,
} from "../../../scripts/version";

/** A minimal CycloneDX BOM shaped like the repository's `sbom.json`. */
function bom(version: string, name = "create-sveltycms"): string {
  return JSON.stringify(
    {
      bomFormat: "CycloneDX",
      specVersion: "1.5",
      metadata: {
        timestamp: "2026-10-08T19:15:49.330Z",
        tools: [{ name: "sveltycms-sbom", version: "1.0.0" }],
        component: { name, version, type: "application", purl: `pkg:npm/${name}@${version}` },
      },
      components: [
        { type: "library", name: "left-pad", version: "1.3.0", purl: "pkg:npm/left-pad@1.3.0" },
      ],
    },
    null,
    2,
  );
}

const MANIFEST = JSON.stringify({ name: "create-sveltycms", version: "0.2.0" }, null, 2);

describe("readPackageIdentity", () => {
  it("reads the manifest name and version", () => {
    expect(readPackageIdentity(MANIFEST)).toEqual({ name: "create-sveltycms", version: "0.2.0" });
  });

  it("throws on invalid JSON", () => {
    expect(() => readPackageIdentity("{ nope")).toThrow(/not valid JSON/);
  });

  it("throws when the name is missing or empty", () => {
    expect(() => readPackageIdentity('{"version":"0.2.0"}')).toThrow(/non-empty string "name"/);
    expect(() => readPackageIdentity('{"name":"","version":"0.2.0"}')).toThrow(
      /non-empty string "name"/,
    );
  });

  it("throws when the version is missing", () => {
    expect(() => readPackageIdentity('{"name":"create-sveltycms"}')).toThrow(/"version" field/);
  });
});

describe("syncSbomVersion", () => {
  it("rewrites the root component to the manifest identity", () => {
    const synced = syncSbomVersion(bom("0.1.2"), "create-sveltycms", "0.2.0")!;
    const component = (JSON.parse(synced) as any).metadata.component;

    expect(component).toEqual({
      name: "create-sveltycms",
      version: "0.2.0",
      type: "application",
      purl: "pkg:npm/create-sveltycms@0.2.0",
    });
  });

  it("leaves every unrelated byte intact (timestamps, tools, components)", () => {
    const original = bom("0.1.2");
    const synced = syncSbomVersion(original, "create-sveltycms", "0.2.0")!;
    const before = JSON.parse(original) as any;
    const after = JSON.parse(synced) as any;

    expect(after.bomFormat).toBe(before.bomFormat);
    expect(after.specVersion).toBe(before.specVersion);
    expect(after.metadata.timestamp).toBe(before.metadata.timestamp);
    expect(after.metadata.tools).toEqual(before.metadata.tools);
    expect(after.components).toEqual(before.components);
    // The only textual change is the version (twice: field + purl).
    expect(synced.split("0.2.0")).toHaveLength(3);
  });

  it("is idempotent", () => {
    const once = syncSbomVersion(bom("0.1.2"), "create-sveltycms", "0.2.0")!;
    expect(syncSbomVersion(once, "create-sveltycms", "0.2.0")).toBe(once);
  });

  it("returns null for unparseable JSON or a missing root component", () => {
    expect(syncSbomVersion("{ nope", "create-sveltycms", "0.2.0")).toBeNull();
    expect(
      syncSbomVersion(JSON.stringify({ metadata: {} }), "create-sveltycms", "0.2.0"),
    ).toBeNull();
    expect(syncSbomVersion(JSON.stringify({}), "create-sveltycms", "0.2.0")).toBeNull();
  });
});

describe("findSbomDrift", () => {
  it("returns no problems when the BOM mirrors the manifest", () => {
    expect(findSbomDrift(bom("0.2.0"), "create-sveltycms", "0.2.0")).toEqual([]);
  });

  it("reports a version and purl mismatch", () => {
    const problems = findSbomDrift(bom("0.1.2"), "create-sveltycms", "0.2.0");
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toMatch(/version 0\.1\.2 ≠ 0\.2\.0/);
    expect(problems.join("\n")).toMatch(/purl pkg:npm\/create-sveltycms@0\.1\.2/);
  });

  it("reports a name mismatch", () => {
    const problems = findSbomDrift(bom("0.2.0", "other-name"), "create-sveltycms", "0.2.0");
    expect(problems.join("\n")).toMatch(/name other-name ≠ create-sveltycms/);
  });

  it("reports unparseable JSON and a missing root component", () => {
    expect(findSbomDrift("{ nope", "create-sveltycms", "0.2.0").join()).toMatch(/not valid JSON/);
    expect(findSbomDrift(JSON.stringify({}), "create-sveltycms", "0.2.0").join()).toMatch(
      /no metadata.component/,
    );
  });
});

describe("parseCliArgs --verify", () => {
  it("selects verify mode", () => {
    expect(parseCliArgs(["--verify"])).toEqual({
      dryRun: false,
      verify: true,
      request: { mode: "kind", kind: "auto" },
    });
  });

  it("coexists with --dry-run", () => {
    expect(parseCliArgs(["--verify", "--dry-run"]).verify).toBe(true);
    expect(parseCliArgs(["--verify", "--dry-run"]).dryRun).toBe(true);
  });

  it("defaults verify to false", () => {
    expect(parseCliArgs([]).verify).toBe(false);
  });
});
