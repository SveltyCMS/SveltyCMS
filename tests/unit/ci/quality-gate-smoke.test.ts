/**
 * @file tests/unit/ci/quality-gate-smoke.test.ts
 * @description Ensures hooks and package gate scripts stay wired to the real pipeline.
 *
 * Ghost scripts (quality-gate.ts, run-integration-tests.ts, security-regression.ts)
 * must not reappear as the source of truth — hooks + package.json are canonical.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../../..");

function readPkgScripts(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  return pkg.scripts;
}

describe("package gate scripts", () => {
  it("gate runs pre-push hook (not a missing quality-gate.ts)", () => {
    const scripts = readPkgScripts();
    expect(scripts.gate).toMatch(/pre-push|\.githooks/);
    expect(existsSync(join(ROOT, "scripts/quality-gate.ts"))).toBe(false);
  });

  it("exposes test:doctor and test:security", () => {
    const scripts = readPkgScripts();
    expect(scripts["test:doctor"]).toContain("test-doctor.ts");
    expect(scripts["test:security"]).toMatch(/defense-in-depth|vitest run/);
    expect(existsSync(join(ROOT, "scripts/test-doctor.ts"))).toBe(true);
  });

  it("does not ship deleted ghost entrypoints", () => {
    expect(existsSync(join(ROOT, "scripts/run-integration-tests.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "scripts/security-regression.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "scripts/precheck-shared.ts"))).toBe(false);
  });
});

describe("pre-commit hook", () => {
  it("runs format + lint", () => {
    const hook = readFileSync(join(ROOT, ".githooks/pre-commit"), "utf8");
    expect(hook).toMatch(/(\$RUN_CMD|bun run) check/);
  });

  it("runs unit tests", () => {
    const hook = readFileSync(join(ROOT, ".githooks/pre-commit"), "utf8");
    expect(hook).toContain("test:unit");
  });

  it("runs database safety check", () => {
    const hook = readFileSync(join(ROOT, ".githooks/pre-commit"), "utf8");
    expect(hook).toContain("check-test-db-safety.ts");
  });
});

describe("pre-push hook", () => {
  it("runs build + integration (not unit tests)", () => {
    const prePush = readFileSync(join(ROOT, ".githooks/pre-push"), "utf8");
    expect(prePush).toMatch(/(\$RUN_CMD|bun run) build/);
    expect(prePush).toContain("COMPILE_ALL_ADAPTERS");
    expect(prePush).not.toContain("test:unit");
    expect(prePush).toContain("run-integration.ts");
    expect(prePush).not.toContain("run-integration-tests");
  });
});
