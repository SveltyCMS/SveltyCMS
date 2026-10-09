/**
 * @file tests/integration/databases/group-commit-correctness.test.ts
 * @description
 * Integration contract for the default-ON SQLite group-commit batcher
 * (opt-out `SVELTY_SQLITE_GROUP_COMMIT=0`, `src/databases/sqlite/write-batcher.ts` +
 * `SQLiteAdapterCore.runGroupCommit`). Concurrent single-statement writes queue
 * and share one `BEGIN IMMEDIATE … COMMIT`; each op keeps its own `SAVEPOINT`.
 *
 * The assertions run against a real SQLite adapter in a spawned worker process
 * (`fixtures/group-commit-worker.ts`), not in this shared process. Reason:
 * `SQLITE_GROUP_COMMIT_ENABLED` is a module-level constant read at import, and
 * another database test file eager-imports the adapter long before this file's
 * body executes — so an in-process `process.env` assignment cannot reliably
 * control the batcher here. The worker starts with the flag already in its
 * environment (pinned `=1`), which keeps the coverage deterministic instead of
 * depending on file-evaluation order. The worker fails loudly if the batcher is
 * off, so this suite never passes while silently exercising the non-batched path.
 *
 * Covered:
 * - every op in one group transaction settles with its OWN result
 * - a duplicate-key op rejects only itself; siblings stay committed
 * - row count / ordering match a sequential control run
 *
 * ### Run
 *   bun run scripts/run-integration.ts --no-build tests/integration/databases/group-commit-correctness.test.ts
 */

import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WORKER_REL = "tests/integration/databases/fixtures/group-commit-worker.ts";

interface WorkerOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runWorker(extraEnv: Record<string, string>): Promise<WorkerOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["test", `./${WORKER_REL}`, "--timeout", "60000"], {
      cwd: ROOT,
      env: { ...process.env, ...extraEnv, BUN_TEST_MOCKS: "false" },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function parseSummary(outcome: WorkerOutcome): Record<string, unknown> {
  const line = outcome.stdout
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith("GC_RESULT "));
  if (!line) {
    throw new Error(
      `group-commit worker produced no GC_RESULT marker.\n── stdout ──\n${outcome.stdout}\n── stderr ──\n${outcome.stderr}`,
    );
  }
  return JSON.parse(line.slice("GC_RESULT ".length)) as Record<string, unknown>;
}

describe("SQLite group-commit batcher (SVELTY_SQLITE_GROUP_COMMIT=1)", () => {
  it("settles every op with its own result, isolates a failing sibling, and matches a sequential run", async () => {
    const outcome = await runWorker({ SVELTY_SQLITE_GROUP_COMMIT: "1" });

    expect(
      outcome.code,
      `worker exited ${outcome.code}\n── stdout ──\n${outcome.stdout}\n── stderr ──\n${outcome.stderr}`,
    ).toBe(0);

    const summary = parseSummary(outcome);
    expect(summary.batcherEnabled).toBe(true);
    expect(summary.burstCount).toBe(40);
    expect(summary.controlCount).toBe(40);
    expect(summary.siblings).toBe(39);
    expect(summary.rejected).toBe(1);
  }, 90_000);
});
