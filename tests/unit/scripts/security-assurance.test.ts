/**
 * @file tests/unit/scripts/security-assurance.test.ts
 * @description Unit tests for the single security-assurance entry point:
 * argument parsing, step selection, the mutation-report flag, exit-code
 * aggregation, and the JSON summary. Child processes are injected, so no
 * security check is executed by this suite.
 */

import { describe, expect, it, vi } from "vitest";
import {
  ASSURANCE_STEP_IDS,
  allPassed,
  buildSteps,
  parseArgs,
  runAssurance,
  type RunnerResult,
  type StepRunner,
} from "../../../scripts/security/security-assurance";

function defaultArgs(overrides: Record<string, unknown> = {}) {
  return {
    only: null,
    requireMutation: false,
    json: false,
    help: false,
    ...overrides,
  };
}

function collect() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    write: (text: string) => out.push(text),
    writeError: (text: string) => err.push(text),
  };
}

const pass: StepRunner = () => ({ status: 0, stdout: "ok", stderr: "" });

describe("parseArgs", () => {
  it("defaults to every check and no extra flags", () => {
    expect(parseArgs([])).toEqual({ ok: true, args: defaultArgs() });
  });

  it("accepts --only with a known id", () => {
    const parsed = parseArgs(["--only=threat-model"]);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.args.only).toBe("threat-model");
  });

  it("rejects an unknown --only id and lists the valid ones", () => {
    const parsed = parseArgs(["--only=nope"]);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toContain("nope");
      for (const id of ASSURANCE_STEP_IDS) expect(parsed.error).toContain(id);
    }
  });

  it("rejects an unknown flag", () => {
    expect(parseArgs(["--fast"]).ok).toBe(false);
  });

  it("collects the boolean flags", () => {
    expect(parseArgs(["--require-mutation", "--json", "--help"])).toEqual({
      ok: true,
      args: defaultArgs({ requireMutation: true, json: true, help: true }),
    });
  });
});

describe("buildSteps", () => {
  it("returns every check in a stable order", () => {
    const steps = buildSteps(defaultArgs() as never);
    expect(steps.map((step) => step.id)).toEqual([...ASSURANCE_STEP_IDS]);
  });

  it("filters to a single check", () => {
    const steps = buildSteps(defaultArgs({ only: "external" }) as never);
    expect(steps.map((step) => step.id)).toEqual(["external"]);
  });

  it("skips the mutation report by default", () => {
    const strength = buildSteps(defaultArgs() as never).find((step) => step.id === "test-strength");
    expect(strength?.args).toContain("--allow-missing");
  });

  it("requires the mutation report when asked", () => {
    const strength = buildSteps(defaultArgs({ requireMutation: true }) as never).find(
      (step) => step.id === "test-strength",
    );
    expect(strength?.args).not.toContain("--allow-missing");
  });

  it("does not mutate the shared step templates", () => {
    const first = buildSteps(defaultArgs({ requireMutation: true }) as never);
    const second = buildSteps(defaultArgs() as never);
    expect(first.find((step) => step.id === "test-strength")?.args).not.toContain(
      "--allow-missing",
    );
    expect(second.find((step) => step.id === "test-strength")?.args).toContain("--allow-missing");
  });
});

describe("allPassed", () => {
  it("is true only for an empty or all-zero result set", () => {
    expect(allPassed([])).toBe(true);
    expect(
      allPassed([
        { id: "advisories", label: "a", exitCode: 0, stdout: "", stderr: "" },
        { id: "external", label: "b", exitCode: 0, stdout: "", stderr: "" },
      ]),
    ).toBe(true);
    expect(
      allPassed([
        { id: "advisories", label: "a", exitCode: 0, stdout: "", stderr: "" },
        { id: "external", label: "b", exitCode: 1, stdout: "", stderr: "" },
      ]),
    ).toBe(false);
  });
});

describe("runAssurance", () => {
  it("returns 0 when every selected check passes", () => {
    const io = collect();
    const code = runAssurance([], { run: pass, ...io });
    expect(code).toBe(0);
    expect(io.err).toEqual([]);
    expect(io.out.join("\n")).toContain("4/4 checks passed");
  });

  it("returns 1 when one check fails and keeps the others running", () => {
    const seen: string[] = [];
    const runner: StepRunner = (script): RunnerResult => {
      seen.push(script);
      return script.includes("check-advisories")
        ? { status: 1, stdout: "advisory output", stderr: "SLA breach" }
        : { status: 0, stdout: "ok", stderr: "" };
    };
    const io = collect();
    const code = runAssurance([], { run: runner, ...io });

    expect(code).toBe(1);
    expect(seen).toHaveLength(4);
    expect(io.out.join("\n")).toContain("advisory output");
    expect(io.err.join("\n")).toContain("SLA breach");
    expect(io.out.join("\n")).toContain("1/4 check(s) failed");
  });

  it("runs only the selected check", () => {
    const runner = vi.fn<StepRunner>(() => ({ status: 0, stdout: "", stderr: "" }));
    const io = collect();
    const code = runAssurance(["--only=external"], { run: runner, ...io });

    expect(code).toBe(0);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0]?.[0]).toContain("check-external-validation.ts");
  });

  it("emits a machine-readable summary and suppresses child output in JSON mode", () => {
    const io = collect();
    const code = runAssurance(["--json"], {
      run: () => ({ status: 0, stdout: "child chatter", stderr: "" }),
      ...io,
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(io.out.join("")) as {
      ok: boolean;
      steps: Array<{ id: string; status: string; exitCode: number }>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.steps).toHaveLength(4);
    expect(parsed.steps.every((step) => step.status === "pass" && step.exitCode === 0)).toBe(true);
    expect(io.out.join("")).not.toContain("child chatter");
  });

  it("returns 2 and runs nothing for a usage error", () => {
    const runner = vi.fn<StepRunner>(pass);
    const io = collect();
    const code = runAssurance(["--only=unknown"], { run: runner, ...io });

    expect(code).toBe(2);
    expect(runner).not.toHaveBeenCalled();
    expect(io.err.join("\n")).toContain("Unknown check");
  });

  it("prints usage and runs nothing for --help", () => {
    const runner = vi.fn<StepRunner>(pass);
    const io = collect();
    const code = runAssurance(["--help"], { run: runner, ...io });

    expect(code).toBe(0);
    expect(runner).not.toHaveBeenCalled();
    expect(io.out.join("\n")).toContain("Usage: bun run security:assurance");
  });
});
