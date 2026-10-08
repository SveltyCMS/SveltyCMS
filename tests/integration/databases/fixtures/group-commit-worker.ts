/**
 * @file tests/integration/databases/fixtures/group-commit-worker.ts
 * @description
 * Real-SQLite worker that exercises the opt-in group-commit path
 * (`SVELTY_SQLITE_GROUP_COMMIT=1`) of the SQLite adapter in a process whose
 * environment is set BEFORE the adapter module is evaluated.
 *
 * ## Why a child process
 * `SQLITE_GROUP_COMMIT_ENABLED` (`src/databases/sqlite/adapter-core.ts`) is a
 * module-level constant read once at import. Inside the shared integration
 * process another database test file eager-imports the adapter long before the
 * group-commit test body runs, so an in-process `process.env` assignment cannot
 * flip the flag. Spawning this worker with the flag in its environment (and the
 * standard bun-test preload, which resolves the `$app/*` aliases) is the only
 * deterministic way to guarantee the batcher is engaged.
 *
 * ## What it proves
 * 1. Concurrent burst — every queued write resolves with its OWN result (no
 *    cross-contamination between siblings in one group transaction).
 * 2. Failure isolation — a duplicate-key op rejects only itself; its siblings
 *    stay committed and the failing op leaves no partial row.
 * 3. Sequential control — the same payloads inserted one-by-one produce an
 *    identical row count and ordering.
 *
 * Prints a single `GC_RESULT <json>` line on success; the driver test asserts on
 * it and on the process exit code.
 *
 * ### Features:
 * - isolated in-memory SQLite (no shared file, no fixture cleanup)
 * - one `BEGIN IMMEDIATE … COMMIT` drain (40 jobs < default maxBatchSize 256)
 * - per-op savepoint isolation under a forced constraint violation
 * - sequential control run for row-count/value parity
 */

import { test } from "vitest";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";

const BURST = 40;
const CONTROL = 40;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runWorker(): Promise<void> {
  const adapter = new SQLiteAdapter();
  const connection = await adapter.connect(":memory:");
  if (!connection.success) throw new Error(`SQLite connect failed: ${connection.message}`);

  // The private accessor is a plain prototype method at runtime — reading it is
  // the only way to prove the module constant was pinned with the flag on.
  const batcherEnabled = Boolean(
    (adapter as unknown as { getWriteBatcher?: () => unknown }).getWriteBatcher?.(),
  );
  assert(
    batcherEnabled,
    "group-commit batcher is null — SVELTY_SQLITE_GROUP_COMMIT must be set before the worker starts",
  );

  try {
    await adapter.prepareAndExecuteWrite(
      'CREATE TABLE "gc_burst" ("id" TEXT PRIMARY KEY, "seq" INTEGER NOT NULL, "payload" TEXT NOT NULL)',
      "run",
    );
    await adapter.prepareAndExecuteWrite(
      'CREATE TABLE "gc_control" ("id" TEXT PRIMARY KEY, "seq" INTEGER NOT NULL, "payload" TEXT NOT NULL)',
      "run",
    );

    // ── 1. Concurrent burst: 40 queued inserts drain in one group commit ──
    const burst: unknown[] = [];
    for (let i = 0; i < BURST; i++) {
      burst.push(
        adapter.prepareAndExecuteWrite(
          'INSERT INTO "gc_burst" ("id", "seq", "payload") VALUES (?, ?, ?) RETURNING "payload"',
          "all",
          `burst-${i}`,
          i,
          `p-${i}`,
        ),
      );
    }
    const burstRows = (await Promise.all(burst)) as Array<Array<{ payload: string }>>;
    burstRows.forEach((rows, i) => {
      assert(
        rows?.[0]?.payload === `p-${i}`,
        `burst result ${i} cross-contaminated: ${JSON.stringify(rows)}`,
      );
    });

    // ── 2. Failure isolation: one duplicate-key op must not corrupt siblings ──
    const isolation: unknown[] = [];
    for (let i = 0; i < BURST; i++) {
      const id = i === 7 ? "burst-0" : `iso-${i}`; // burst-0 already committed
      isolation.push(
        adapter.prepareAndExecuteWrite(
          'INSERT INTO "gc_burst" ("id", "seq", "payload") VALUES (?, ?, ?) RETURNING "payload"',
          "all",
          id,
          1000 + i,
          `q-${i}`,
        ),
      );
    }
    const settled = await Promise.allSettled(isolation);
    const rejected = settled
      .map((result, i) => ({ result, i }))
      .filter(({ result }) => result.status === "rejected");
    assert(
      rejected.length === 1 && rejected[0]!.i === 7,
      `expected only the duplicate-key op to reject, got indices [${rejected
        .map(({ i }) => i)
        .join(",")}]`,
    );
    settled.forEach((result, i) => {
      if (i === 7) return;
      assert(
        result.status === "fulfilled",
        `sibling ${i} rejected: ${String((result as PromiseRejectedResult).reason)}`,
      );
      assert(
        (result.value as Array<{ payload: string }>)?.[0]?.payload === `q-${i}`,
        `sibling ${i} returned the wrong payload`,
      );
    });

    const siblingRow = (await adapter.prepareAndExecuteWrite(
      'SELECT COUNT(*) AS c FROM "gc_burst" WHERE "payload" LIKE \'q-%\'',
      "get",
    )) as { c: number };
    assert(
      siblingRow.c === BURST - 1,
      `expected ${BURST - 1} committed siblings, got ${siblingRow.c}`,
    );

    const dupRow = (await adapter.prepareAndExecuteWrite(
      'SELECT COUNT(*) AS c FROM "gc_burst" WHERE "id" = ?',
      "get",
      "burst-0",
    )) as { c: number };
    assert(dupRow.c === 1, `the failing op mutated its own row: count=${dupRow.c}`);

    // ── 3. Sequential control run: identical count + ordering ──
    for (let i = 0; i < CONTROL; i++) {
      await adapter.prepareAndExecuteWrite(
        'INSERT INTO "gc_control" ("id", "seq", "payload") VALUES (?, ?, ?)',
        "run",
        `ctrl-${i}`,
        i,
        `p-${i}`,
      );
    }
    const burstCount = (await adapter.prepareAndExecuteWrite(
      'SELECT COUNT(*) AS c FROM "gc_burst" WHERE "payload" LIKE \'p-%\'',
      "get",
    )) as { c: number };
    const controlCount = (await adapter.prepareAndExecuteWrite(
      'SELECT COUNT(*) AS c FROM "gc_control"',
      "get",
    )) as { c: number };
    assert(
      burstCount.c === CONTROL && controlCount.c === CONTROL,
      `row-count mismatch: burst=${burstCount.c} control=${controlCount.c}`,
    );

    const burstPayloads = (
      (await adapter.prepareAndExecuteWrite(
        'SELECT "payload" FROM "gc_burst" WHERE "payload" LIKE \'p-%\' ORDER BY "seq"',
        "all",
      )) as Array<{ payload: string }>
    ).map((row) => row.payload);
    const controlPayloads = (
      (await adapter.prepareAndExecuteWrite(
        'SELECT "payload" FROM "gc_control" ORDER BY "seq"',
        "all",
      )) as Array<{ payload: string }>
    ).map((row) => row.payload);
    assert(
      JSON.stringify(burstPayloads) === JSON.stringify(controlPayloads),
      "burst ordering differs from the sequential control run",
    );

    process.stdout.write(
      `GC_RESULT ${JSON.stringify({
        batcherEnabled,
        burstCount: burstCount.c,
        controlCount: controlCount.c,
        siblings: siblingRow.c,
        rejected: rejected.length,
      })}\n`,
    );
  } finally {
    await Promise.resolve(adapter.disconnect?.()).catch(() => {});
  }
}

test("group-commit worker — concurrent burst, isolation, sequential parity", async () => {
  await runWorker();
});
