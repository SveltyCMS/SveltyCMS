#!/usr/bin/env bun
/**
 * @file scripts/runs/run-probe-group.ts
 * @description Runs the independent build/security probes of the pre-push gate
 * concurrently instead of one after another.
 *
 * Measured 2026-11-07, these four probes cost ~30s serially because each paid
 * its own process/boot latency (prod-backdoor 19s, tenant 10s, hardware 3s,
 * secret <1s); in parallel the wall clock is the slowest probe (13.3s measured).
 * They share no state except the completed `build/` directory — none of them
 * listens on a port.
 *
 * Deliberately excluded:
 * - `check-bundle-size` races any build that rewrites `.svelte-kit/output`.
 * - `probe-deploy-testing-api` runs its own deploy build (testing stripped).
 *   It runs last in the hook so the E2E/integration steps never inherit a
 *   stripped build, and it must not overlap a build-reader.
 *
 * ### Features
 * - Fixed declarative job list (no pool tuning, no dynamic discovery)
 * - A job may run several commands in order; the first failure aborts that job
 * - Buffered per-job output, printed only for failures, in list order
 * - Fail-closed: any job's non-zero exit fails the group
 */

import { spawn } from "node:child_process";

interface ProbeJob {
  id: string;
  /** Each step runs to completion before the next; a failure ends the job. */
  steps: readonly (readonly string[])[];
}

const BUN = process.execPath;
const bunRun = (...args: readonly string[]): readonly string[] => [BUN, "run", ...args];

const JOBS: readonly ProbeJob[] = [
  {
    id: "prod-backdoor",
    steps: [bunRun("scripts/security/verify-prod-build-backdoor.ts", "--mode=bench")],
  },
  {
    id: "secret-misuse",
    steps: [bunRun("scripts/security/scan-secret-misuse.ts", "--strict", "--full")],
  },
  { id: "hardware-tiers", steps: [bunRun("scripts/probe/probe-hardware-tiers.ts")] },
  { id: "tenant-isolation", steps: [bunRun("lint:tenant", "--", "--full"), bunRun("test:tenant")] },
];

interface JobOutcome {
  job: ProbeJob;
  exitCode: number;
  output: string;
  durationMs: number;
}

function runStep(argv: readonly string[]): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(argv[0], argv.slice(1), {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });

    const chunks: Buffer[] = [];
    proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.on("close", (code) =>
      resolve({ exitCode: code ?? 1, output: Buffer.concat(chunks).toString("utf8").trim() }),
    );
    proc.on("error", (error) =>
      resolve({ exitCode: 1, output: `failed to start ${argv.join(" ")}: ${error.message}` }),
    );
  });
}

async function runJob(job: ProbeJob): Promise<JobOutcome> {
  const startedAt = Date.now();
  const output: string[] = [];

  for (const step of job.steps) {
    const result = await runStep(step);
    if (result.output) output.push(result.output);
    if (result.exitCode !== 0) {
      return {
        job,
        exitCode: result.exitCode,
        output: output.join("\n"),
        durationMs: Date.now() - startedAt,
      };
    }
  }

  return { job, exitCode: 0, output: output.join("\n"), durationMs: Date.now() - startedAt };
}

async function main(): Promise<number> {
  const startedAt = Date.now();
  const outcomes = await Promise.all(JOBS.map(runJob));
  const failed = outcomes.filter((outcome) => outcome.exitCode !== 0);

  for (const outcome of failed) {
    console.error(`\n❌ ${outcome.job.id} failed (${outcome.durationMs}ms):`);
    if (outcome.output) console.error(outcome.output);
  }

  for (const outcome of outcomes) {
    const mark = outcome.exitCode === 0 ? "✔" : "✘";
    console.log(`  ${mark} ${outcome.job.id} (${outcome.durationMs}ms)`);
  }

  const elapsed = Date.now() - startedAt;
  if (failed.length > 0) {
    console.error(
      `\n🛑 ${failed.length}/${outcomes.length} probe(s) failed in ${elapsed}ms: ${failed
        .map((outcome) => outcome.job.id)
        .join(", ")}`,
    );
    return 1;
  }

  console.log(`✅ ${outcomes.length} probes passed in ${elapsed}ms (parallel).`);
  return 0;
}

if (import.meta.main) process.exit(await main());
