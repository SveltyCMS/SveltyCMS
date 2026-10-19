/**
 * @file tests/unit/ci/e2e-matrix-partition.test.ts
 * @description Guards the CI E2E shard partition.
 *
 * `--grep` decides which specs run in each shard. A spec that matches no group
 * is silently never executed in CI, so a green run can hide a real regression.
 * This test fails if any chromium spec falls outside every shard.
 *
 * Duplicate matches are tolerated here (a spec may run in two groups); the
 * invariant under test is "no spec is dropped", not "exactly one".
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHARD_GROUPS } from "../../../.github/workflows/e2e-matrix.ts";

const ROOT = join(import.meta.dirname, "../../..");
const E2E_DIR = join(ROOT, "tests/e2e");

/** Mirrors the chromium project's testIgnore; smoke.spec.ts is pre-push only. */
const NOT_IN_SHARDS = [
  /setup-wizard\.spec\.ts$/,
  /routes[\\/]login[\\/](login|signup|oauth)\.spec\.ts$/,
  /tests[\\/]e2e[\\/]smoke\.spec\.ts$/,
];

function collectSpecs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectSpecs(full, out);
    else if (entry.name.endsWith(".spec.ts") && !NOT_IN_SHARDS.some((re) => re.test(full))) {
      out.push(full.replaceAll("\\", "/"));
    }
  }
  return out;
}

describe("CI E2E matrix partition", () => {
  it("declares the expected shard groups", () => {
    expect(SHARD_GROUPS.length).toBe(8);
    expect(new Set(SHARD_GROUPS.map((g) => g.name)).size).toBe(8);
    for (const group of SHARD_GROUPS) {
      expect(group.grep.length, `${group.name} needs a grep`).toBeGreaterThan(0);
    }
  });

  it("every chromium spec matches at least one shard group", () => {
    const specs = collectSpecs(E2E_DIR);
    expect(specs.length).toBeGreaterThan(40);

    const dropped = specs.filter((file) => {
      // Title-based greps can match describe names as well as the path.
      const haystack = `${file}\n${readFileSync(file, "utf8")}`;
      return !SHARD_GROUPS.some((group) => new RegExp(group.grep, "i").test(haystack));
    });

    expect(dropped, `specs not covered by any E2E shard:\n${dropped.join("\n")}`).toEqual([]);
  });
});
