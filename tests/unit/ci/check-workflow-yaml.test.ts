/**
 * @file tests/unit/ci/check-workflow-yaml.test.ts
 * @description Contract tests ensuring all GitHub workflow and composite action YAML files
 * parse cleanly and malformed YAML is rejected fail-closed.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateWorkflowYaml } from "../../../scripts/check/check-workflow-yaml";
import { assertRuleRegistryIntegrity } from "../../../scripts/check/rule-registry";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

describe("check-workflow-yaml", () => {
  it("parses all repository GitHub workflows and actions without syntax or duplicate-key errors", () => {
    const result = validateWorkflowYaml();
    expect(result.scannedFiles).toBeGreaterThanOrEqual(7);
    expect(result.errors).toEqual([]);
  });

  it("fails closed on invalid YAML syntax or duplicate mapping keys", () => {
    const root = mkdtempSync(join(tmpdir(), "wf-yaml-"));
    try {
      const wfDir = join(root, ".github", "workflows");
      mkdirSync(wfDir, { recursive: true });
      writeFileSync(
        join(wfDir, "broken.yml"),
        "name: broken\non: push\non: pull_request\njobs:\n  test:\n    runs-on: [unclosed\n",
      );

      const result = validateWorkflowYaml(root);
      expect(result.scannedFiles).toBe(1);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is registered in rule-registry with valid integrity", () => {
    expect(assertRuleRegistryIntegrity()).toEqual([]);
  });

  it("wires frozen-lockfile, workflow-yaml, docs lint, and risk-audit parity into .githooks", () => {
    const preCommit = readFileSync(join(REPO_ROOT, ".githooks", "pre-commit"), "utf8");
    const prePush = readFileSync(join(REPO_ROOT, ".githooks", "pre-push"), "utf8");

    expect(existsSync(join(REPO_ROOT, ".githooks", "pre-commit"))).toBe(true);
    expect(preCommit).toContain("bun install --frozen-lockfile --dry-run");
    expect(preCommit).toContain("lint:docs");
    expect(preCommit).toContain("paraglide");

    expect(prePush).toContain("bun install --frozen-lockfile --dry-run");
    expect(prePush).toContain("scripts/check/check-workflow-yaml.ts");
    expect(prePush).toContain("lint:docs");
    expect(prePush).toContain("gate_cached risk");
    expect(prePush).toContain("pm_run risk:audit");
    expect(prePush).toContain("tests/e2e/routes/system/permission-enforcement.spec.ts");
  });
});
