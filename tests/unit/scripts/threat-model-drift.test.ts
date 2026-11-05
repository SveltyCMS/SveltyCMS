/**
 * @file tests/unit/scripts/threat-model-drift.test.ts
 * @description Unit tests for the threat-model drift gate: glob matching,
 * fingerprint determinism, drift/missing-model/uncovered/stale detection and
 * the `--update` → `--check` round-trip through the real CLI.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeFingerprint,
  evaluateManifest,
  isStale,
  matchGlob,
  parseManifest,
  resolveSurfaceFiles,
  type Manifest,
  type ThreatSurface,
} from "../../../scripts/security/threat-model-lib";

const SCRIPT = resolve(process.cwd(), "scripts/security/check-threat-model-drift.ts");
const MODEL = "docs/security/threat-models/test-surface.mdx";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "threat-model-"));
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

function writeModel(root: string): void {
  write(root, MODEL, "# Test surface\n");
}

function buildSurface(root: string, overrides: Partial<ThreatSurface> = {}): ThreatSurface {
  const paths = overrides.paths ?? ["src/routes/**"];
  const files = resolveSurfaceFiles({ paths }, root);
  const fingerprint = computeFingerprint(
    files.map((path) => ({ path, content: readFileSync(join(root, path), "utf8") })),
  );

  return {
    id: "test-surface",
    description: "unit-test surface",
    paths,
    model: MODEL,
    reviewed_at: "2026-11-05",
    fingerprint,
    ...overrides,
  };
}

function manifestOf(surface: ThreatSurface): Manifest {
  return { version: 1, surfaces: [surface] };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("glob matching", () => {
  it("matches ** across segments, * inside one segment and exact paths", () => {
    expect(matchGlob("src/routes/**/+server.ts", "src/routes/api/deep/x/+server.ts")).toBe(true);
    expect(matchGlob("src/routes/**/+server.ts", "src/routes/+server.ts")).toBe(true);
    expect(matchGlob("src/routes/*/+server.ts", "src/routes/api/+server.ts")).toBe(true);
    expect(matchGlob("src/routes/*/+server.ts", "src/routes/api/deep/+server.ts")).toBe(false);
    expect(matchGlob("src/hooks.server.ts", "src/hooks.server.ts")).toBe(true);
    expect(matchGlob("src/hooks.server.ts", "src/hooks.server.tsx")).toBe(false);
  });

  it("treats route-group parentheses literally", () => {
    expect(matchGlob("src/routes/(app)/**", "src/routes/(app)/config/+page.server.ts")).toBe(true);
    expect(matchGlob("src/routes/(app)/**", "src/routes/app/config/+page.server.ts")).toBe(false);
  });
});

describe("surface resolution", () => {
  it("returns sorted, deduplicated files for overlapping patterns", () => {
    const root = makeRoot();
    write(root, "src/routes/api/b/+server.ts", "b");
    write(root, "src/routes/api/a/+server.ts", "a");
    write(root, "src/routes/api/notes.md", "notes");

    const files = resolveSurfaceFiles(
      { paths: ["src/routes/api/**", "src/routes/**/+server.ts"] },
      root,
    );

    expect(files).toEqual([
      "src/routes/api/a/+server.ts",
      "src/routes/api/b/+server.ts",
      "src/routes/api/notes.md",
    ]);
  });
});

describe("computeFingerprint", () => {
  it("is stable across input ordering", () => {
    const first = computeFingerprint([
      { path: "b.ts", content: "two" },
      { path: "a.ts", content: "one" },
    ]);
    const second = computeFingerprint([
      { path: "a.ts", content: "one" },
      { path: "b.ts", content: "two" },
    ]);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when one byte changes", () => {
    const before = computeFingerprint([{ path: "a.ts", content: "one" }]);
    const after = computeFingerprint([{ path: "a.ts", content: "onE" }]);

    expect(before).not.toBe(after);
  });
});

describe("evaluateManifest", () => {
  it("reports drift only after a matched file changes", () => {
    const root = makeRoot();
    writeModel(root);
    write(root, "src/routes/api/a/+server.ts", "export const GET = () => 1;\n");
    const manifest = manifestOf(buildSurface(root));

    expect(evaluateManifest(manifest, root, "2026-11-05").drifted).toEqual([]);

    write(root, "src/routes/api/a/+server.ts", "export const GET = () => 2;\n");
    expect(evaluateManifest(manifest, root, "2026-11-05").drifted).toEqual(["test-surface"]);
  });

  it("reports a missing model file", () => {
    const root = makeRoot();
    write(root, "src/routes/api/a/+server.ts", "export const GET = () => 1;\n");
    const manifest = manifestOf(buildSurface(root));

    expect(evaluateManifest(manifest, root, "2026-11-05").missingModels).toEqual(["test-surface"]);
  });

  it("reports server routes no surface matches", () => {
    const root = makeRoot();
    writeModel(root);
    write(root, "src/routes/api/a/+server.ts", "export const GET = () => 1;\n");
    const manifest = manifestOf(buildSurface(root, { paths: ["src/routes/api/**"] }));

    write(root, "src/routes/orphan/+server.ts", "export const GET = () => 1;\n");
    const evaluation = evaluateManifest(manifest, root, "2026-11-05");

    expect(evaluation.uncovered).toEqual(["src/routes/orphan/+server.ts"]);
    expect(evaluation.coverage).toEqual({ covered: 1, total: 2, percent: 50 });
  });

  it("flags reviews older than 12 months", () => {
    const root = makeRoot();
    writeModel(root);
    write(root, "src/routes/api/a/+server.ts", "export const GET = () => 1;\n");
    const manifest = manifestOf(buildSurface(root, { reviewed_at: "2024-01-01" }));

    expect(evaluateManifest(manifest, root, "2026-11-05").stale).toEqual(["test-surface"]);
    expect(isStale("2025-11-05", "2026-11-05")).toBe(false);
    expect(isStale("2025-11-04", "2026-11-05")).toBe(true);
  });
});

describe("CLI round-trip", () => {
  it("--update recomputes fingerprints so --check passes", async () => {
    const root = makeRoot();
    write(root, "src/routes/api/ping/+server.ts", "export const GET = () => 'pong';\n");
    write(root, "docs/security/threat-models/test-surface.mdx", "# Test surface\n");

    const placeholder: Manifest = {
      version: 1,
      surfaces: [
        {
          id: "test-surface",
          description: "unit-test surface",
          paths: ["src/routes/api/**"],
          model: MODEL,
          reviewed_at: "2020-01-01",
          fingerprint: "0".repeat(64),
        },
      ],
    };
    write(root, "docs/security/threat-model.json", JSON.stringify(placeholder, null, 2));

    // `tests/unit/setup.ts` stubs `node:child_process`; the round-trip needs the
    // real CLI under Bun, so load the actual module explicitly.
    const { spawnSync: realSpawnSync } =
      await vi.importActual<typeof import("node:child_process")>("node:child_process");
    const bun = process.env.BUN_BINARY ?? "bun";

    const update = realSpawnSync(bun, [SCRIPT, "--update", "--date", "2026-11-05"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(update.error).toBeUndefined();
    expect(update.status, update.stderr).toBe(0);

    const updated = parseManifest(
      JSON.parse(readFileSync(join(root, "docs/security/threat-model.json"), "utf8")),
    );
    expect(updated.surfaces[0].reviewed_at).toBe("2026-11-05");
    expect(updated.surfaces[0].fingerprint).not.toBe("0".repeat(64));

    const check = realSpawnSync(bun, [SCRIPT, "--check"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(check.error).toBeUndefined();
    expect(check.status, check.stderr).toBe(0);
    expect(check.stdout).toContain("Coverage: 1/1 route server files (100.0%)");

    write(root, "src/routes/api/ping/+server.ts", "export const GET = () => 'changed';\n");
    const drifted = realSpawnSync(bun, [SCRIPT, "--check"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(drifted.status).toBe(1);
    expect(drifted.stdout).toContain("drift");
  }, 30_000);

  it("--check exits 2 on an unreadable manifest", async () => {
    const root = makeRoot();
    write(root, "docs/security/threat-model.json", "{ not json");
    const { spawnSync: realSpawnSync } =
      await vi.importActual<typeof import("node:child_process")>("node:child_process");

    const result = realSpawnSync(process.env.BUN_BINARY ?? "bun", [SCRIPT, "--check"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid JSON");
  }, 30_000);
});
