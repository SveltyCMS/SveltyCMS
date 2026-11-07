#!/usr/bin/env bun
/**
 * @file scripts/check/run-fast-checks.ts
 * @description Parallel runner for SveltyCMS static policy, AST, and security-assurance gates.
 *
 * The check suite (ids, scripts, args, kind, owner) is owned by
 * `scripts/check/rule-registry.ts`; this runner only schedules it. Previously
 * `bun run check` chained the read-only TypeScript scripts sequentially via
 * shell `&&`, paying process startup + disk I/O latency once per check. This
 * orchestrator runs them concurrently across CPU cores, preserves
 * deterministic output order, and fails closed if any check exits non-zero.
 *
 * Features:
 * - Registry integrity assertion before spawning (duplicate ids, missing
 *   scripts, AST rules without an exported pure function)
 * - Bounded worker concurrency (up to 8 parallel checks)
 * - Deterministic buffered output per check
 * - Individual timing diagnostics + failure summary
 */

import { spawn } from "node:child_process";
import os from "node:os";
import { join } from "node:path";
import { FAST_CHECKS, assertRuleRegistryIntegrity } from "./rule-registry";
import type { CheckSpec } from "./rule-registry";

export { FAST_CHECKS };

const ROOT = process.cwd();
const BUN_BIN = process.execPath;

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
  // Validate the same root the spawner will use, so a wrong cwd fails before any check runs.
  const registryErrors = assertRuleRegistryIntegrity(ROOT);
  if (registryErrors.length > 0) {
    console.error("🛑 Rule registry integrity failed:");
    for (const error of registryErrors) console.error(`   - ${error}`);
    return 1;
  }

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
