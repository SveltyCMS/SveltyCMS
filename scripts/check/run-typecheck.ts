/**
 * @file scripts/check/run-typecheck.ts
 * @description Runs the two type gates — `tsc --noEmit` and the svelte-check
 * warning gate — concurrently instead of back to back.
 *
 * `bun run check` used to spend ~103 s on type checking because the Svelte
 * compiler diagnostics only started after `tsc` had finished. Both tools are
 * independent single-process consumers of the same generated `.svelte-kit`
 * types (`svelte-kit sync` still runs first, in the package script), so they
 * can overlap on separate cores.
 *
 * Features:
 * - Fixed two-job fan-out (no pool): `tsc` and `check-svelte-diagnostics.ts`
 * - Deterministic reporting — a failing tool's own output, never interleaved
 * - Fail-closed: any non-zero child exit fails the gate with that exit code
 * - Per-job duration so a future regression in either tool is visible
 */

import { spawn } from "node:child_process";

interface TypecheckJob {
  id: string;
  argv: readonly string[];
}

interface JobOutcome {
  job: TypecheckJob;
  exitCode: number;
  output: string;
  durationMs: number;
}

const ROOT = process.cwd();
// `svelte-check`'s wrapper is a TypeScript module, so it runs on the current
// Bun runtime; `tsc` keeps the Node runtime that CI's `03-check` job uses.
const BUN_BIN = process.execPath;

const JOBS: readonly TypecheckJob[] = [
  {
    id: "tsc",
    argv: ["node", "node_modules/typescript/lib/tsc.js", "--noEmit", "-p", "tsconfig.json"],
  },
  { id: "svelte-check", argv: [BUN_BIN, "scripts/check/check-svelte-diagnostics.ts"] },
];

function runJob(job: TypecheckJob): Promise<JobOutcome> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const proc = spawn(job.argv[0], job.argv.slice(1), {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });

    const chunks: Buffer[] = [];
    proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk));

    proc.on("close", (code) => {
      resolve({
        job,
        exitCode: code ?? 1,
        output: Buffer.concat(chunks).toString("utf8").trim(),
        durationMs: Date.now() - startedAt,
      });
    });

    proc.on("error", (error) => {
      resolve({
        job,
        exitCode: 1,
        output: `failed to start ${job.id}: ${error.message}`,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

async function main(): Promise<number> {
  const startedAt = Date.now();
  const outcomes = await Promise.all(JOBS.map(runJob));
  const failed = outcomes.filter((outcome) => outcome.exitCode !== 0);

  for (const outcome of failed) {
    console.error(`\n❌ ${outcome.job.id} failed (${outcome.durationMs}ms):`);
    if (outcome.output) console.error(outcome.output);
  }

  const elapsed = Date.now() - startedAt;
  if (failed.length > 0) {
    console.error(
      `\n🛑 ${failed.length}/${outcomes.length} type gate(s) failed in ${elapsed}ms: ${failed
        .map((outcome) => outcome.job.id)
        .join(", ")}`,
    );
    return 1;
  }

  for (const outcome of outcomes) {
    console.log(`✅ ${outcome.job.id}: clean in ${outcome.durationMs}ms`);
  }
  console.log(`✅ Type gates passed in ${elapsed}ms (parallel).`);
  return 0;
}

if (import.meta.main) {
  main().then((code) => process.exit(code));
}
