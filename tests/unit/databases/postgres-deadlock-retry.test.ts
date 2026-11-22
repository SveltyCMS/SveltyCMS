/**
 * @file tests/unit/databases/postgres-deadlock-retry.test.ts
 * @description PostgreSQL transaction retry on 40P01 / 40001.
 *
 * ### Features:
 * - Retries the whole callback when PostgreSQL aborted the transaction
 * - Never retries application errors, unique violations, or intentional rollbacks
 * - `maxAttempts` caps the retry budget; exhaustion returns TRANSACTION_FAILED
 * - Detects the SQLSTATE through Drizzle's `cause` chain and via message fallback
 */

import { describe, expect, it, vi } from "vitest";
import { TransactionModule } from "@src/databases/postgresql/transaction-module";
import type { PostgresAdapterCore } from "@src/databases/postgresql/adapter-core";
import type { DatabaseResult } from "@src/databases/db-interface";

type RunTx = (tx: Record<string, unknown>) => Promise<unknown>;

interface FakeCore {
  module: TransactionModule;
  transaction: ReturnType<typeof vi.fn>;
  handleError: ReturnType<typeof vi.fn>;
}

function sqlState(code: string, message = "transaction aborted"): Error {
  const err = new Error(message);
  (err as Error & { code?: string }).code = code;
  return err;
}

function createCore(behavior: (run: RunTx) => Promise<unknown>): FakeCore {
  const transaction = vi.fn(async (run: RunTx) => behavior(run));
  const handleError = vi.fn(
    (_error: unknown, code: string) =>
      ({
        success: false,
        message: code,
        error: { code, message: code },
      }) as DatabaseResult<never>,
  );

  const core = {
    isConnected: () => true,
    sql: (() => undefined) as unknown,
    currentTenantId: null,
    db: { transaction },
    crud: {},
    auth: {},
    content: {},
    media: {},
    system: {},
    batch: {},
    collection: {},
    handleError,
    notConnectedError: () => ({
      success: false,
      message: "NOT_CONNECTED",
      error: { code: "NOT_CONNECTED", message: "NOT_CONNECTED" },
    }),
    setTenantContext: vi.fn(async () => undefined),
  } as unknown as PostgresAdapterCore;

  return {
    module: new TransactionModule(core),
    transaction,
    handleError,
  };
}

/** Transaction mock that runs the callback, then rejects like the driver would at commit. */
function failAfterRun(error: () => Error) {
  return async (run: RunTx) => {
    await run({});
    throw error();
  };
}

describe("TransactionModule deadlock retry", () => {
  it("retries a 40P01 deadlock and commits the replayed transaction", async () => {
    let calls = 0;
    const { module, transaction } = createCore(async (run) => {
      calls++;
      if (calls <= 2) {
        await run({});
        throw sqlState("40P01", "deadlock detected");
      }
      return run({});
    });

    const result = await module.execute(async () => ({ success: true, data: 42 }));

    expect(result).toMatchObject({ success: true, data: 42 });
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it("retries serialization failures (40001)", async () => {
    let calls = 0;
    const { module, transaction } = createCore(async (run) => {
      calls++;
      if (calls === 1) {
        await run({});
        throw sqlState("40001", "could not serialize access due to concurrent update");
      }
      return run({});
    });

    const result = await module.execute(async () => ({ success: true, data: "ok" }));

    expect(result).toMatchObject({ success: true, data: "ok" });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("walks the cause chain for a wrapped SQLSTATE", async () => {
    const wrapped = new Error("DrizzleQueryError");
    (wrapped as Error & { cause?: unknown }).cause = sqlState("40P01", "deadlock detected");

    let calls = 0;
    const { module, transaction } = createCore(async (run) => {
      calls++;
      if (calls === 1) throw wrapped;
      return run({});
    });

    const result = await module.execute(async () => ({ success: true, data: true }));

    expect(result.success).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("falls back to the driver message when the SQLSTATE is dropped", async () => {
    let calls = 0;
    const { module, transaction } = createCore(async (run) => {
      calls++;
      if (calls === 1) throw new Error("deadlock detected");
      return run({});
    });

    const result = await module.execute(async () => ({ success: true, data: true }));

    expect(result.success).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable database errors", async () => {
    const { module, transaction, handleError } = createCore(failAfterRun(() => sqlState("23505")));

    const result = await module.execute(async () => ({ success: true, data: 1 }));

    expect(result.success).toBe(false);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(handleError).toHaveBeenCalledWith(expect.any(Error), "TRANSACTION_FAILED");
  });

  it("does not retry an intentional rollback envelope", async () => {
    const { module, transaction } = createCore(async (run) => run({}));

    const result = await module.execute(async () => ({
      success: false,
      message: "nope",
      error: { code: "NOPE", message: "nope" },
    }));

    expect(result).toMatchObject({
      success: false,
      error: { code: "TRANSACTION_ROLLED_BACK" },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("stops at maxAttempts and surfaces TRANSACTION_FAILED", async () => {
    const { module, transaction, handleError } = createCore(
      failAfterRun(() => sqlState("40P01", "deadlock detected")),
    );

    const result = await module.execute(async () => ({ success: true, data: 1 }), {
      maxAttempts: 2,
    });

    expect(result.success).toBe(false);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(handleError).toHaveBeenCalledWith(expect.any(Error), "TRANSACTION_FAILED");
  });

  it("maxAttempts: 1 disables the retry budget", async () => {
    const { module, transaction } = createCore(
      failAfterRun(() => sqlState("40P01", "deadlock detected")),
    );

    await module.execute(async () => ({ success: true, data: 1 }), { maxAttempts: 1 });

    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
