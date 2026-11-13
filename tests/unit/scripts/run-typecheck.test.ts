/**
 * @file tests/unit/scripts/run-typecheck.test.ts
 * @description Pins the parallel type-gate contract.
 *
 * `bun run check` must run BOTH gates (`tsc --noEmit` and the svelte-check
 * warning gate); dropping either would let a category of diagnostics through.
 * The failure summariser decides the gate's exit code, so a non-zero child exit
 * must always surface as a failure — never as an empty report.
 */

import { describe, expect, it } from "vitest";
import {
  collectTypecheckFailures,
  formatFailureLines,
  TYPECHECK_JOBS,
  type JobOutcome,
  type TypecheckJob,
} from "../../../scripts/check/run-typecheck";

function job(id: string): TypecheckJob {
  return { id, argv: ["node", "--version"] };
}

function outcome(id: string, exitCode: number, output = "", durationMs = 12): JobOutcome {
  return { job: job(id), exitCode, output, durationMs };
}

describe("TYPECHECK_JOBS", () => {
  it("runs tsc and the svelte warning gate", () => {
    expect(TYPECHECK_JOBS.map((item) => item.id)).toEqual(["tsc", "svelte-check"]);
  });

  it("keeps the warning gate wired to the diagnostics wrapper", () => {
    const tsc = TYPECHECK_JOBS.find((item) => item.id === "tsc");
    const svelte = TYPECHECK_JOBS.find((item) => item.id === "svelte-check");

    expect(tsc?.argv.some((arg) => arg.endsWith("typescript/lib/tsc.js"))).toBe(true);
    expect(tsc?.argv).toContain("--noEmit");
    expect(svelte?.argv.some((arg) => arg.endsWith("check-svelte-diagnostics.ts"))).toBe(true);
  });
});

describe("collectTypecheckFailures", () => {
  it("returns an empty list when both gates pass", () => {
    expect(collectTypecheckFailures([outcome("tsc", 0), outcome("svelte-check", 0)])).toEqual([]);
  });

  it("keeps exactly the gates that exited non-zero", () => {
    const failures = collectTypecheckFailures([
      outcome("tsc", 1, "error TS2322"),
      outcome("svelte-check", 0),
    ]);

    expect(failures.map((failure) => failure.job.id)).toEqual(["tsc"]);
  });
});

describe("formatFailureLines", () => {
  it("emits nothing when the gate is clean", () => {
    expect(formatFailureLines([])).toEqual([]);
  });

  it("prints the gate, its duration and its own output", () => {
    expect(formatFailureLines([outcome("tsc", 1, "error TS2322: bad type", 42)])).toEqual([
      "\n❌ tsc failed (42ms):",
      "error TS2322: bad type",
    ]);
  });

  it("omits the output line for a gate that printed nothing", () => {
    expect(formatFailureLines([outcome("svelte-check", 1, "", 7)])).toEqual([
      "\n❌ svelte-check failed (7ms):",
    ]);
  });
});
