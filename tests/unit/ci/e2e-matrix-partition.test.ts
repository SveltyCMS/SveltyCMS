/**
 * @file tests/unit/ci/e2e-matrix-partition.test.ts
 * @description Guards the CI E2E shard partition.
 *
 * `--grep` decides which specs run in each shard. A spec that matches no group is
 * silently never executed in CI; one that matches two runs twice. Both look green,
 * so both are pinned here:
 *
 * - `smoke.spec.ts` (auth → CRUD → persistence) and `layout-shift.spec.ts` matched
 *   no group at all.
 * - `routes/dashboard/accessibility.spec.ts` matched Media & Dashboard *and*
 *   Auth & Branding and paid for the axe audit twice.
 *
 * Playwright matches `--grep` against `titlePath()` — file path plus describe/test
 * titles — and the path element uses the **OS separator**. A pattern written with
 * `/` only therefore selects zero tests on Windows, so both forms are checked.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHARD_GROUPS } from "../../../.github/workflows/e2e-matrix.ts";

const ROOT = join(import.meta.dirname, "../../..");
const E2E_DIR = join(ROOT, "tests/e2e");

/** Mirrors the chromium project's testIgnore — those specs belong to other projects. */
const NOT_IN_SHARDS = [
  "setup-wizard.spec.ts",
  "/routes/login/login.spec.ts",
  "/routes/login/signup.spec.ts",
  "/routes/login/oauth.spec.ts",
];

function collectSpecs(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSpecs(full, out);
      continue;
    }
    if (!entry.name.endsWith(".spec.ts")) continue;
    const normalized = full.replaceAll("\\", "/");
    if (NOT_IN_SHARDS.some((suffix) => normalized.endsWith(suffix))) continue;
    out.push(full);
  }
  return out;
}

/**
 * Everything Playwright's grep can see: the spec path **relative to `tests/e2e`**
 * (either separator) plus the describe/test titles, joined the same way the runner
 * does. File bodies are excluded — a comment that mentions another spec's path is
 * not a selector, and including it produced false "runs twice" reports.
 */
function haystackFor(file: string): string {
  const rel = file.slice(E2E_DIR.length + 1).replaceAll("\\", "/");
  const titles = [
    ...readFileSync(file, "utf8").matchAll(/(?:describe|test)\(\s*["'`]([^"'`]+)["'`]/g),
  ]
    .map((match) => match[1])
    .join("\n");
  return `chromium ${rel}\n${rel.replaceAll("/", "\\")}\n${titles}`;
}

const specs = collectSpecs(E2E_DIR);

describe("CI E2E matrix partition", () => {
  it("declares unique, non-empty shard groups", () => {
    expect(new Set(SHARD_GROUPS.map((group) => group.name)).size).toBe(SHARD_GROUPS.length);
    for (const group of SHARD_GROUPS) {
      expect(group.grep.length, `${group.name} needs a grep`).toBeGreaterThan(0);
    }
  });

  it("matches every chromium spec exactly once", () => {
    expect(specs.length).toBeGreaterThan(40);

    const unmatched: string[] = [];
    const duplicated: string[] = [];

    for (const file of specs) {
      const haystack = haystackFor(file);
      const hits = SHARD_GROUPS.filter((group) => new RegExp(group.grep).test(haystack)).map(
        (group) => group.name,
      );
      const rel = file.slice(E2E_DIR.length + 1).replaceAll("\\", "/");
      if (hits.length === 0) unmatched.push(rel);
      if (hits.length > 1) duplicated.push(`${rel} → ${hits.join(" + ")}`);
    }

    expect(unmatched, `specs that would never run in CI:\n${unmatched.join("\n")}`).toEqual([]);
    expect(duplicated, `specs that would run twice:\n${duplicated.join("\n")}`).toEqual([]);
  });

  it("leaves no shard empty", () => {
    // An empty grep group spins up a runner that fails on "no tests found".
    const empty = SHARD_GROUPS.filter(
      (group) => !specs.some((file) => new RegExp(group.grep).test(haystackFor(file))),
    );
    expect(empty.map((group) => group.name)).toEqual([]);
  });

  /**
   * The shard count is quoted in the rulebook and in the testing docs. It drifted
   * from 9 to 11 when two groups were split and nothing noticed for weeks, so the
   * number now has to match the partition that actually runs.
   */
  it("keeps the documented shard count in step with the matrix", () => {
    const total = SHARD_GROUPS.length;
    const files = [
      "AGENTS.md",
      "docs/tests/git-workflow.mdx",
      "docs/tests/index.mdx",
      "docs/tests/e2e-architecture.mdx",
    ];

    const stale = files.filter((file) => {
      const source = readFileSync(join(ROOT, file), "utf8");
      // Matches "11 E2E shards", "9-shard" and "(11 sharded)".
      const claims = [...source.matchAll(/(\d+)[\s-]*(?:E2E\s+)?shard(?:s|ed)?\b/gi)].map((match) =>
        Number(match[1]),
      );
      return claims.some((claim) => claim !== total);
    });

    expect(stale, `documents still quoting a shard count other than ${total}`).toEqual([]);
  });
});
