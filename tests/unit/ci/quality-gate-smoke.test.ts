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

  it("builds before the diff integration instead of always deferring", () => {
    const hook = readFileSync(join(ROOT, ".githooks/pre-commit"), "utf8");
    expect(hook).toContain("Harness build (backend change)");
    expect(hook).toContain("run-integration.ts --no-build --diff");
    // The old freshness check skipped integration whenever src/ was edited.
    expect(hook).not.toContain("deferred to pre-push");
  });
});

describe("pre-push hook", () => {
  it("re-runs the CI unit job and build/integration", () => {
    const prePush = readFileSync(join(ROOT, ".githooks/pre-push"), "utf8");
    expect(prePush).toMatch(/(pm_run|\$RUN_CMD|\$PM_BIN" run|bun run) build/);
    expect(prePush).toContain("COMPILE_ALL_ADAPTERS");
    // CI Unit parity: coverage + components + mutation, because a suite can be
    // 100 % green and still exit 1 on unhandled errors under the CI reporter.
    expect(prePush).toContain("test:unit:coverage");
    expect(prePush).toContain("test:unit:components");
    expect(prePush).toContain("test:mutation");
    // The plain suite is not re-run: pre-commit already did it.
    expect(prePush).not.toMatch(/(?:pm_run|bun run) test:unit(?!:)/);
    expect(prePush).toContain("run-integration.ts");
    expect(prePush).not.toContain("run-integration-tests");
  });

  it("has no opt-out environment variable", () => {
    for (const hook of ["pre-commit", "pre-push"]) {
      const source = readFileSync(join(ROOT, ".githooks", hook), "utf8");
      expect(source, `${hook} must not exit early`).not.toContain("Local gates disabled");
      expect(source, `${hook} must not gate on an env var`).not.toMatch(/SVELTY_LOCAL_GATES:-0/);
    }
  });

  it("enforces the CI flake budget and the full static gates", () => {
    const prePush = readFileSync(join(ROOT, ".githooks/pre-push"), "utf8");
    expect(prePush).toContain("check-flake-budget.ts");
    expect(prePush).toContain("--max-flaky=0");
    expect(prePush).toContain("probe-hardware-tiers.ts");
    expect(prePush).toContain("lint:tenant -- --full");
  });

  it("diagnoses unhandled errors instead of swallowing them", () => {
    const lib = readFileSync(join(ROOT, ".githooks/lib.sh"), "utf8");
    expect(lib).toContain("Unhandled Errors");
    expect(lib).toContain("Uncaught Exception");
    expect(lib).toContain("ERROR: Coverage");
  });

  it("runs the E2E smoke gate against a harness build", () => {
    const prePush = readFileSync(join(ROOT, ".githooks/pre-push"), "utf8");
    expect(prePush).toContain('E2E_TARGETS="tests/e2e/smoke.spec.ts"');
    expect(prePush).toContain("tests/e2e/routes/collection-builder/kitchen-sink.spec.ts");
    expect(prePush).toContain("scripts/runs/run-e2e.ts --no-build $E2E_TARGETS");
    expect(prePush).toContain("SKIP_E2E_SMOKE");
  });
});

describe("CI wiring", () => {
  it("runs the DOM interaction suite in the unit job", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("bun run test:unit:components");
  });

  it("runs every policy gate that `bun run check` and the policy job run", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    for (const gate of [
      "bun run format --check",
      "bun run lint:ci",
      "bun run scripts/lint/lint-design.ts",
      "bun run scripts/lint/consolidate-shades.ts --check",
      "bun run scripts/lint/lint-widgets.ts",
      "bun run lint:e2e-hydration",
      "bun run lint:trivial-assertions",
      "bun run check:routes",
      "bun run test:isolation",
      "bun run scripts/check/check-lockfile-sync.ts",
      "bun run check:seams",
      "bun run version:verify",
      "bun run typecheck",
      "bun run scripts/security/scan-security-risk.ts --strict",
      "bun run scripts/security/scan-secret-misuse.ts --strict --full",
      "bun run scripts/security/slop-scanner.ts --strict",
      "bun run scripts/probe/probe-hardware-tiers.ts",
      "bun run lint:tenant -- --full",
      "bun run test:tenant",
      "bun run scripts/probe/probe-deploy-testing-api.ts",
    ]) {
      expect(ci, `ci.yml 01-policy is missing: ${gate}`).toContain(gate);
    }
    expect(ci).not.toContain("matrix.task == '01-static'");
  });

  it("fails relative benchmark drift only on main / merge_group", () => {
    const ci = readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain(
      "BENCHMARK_GATE_POLICY: ${{ (github.ref == 'refs/heads/main' || github.event_name == 'merge_group') && 'fail' || 'warn' }}",
    );
    // The CVE summary must target the task that exists.
    expect(ci).toContain("if: matrix.task == '01-policy'");
  });
});
