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
    expect(existsSync(join(ROOT, "scripts/test/test-doctor.ts"))).toBe(true);
  });

  it("exposes the DOM interaction and E2E smoke gates", () => {
    const scripts = readPkgScripts();
    expect(scripts["test:unit:components"]).toContain("vitest.dom.config.ts");
    expect(scripts["test:e2e:smoke"]).toContain("tests/e2e/smoke.spec.ts");
    expect(existsSync(join(ROOT, "vitest.dom.config.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "tests/e2e/smoke.spec.ts"))).toBe(true);
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
    expect(hook).toMatch(/(pm_run|\$RUN_CMD|bun run) check/);
  });

  it("runs unit tests", () => {
    const hook = readFileSync(join(ROOT, ".githooks/pre-commit"), "utf8");
    expect(hook).toContain("test:unit");
  });

  it("runs database safety check", () => {
    const hook = readFileSync(join(ROOT, ".githooks/pre-commit"), "utf8");
    expect(hook).toContain("check-test-db-safety.ts");
  });

  it("runs the real-DOM component interaction suite", () => {
    const hook = readFileSync(join(ROOT, ".githooks/pre-commit"), "utf8");
    expect(hook).toContain("test:unit:components");
  });
});

describe("pre-push hook", () => {
  it("runs build + integration (not unit tests)", () => {
    const prePush = readFileSync(join(ROOT, ".githooks/pre-push"), "utf8");
    expect(prePush).toMatch(/(pm_run|\$RUN_CMD|\$PM_BIN" run|bun run) build/);
    expect(prePush).toContain("COMPILE_ALL_ADAPTERS");
    expect(prePush).not.toContain("test:unit");
    expect(prePush).toContain("run-integration.ts");
    expect(prePush).not.toContain("run-integration-tests");
  });

  it("runs the E2E smoke gate against a harness build", () => {
    const prePush = readFileSync(join(ROOT, ".githooks/pre-push"), "utf8");
    expect(prePush).toContain("scripts/runs/run-e2e.ts --no-build tests/e2e/smoke.spec.ts");
    expect(prePush).toContain("SKIP_E2E_SMOKE");
  });
});

describe("CI wiring", () => {
  it("runs the DOM interaction suite in the unit job", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("bun run test:unit:components");
  });
});
