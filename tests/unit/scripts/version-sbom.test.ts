/**
 * @file tests/unit/scripts/version-sbom.test.ts
 * @description Contract tests for the SBOM ↔ manifest lockstep in
 * `scripts/version.ts` (`readPackageIdentity`, `syncSbomVersion`, `findSbomDrift`)
 * and the `--verify` CLI flag. The release workflow runs `version:verify` before
 * tagging, so a stale or hand-edited `sbom.json` must fail loudly instead of
 * shipping under a mismatched version. Also pins the lock-advisory contract of
 * the two security CLIs: `generate-sbom.ts` (registry vs `file:`/`git:`
 * specifiers, CycloneDX `dependencies` graph) and `risk-audit.ts` (advisory ids
 * are read from structured/line-scoped sources, never from prose). All helpers
 * are pure and imported directly — no process is spawned.
 *
 * Features:
 * - SBOM root-component rewrite preserves every unrelated byte
 * - drift detection covers name, version and purl separately
 * - `--verify` parsing (+ `--dry-run` coexistence) is asserted on the contract
 * - `file:`/`git+https://` lock entries never masquerade as a real version
 * - `dependencies[].dependsOn` is populated and deterministic
 * - a suppressed GHSA mentioned in advisory prose cannot mask a real finding
 */

import { describe, it, expect } from "vitest";
import {
  findSbomDrift,
  parseCliArgs,
  readPackageIdentity,
  syncSbomVersion,
} from "../../../scripts/version";
import {
  buildSbom,
  parseBunLockText,
  parseLockSpecifier,
  type SbomManifest,
} from "../../../scripts/security/generate-sbom";
import {
  extractAdvisoryIds,
  parseAuditJson,
  unsuppressedAdvisories,
} from "../../../scripts/security/risk-audit";

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

/** Synthetic `bun.lock` body: registry, `file:`, `git+https://` and a dependent. */
const LOCK_FIXTURE = [
  "{",
  '  "lockfileVersion": 1,',
  '  "packages": {',
  '    "left-pad": ["left-pad@1.3.0", "", {}, "sha512-left-pad"],',
  '    "local-thing": ["local-thing@file:../vendor/local-thing"],',
  '    "git-thing": ["git-thing@git+https://github.com/example/git-thing.git#abc123"],',
  '    "@scope/consumer": ["@scope/consumer@2.0.0", "", {',
  '      "dependencies": { "left-pad": "^1.3.0", "git-thing": "git+https://github.com/example/git-thing.git#abc123" }',
  '    }, "sha512-consumer"]',
  "  }",
  "}",
].join("\n");

const SBOM_MANIFEST: SbomManifest = {
  name: "create-sveltycms",
  version: "0.13.0",
  devDependencies: { "left-pad": "1.3.0" },
};

const GIT_SPECIFIER = "git-thing@git+https://github.com/example/git-thing.git#abc123";
const FILE_SPECIFIER = "local-thing@file:../vendor/local-thing";

describe("parseLockSpecifier", () => {
  it("keeps a registry package name + version", () => {
    expect(parseLockSpecifier("@scope/pkg@2.0.0")).toEqual({
      name: "@scope/pkg",
      version: "2.0.0",
      bomRef: "pkg:npm/@scope/pkg@2.0.0",
      purl: "pkg:npm/@scope/pkg@2.0.0",
      registry: true,
    });
  });

  it("treats a file: specifier as a non-registry component", () => {
    const parsed = parseLockSpecifier(FILE_SPECIFIER, "local-thing");
    expect(parsed.name).toBe("local-thing");
    expect(parsed.version).toBe("0.0.0");
    expect(parsed.registry).toBe(false);
    expect(parsed.purl).toBeUndefined();
    expect(parsed.bomRef).toBe(`urn:sveltycms:lock:${encodeURIComponent(FILE_SPECIFIER)}`);
  });

  it("treats a git+https:// specifier as a non-registry component", () => {
    const parsed = parseLockSpecifier(GIT_SPECIFIER, "git-thing");
    expect(parsed.name).toBe("git-thing");
    expect(parsed.version).toBe("0.0.0");
    expect(parsed.bomRef).toBe(`urn:sveltycms:lock:${encodeURIComponent(GIT_SPECIFIER)}`);
    // The `@` inside the URL must never become the version separator.
    expect(parsed.version).not.toContain("github.com");
  });

  it("never splits on a dist-tag that does not start with a digit", () => {
    expect(parseLockSpecifier("left-pad@latest")).toMatchObject({
      name: "left-pad",
      version: "0.0.0",
      registry: false,
    });
  });
});

describe("parseBunLockText + buildSbom", () => {
  it("resolves every fixture entry", () => {
    const packages = parseBunLockText(LOCK_FIXTURE);
    expect(packages.map((pkg) => `${pkg.name}@${pkg.version}`).sort()).toEqual([
      "@scope/consumer@2.0.0",
      "git-thing@0.0.0",
      "left-pad@1.3.0",
      "local-thing@0.0.0",
    ]);
    expect(packages.find((pkg) => pkg.name === "left-pad")?.integrity).toBe("sha512-left-pad");
  });

  it("populates dependsOn and sorts components by bom-ref", () => {
    const sbom = buildSbom(parseBunLockText(LOCK_FIXTURE), SBOM_MANIFEST);
    const refs = sbom.components.map((component) => component["bom-ref"]);
    expect(refs).toEqual(refs.toSorted());
    expect(sbom.dependencies).toHaveLength(sbom.components.length);

    const consumer = sbom.dependencies.find((node) => node.ref === "pkg:npm/@scope/consumer@2.0.0");
    expect(consumer?.dependsOn).toEqual([
      "pkg:npm/left-pad@1.3.0",
      `urn:sveltycms:lock:${encodeURIComponent(GIT_SPECIFIER)}`,
    ]);
    expect(sbom.dependencies.find((node) => node.ref === "pkg:npm/left-pad@1.3.0")).toEqual({
      ref: "pkg:npm/left-pad@1.3.0",
      dependsOn: [],
    });
  });

  it("scopes dev dependencies and keeps the root component shape", () => {
    const sbom = buildSbom(parseBunLockText(LOCK_FIXTURE), SBOM_MANIFEST);
    expect(sbom.components.find((component) => component.name === "left-pad")?.scope).toBe(
      "excluded",
    );
    expect(sbom.metadata.component).toEqual({
      name: "create-sveltycms",
      version: "0.13.0",
      type: "application",
      purl: "pkg:npm/create-sveltycms@0.13.0",
    });
    expect(sbom.specVersion).toBe("1.5");
  });

  it("is deterministic across builds (ignoring serial/timestamp)", () => {
    const first = buildSbom(parseBunLockText(LOCK_FIXTURE), SBOM_MANIFEST);
    const second = buildSbom(parseBunLockText(LOCK_FIXTURE), SBOM_MANIFEST);
    expect(first.components).toEqual(second.components);
    expect(first.dependencies).toEqual(second.dependencies);
  });

  it("returns nothing for a lock without packages", () => {
    expect(parseBunLockText('{"lockfileVersion":1}')).toEqual([]);
  });
});

/** `bun audit --json` shape: the advisory id lives in `url`, prose lives in `title`. */
const STRUCTURED_AUDIT = JSON.stringify({
  deepmerge: [
    {
      id: 1243505,
      url: "https://github.com/advisories/GHSA-gcqx-w48m-w2h4",
      title: "deepmerge mergeObject() allows prototype poisoning of returned objects",
      severity: "low",
    },
  ],
  "pkg-a": [
    {
      id: 999,
      url: "https://github.com/advisories/GHSA-real-bbbb-cccc",
      title: "mentions GHSA-gcqx-w48m-w2h4 in prose",
      severity: "high",
    },
  ],
});

describe("extractAdvisoryIds (risk-audit)", () => {
  it("reads ids from the structured reporter, never from prose", () => {
    expect(extractAdvisoryIds(STRUCTURED_AUDIT)).toEqual([
      "GHSA-gcqx-w48m-w2h4",
      "GHSA-real-bbbb-cccc",
    ]);
  });

  it("does not let a suppressed mention in prose mask a real finding", () => {
    const ids = extractAdvisoryIds(STRUCTURED_AUDIT);
    expect(unsuppressedAdvisories(ids)).toEqual(["GHSA-real-bbbb-cccc"]);
  });

  it("falls back to line-scoped human output", () => {
    const human = [
      "bun audit v1.4.2",
      "",
      "deepmerge@4.3.1",
      "  low: prototype poisoning - https://github.com/advisories/GHSA-gcqx-w48m-w2h4",
      "GHSA-real-dddd-eeee",
      "  Advisory: GHSA-other-ffff-0000 affects something",
    ].join("\n");
    expect(extractAdvisoryIds(human)).toEqual([
      "GHSA-gcqx-w48m-w2h4",
      "GHSA-other-ffff-0000",
      "GHSA-real-dddd-eeee",
    ]);
  });

  it("ignores an id that only appears in prose", () => {
    expect(extractAdvisoryIds("  title mentions GHSA-fake-1111-2222 but is prose")).toEqual([]);
  });

  it("returns null when stdout is not the JSON reporter", () => {
    expect(parseAuditJson("deepmerge@4.3.1\n  low: advisory")).toBeNull();
    expect(parseAuditJson("{ truncated")).toBeNull();
    expect(parseAuditJson("")).toBeNull();
  });
});
