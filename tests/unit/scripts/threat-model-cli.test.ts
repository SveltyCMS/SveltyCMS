/**
 * @file tests/unit/scripts/threat-model-cli.test.ts
 * @description CLI contract of the threat-model drift gate
 * (`scripts/security/check-threat-model-drift.ts`). `threat-model-drift.test.ts`
 * already covers the pure evaluation library; this file pins the argument
 * surface and the one write-path guard the library tests cannot reach: a typo
 * must exit 2 (never silently default to `--check` and pass), and `--update`
 * must refuse — without touching the manifest — when a surface matches no files.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCliArgs } from "../../../scripts/security/check-threat-model-drift";

const SCRIPT = resolve(process.cwd(), "scripts/security/check-threat-model-drift.ts");
const PLACEHOLDER = "0".repeat(64);

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "threat-model-cli-"));
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const absolute = join(root, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("argument parsing", () => {
  it("defaults to --check with no JSON", () => {
    expect(parseCliArgs([])).toEqual({
      mode: "check",
      json: false,
      date: undefined,
      help: false,
    });
  });

  it("accepts --update with a date and --json", () => {
    expect(parseCliArgs(["--update", "--date", "2026-11-05", "--json"])).toEqual({
      mode: "update",
      json: true,
      date: "2026-11-05",
      help: false,
    });
  });

  it("accepts the --date=value form", () => {
    expect(parseCliArgs(["--date=2026-11-05"]).date).toBe("2026-11-05");
  });

  it("rejects --check together with --update", () => {
    expect(() => parseCliArgs(["--check", "--update"])).toThrow(/mutually exclusive/);
  });

  it("rejects a misspelled mode instead of defaulting to --check", () => {
    expect(() => parseCliArgs(["--udpate"])).toThrow(/Unknown argument: --udpate/);
  });

  it("rejects a malformed or missing --date", () => {
    expect(() => parseCliArgs(["--date", "05-11-2026"])).toThrow(/Invalid --date/);
    expect(() => parseCliArgs(["--date"])).toThrow(/requires a YYYY-MM-DD value/);
  });

  it("reports --help without throwing", () => {
    expect(parseCliArgs(["--help"]).help).toBe(true);
    expect(parseCliArgs(["-h"]).help).toBe(true);
  });
});

describe("--update safety", () => {
  it("refuses to write when a surface matches no files", async () => {
    const root = makeRoot();
    const manifest = {
      version: 1,
      surfaces: [
        {
          id: "empty-surface",
          description: "matches nothing",
          paths: ["src/routes/missing/**"],
          model: "docs/security/threat-models/empty-surface.mdx",
          reviewed_at: "2026-11-05",
          fingerprint: PLACEHOLDER,
        },
      ],
    };
    write(root, "docs/security/threat-model.json", JSON.stringify(manifest, null, 2));

    // `tests/unit/setup.ts` stubs `node:child_process`; use the real one.
    const { spawnSync: realSpawnSync } =
      await vi.importActual<typeof import("node:child_process")>("node:child_process");
    const result = realSpawnSync(process.env.BUN_BINARY ?? "bun", [SCRIPT, "--update"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toContain("match no files");

    const onDisk = JSON.parse(
      readFileSync(join(root, "docs/security/threat-model.json"), "utf8"),
    ) as { surfaces: Array<{ fingerprint: string }> };
    expect(onDisk.surfaces[0].fingerprint).toBe(PLACEHOLDER);
  }, 30_000);
});
