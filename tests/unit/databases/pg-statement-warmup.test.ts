/**
 * @file tests/unit/databases/pg-statement-warmup.test.ts
 * @description Unit tests for the PostgreSQL boot statement warm-up (Phase 1).
 *
 * Asserts the observable contract with a mocked executor (no live database):
 * every probe runs REPETITIONS times per pooled connection with
 * `{ prepare: true }`, the update probe is write-free (impossible UUIDv7), and
 * the returned stats come from pg_prepared_statements.
 */

import { describe, expect, it } from "vitest";
import {
  IMPOSSIBLE_ID,
  WARMUP_REPETITIONS,
  warmPgPreparedStatements,
  type PreparedStatementExecutor,
} from "@src/databases/postgresql/statement-warmup";

interface RecordedCall {
  sqlText: string;
  params?: unknown[];
  options?: { prepare?: boolean };
}

function makeExecutor(poolResponses: unknown[][] = []): {
  executor: PreparedStatementExecutor;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let statsCalls = 0;
  const executor: PreparedStatementExecutor = {
    async unsafe(query, params, options) {
      calls.push({ sqlText: query, params, options });
      if (query.includes("pg_prepared_statements")) {
        statsCalls++;
        return poolResponses[statsCalls - 1] ?? [{ total: 0, warmed: 0 }];
      }
      return [];
    },
  };
  return { executor, calls };
}

describe("warmPgPreparedStatements", () => {
  it("runs every probe REPETITIONS times per pooled connection with prepare: true", async () => {
    const { executor, calls } = makeExecutor();
    await warmPgPreparedStatements(executor, 3);

    const probes = calls.filter((c) => !c.sqlText.includes("pg_prepared_statements"));
    // 4 probe shapes × REPETITIONS × 3 connections
    expect(probes).toHaveLength(4 * WARMUP_REPETITIONS * 3);
    for (const probe of probes) {
      expect(probe.options?.prepare).toBe(true);
    }
  });

  it("targets the impossible UUIDv7 so no update can ever write a row", async () => {
    const { executor, calls } = makeExecutor();
    await warmPgPreparedStatements(executor, 1);

    const updates = calls.filter((c) => c.sqlText.startsWith("UPDATE"));
    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) {
      expect(update.params?.[0]).toBe(IMPOSSIBLE_ID);
    }
    // Version nibble check: all-zero UUID cannot be a generated UUIDv7.
    expect(IMPOSSIBLE_ID.charAt(12)).not.toBe("7");
  });

  it("returns the generic-plan counters from pg_prepared_statements", async () => {
    const { executor } = makeExecutor([[{ total: 12, warmed: 9 }]]);
    const stats = await warmPgPreparedStatements(executor, 2);
    expect(stats).toEqual({ total: 12, warmed: 9 });
  });

  it("clamps the connection count to at least 1", async () => {
    const { executor, calls } = makeExecutor();
    await warmPgPreparedStatements(executor, 0);
    const probes = calls.filter((c) => !c.sqlText.includes("pg_prepared_statements"));
    expect(probes).toHaveLength(4 * WARMUP_REPETITIONS * 1);
  });

  it("keeps zero-row reads: every SELECT probe targets the impossible id or a 0 limit", async () => {
    const { executor, calls } = makeExecutor();
    await warmPgPreparedStatements(executor, 1);
    for (const call of calls) {
      if (call.sqlText.startsWith("SELECT") && !call.sqlText.includes("pg_prepared_statements")) {
        const params = call.params ?? [];
        const hasImpossibleId = params.includes(IMPOSSIBLE_ID);
        const zeroLimit =
          call.sqlText.includes("LIMIT 0") ||
          (call.sqlText.includes("LIMIT $3") && params[params.length - 1] === 0);
        expect(hasImpossibleId || zeroLimit).toBe(true);
      }
    }
  });
});
