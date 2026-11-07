#!/usr/bin/env bun
/**
 * @file scripts/check/run-fast-checks.ts
 * @description Parallel runner for SveltyCMS static policy, AST, and security-assurance gates.
 *
 * Previously `bun run check` chained 20 read-only TypeScript scripts sequentially
 * via shell `&&`, paying process startup + disk I/O latency 20 times in series.
 * This orchestrator runs all 20 read-only checks concurrently across CPU cores,
 * preserves deterministic output order, and fails closed if any check exits non-zero.
 *
 * Features:
 * - Bounded worker concurrency (up to 8 parallel checks)
 * - Deterministic buffered output per check
 * - Individual timing diagnostics + failure summary
 */

import { spawn } from "node:child_process";
import os from "node:os";
import { join } from "node:path";

interface CheckSpec {
  id: string;
  script: string;
  args?: readonly string[];
}

const ROOT = process.cwd();
const BUN_BIN = process.execPath;

export const FAST_CHECKS: readonly CheckSpec[] = [
  { id: "lint-design", script: "scripts/lint/lint-design.ts" },
  { id: "lint-duplicate-testids", script: "scripts/lint/lint-duplicate-testids.ts" },
  { id: "scan-anonymous-leaks", script: "scripts/lint/scan-anonymous-leaks.ts" },
  { id: "consolidate-shades", script: "scripts/lint/consolidate-shades.ts", args: ["--check"] },
  { id: "lint-widgets", script: "scripts/lint/lint-widgets.ts" },
  { id: "lint-e2e-hydration", script: "scripts/lint/lint-e2e-hydration.ts", args: ["--check"] },
  {
    id: "lint-trivial-assertions",
    script: "scripts/lint/lint-trivially-true-assertions.ts",
    args: ["--check"],
  },
  { id: "lint-global-timers", script: "scripts/lint/lint-global-timers.ts" },
  { id: "lint-live-paths", script: "scripts/lint/lint-live-paths.ts" },
  { id: "lint-transient-classification", script: "scripts/lint/lint-transient-classification.ts" },
  { id: "lint-date-helpers", script: "scripts/lint/lint-date-helpers.ts" },
  { id: "lint-silent-catch", script: "scripts/lint/lint-silent-catch.ts" },
  { id: "lint-rule-budgets", script: "scripts/lint/lint-rule-budgets.ts" },
  { id: "lint-e2e-actionability", script: "scripts/lint/lint-e2e-actionability.ts" },
  { id: "marketplace-conformance", script: "scripts/marketplace/conformance.ts" },
  {
    id: "check-route-behaviour",
    script: "scripts/check/check-route-behaviour.ts",
    args: ["--check", "--min=99"],
  },
  {
    id: "check-integration-isolation",
    script: "scripts/test/check-integration-isolation.ts",
    args: ["--check"],
  },
  { id: "check-lockfile-sync", script: "scripts/check/check-lockfile-sync.ts" },
  { id: "check-seam-assertions", script: "scripts/check/check-seam-assertions.ts" },
  { id: "version-verify", script: "scripts/version.ts", args: ["--verify"] },
  { id: "security-assurance", script: "scripts/security/security-assurance.ts" },
];

interface CheckOutcome {
  spec: CheckSpec;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function runSingleCheck(spec: CheckSpec): Promise<CheckOutcome> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const proc = spawn(BUN_BIN, ["run", join(ROOT, spec.script), ...(spec.args ?? [])], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: process.env,
    });

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout?.on("data", (chunk: Buffer) => outChunks.push(chunk));
    proc.stderr?.on("data", (chunk: Buffer) => errChunks.push(chunk));

    proc.on("close", (code) => {
      resolve({
        spec,
        exitCode: code ?? 1,
        stdout: Buffer.concat(outChunks).toString("utf8"),
        stderr: Buffer.concat(errChunks).toString("utf8"),
        durationMs: Date.now() - startedAt,
      });
    });

    proc.on("error", (err) => {
      resolve({
        spec,
        exitCode: 1,
        stdout: "",
        stderr: err.message,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

async function main(): Promise<number> {
  const startedAt = Date.now();
  const concurrency = Math.max(2, Math.min(8, os.cpus().length));
  const outcomes: CheckOutcome[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= FAST_CHECKS.length) return;
      outcomes[idx] = await runSingleCheck(FAST_CHECKS[idx]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const failed: CheckOutcome[] = [];
  for (const outcome of outcomes) {
    if (outcome.exitCode !== 0) {
      failed.push(outcome);
      console.error(`\n❌ [${outcome.spec.id}] failed (${outcome.durationMs}ms):`);
      if (outcome.stdout.trim()) console.error(outcome.stdout.trimEnd());
      if (outcome.stderr.trim()) console.error(outcome.stderr.trimEnd());
    }
  }

  const totalElapsed = Date.now() - startedAt;
  if (failed.length > 0) {
    console.error(
      `\n🛑 ${failed.length}/${FAST_CHECKS.length} static check(s) failed in ${totalElapsed}ms: ${failed.map((f) => f.spec.id).join(", ")}`,
    );
    return 1;
  }

  console.log(
    `✅ All ${FAST_CHECKS.length} static policy & assurance gates passed in ${totalElapsed}ms (${concurrency} workers).`,
  );
  return 0;
}

if (import.meta.main) {
  main().then((code) => process.exit(code));
}
