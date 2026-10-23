/**
 * @file tests/unit/ci/ci-tier-contract.test.ts
 * @description Structural contract for the two-tier `ci.yml` split.
 *
 * The workflow runs a FAST tier (pull requests, pushes to `next`) and a FULL tier
 * (merge queue, nightly, manual dispatch, pushes to `main`). Two mistakes are
 * silent and expensive, so they are pinned here:
 *
 * 1. A gated job that references `needs.plan.outputs.tier` **without** `plan` in
 *    its `needs` list. The expression evaluates to an empty string, the job is
 *    always skipped, and the full matrix stops running without any red check.
 * 2. `paths-ignore` on `pull_request`. GitHub never reports a required check for
 *    a workflow that path filters skip, so docs-only PRs become unmergeable.
 *
 * @see .github/workflows/ci.yml
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CI_YML = readFileSync(new URL("../../../.github/workflows/ci.yml", import.meta.url), "utf8");

/** Split the file into top-level two-space keys (`on:` children and jobs alike). */
function blocks(text: string): Map<string, string> {
  const result = new Map<string, string>();
  let current: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (current) result.set(current, buffer.join("\n"));
  };
  for (const line of text.split("\n")) {
    const key = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (key) {
      flush();
      current = key[1]!;
      buffer = [line];
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return result;
}

/** Job dependencies, accepting both `needs: [a, b]` and the block-list form. */
function needsOf(body: string): string[] {
  const inline = /needs: \[([^\]]*)\]/.exec(body);
  if (inline) {
    return inline[1]!
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  const block = /needs:\s*\n((?:\s*-\s*[a-z-]+\s*\n)+)/.exec(`${body}\n`);
  if (!block) return [];
  return [...block[1]!.matchAll(/-\s*([a-z-]+)/g)].map((match) => match[1]!);
}

const jobs = blocks(CI_YML);

describe("ci.yml two-tier contract", () => {
  it("declares the full-tier triggers and keeps pull_request unfiltered", () => {
    expect(CI_YML).toMatch(/^ {2}merge_group:\s*$/m);
    expect(CI_YML).toMatch(/^ {2}schedule:\s*$/m);
    expect(CI_YML).toMatch(/^ {2}workflow_dispatch:\s*$/m);

    const pullRequest = blocks(CI_YML).get("pull_request") ?? "";
    expect(pullRequest).not.toMatch(/paths-ignore/);
  });

  it("gate every tier-aware job on plan being a direct dependency", () => {
    const tierAware = [...jobs.entries()].filter(([, body]) =>
      body.includes("needs.plan.outputs.tier"),
    );
    // The gate must actually exist, otherwise this test is vacuous.
    expect(tierAware.length).toBeGreaterThanOrEqual(5);

    for (const [name, body] of tierAware) {
      expect(
        needsOf(body),
        `${name} references needs.plan.outputs but does not need plan`,
      ).toContain("plan");
    }
  });

  it("keeps the full matrix on the events that can merge or release", () => {
    for (const job of [
      "docker-cache",
      "db-tests",
      "bench-core",
      "bench-summary",
      "e2e-prep",
      "e2e",
    ]) {
      const body = jobs.get(job);
      expect(body, `missing job ${job}`).toBeDefined();
      expect(body!, `${job} must be gated to the full tier`).toContain(
        "needs.plan.outputs.tier == 'full'",
      );
    }
  });

  it("fails the gate only on failure or cancellation, never on skipped", () => {
    const gate = jobs.get("all-green");
    expect(gate, "missing all-green job").toBeDefined();
    expect(gate!).toContain("if: always()");
    expect(gate!).toMatch(/contains\(needs\.\*\.result, 'failure'\)/);
    expect(gate!).toMatch(/contains\(needs\.\*\.result, 'cancelled'\)/);
    expect(gate!).not.toMatch(/contains\(needs\.\*\.result, 'skipped'\)/);
  });
});
