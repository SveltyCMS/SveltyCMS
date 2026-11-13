/**
 * @file tests/unit/databases/rls-scoped-crud.test.ts
 * @description The wrapper that makes PostgreSQL RLS usable on the request path.
 *
 * WHY: a `FORCE` policy only filters when `app.tenant_id` is bound on the
 * connection, and a session-level `SET` on a shared pool leaks to the next
 * request. The wrapper therefore has to (a) run tenant-scoped calls in a
 * transaction, (b) pass the tenant explicitly instead of relying on process
 * state, and (c) leave every other path exactly as it was.
 *
 * ### Features:
 * - off by default: the call is forwarded untouched
 * - enforce: one transaction per tenant-scoped call, tenant passed as an option
 * - options position is per method (update/upsert take data before options)
 * - an explicit transaction, a missing tenant and a system scope all pass through
 * - streamed results are never wrapped (they outlive the call)
 * - the mode is resolved once per TTL, not once per query
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRlsScopedCrud } from "@src/databases/core/rls-scoped-crud";
import { withSystemScope } from "@src/databases/system-tenant-scope";

interface Call {
  method: string;
  args: unknown[];
}

function makeCrud() {
  const calls: Call[] = [];
  const result = (method: string) =>
    vi.fn(async (...args: unknown[]) => {
      calls.push({ method, args });
      return { success: true, data: [] };
    });

  const crud = {
    findMany: result("findMany"),
    findOne: result("findOne"),
    findById: result("findById"),
    count: result("count"),
    update: result("update"),
    upsert: result("upsert"),
    insert: result("insert"),
    deleteMany: result("deleteMany"),
    streamMany: result("streamMany"),
  };
  return { crud, calls };
}

function makeAdapter() {
  const transaction = vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>, _options?: { tenantId?: string }) =>
      fn({ tx: true }),
  );
  return { transaction };
}

/** Mode predicate injected into the wrapper (no settings memo in the loop). */
const mode = { enforced: false };

describe("createRlsScopedCrud", () => {
  beforeEach(() => {
    mode.enforced = false;
  });

  it("forwards the call untouched when RLS mode is off", async () => {
    const { crud } = makeCrud();
    const adapter = { transaction: vi.fn(async (fn: any) => fn({})) };
    const wrapped = createRlsScopedCrud(crud as never, adapter as never, () => mode.enforced);

    const result = await (wrapped as any).findMany("posts", {}, { tenantId: "tenant-a" });

    expect(result).toEqual({ success: true, data: [] });
    expect(adapter.transaction).not.toHaveBeenCalled();
  });

  it("runs a tenant-scoped call inside a transaction bound to that tenant", async () => {
    mode.enforced = true;
    const { crud, calls } = makeCrud();
    const adapter = makeAdapter();
    const wrapped = createRlsScopedCrud(crud as never, adapter as never, () => mode.enforced);

    await (wrapped as any).findMany("posts", { status: "draft" }, { tenantId: "tenant-a" });

    expect(adapter.transaction).toHaveBeenCalledTimes(1);
    const [, options] = adapter.transaction.mock.calls[0];
    expect(options).toMatchObject({ tenantId: "tenant-a", isWrite: false });

    // The inner call received the transaction handle — that is what binds the GUC.
    expect(calls[0].method).toBe("findMany");
    expect(calls[0].args[2]).toMatchObject({ tenantId: "tenant-a", transaction: { tx: true } });
  });

  it("uses the per-method options position for update and upsert", async () => {
    mode.enforced = true;
    const { crud, calls } = makeCrud();
    const adapter = makeAdapter();
    const wrapped = createRlsScopedCrud(crud as never, adapter as never, () => mode.enforced);

    await (wrapped as any).update("posts", "id-1", { title: "x" }, { tenantId: "tenant-a" });
    await (wrapped as any).upsert(
      "posts",
      { _id: "id-1" },
      { title: "x" },
      { tenantId: "tenant-a" },
    );

    expect(adapter.transaction).toHaveBeenCalledTimes(2);
    expect(calls[0].args[3]).toMatchObject({ transaction: { tx: true } });
    expect(calls[1].args[3]).toMatchObject({ transaction: { tx: true } });
    expect(adapter.transaction.mock.calls[0][1]).toMatchObject({ isWrite: true });
  });

  it("passes through when the caller already supplies a transaction", async () => {
    mode.enforced = true;
    const { crud, calls } = makeCrud();
    const adapter = makeAdapter();
    const wrapped = createRlsScopedCrud(crud as never, adapter as never, () => mode.enforced);
    const existing = { tx: "existing" };

    await (wrapped as any).findOne("posts", {}, { tenantId: "tenant-a", transaction: existing });

    expect(adapter.transaction).not.toHaveBeenCalled();
    expect(calls[0].args[2]).toMatchObject({ transaction: existing });
  });

  it("passes through a system scope, which must run on the bypass role", async () => {
    mode.enforced = true;
    const { crud } = makeCrud();
    const adapter = makeAdapter();
    const wrapped = createRlsScopedCrud(crud as never, adapter as never, () => mode.enforced);

    await (wrapped as any).deleteMany("posts", {}, withSystemScope("testing"));

    expect(adapter.transaction).not.toHaveBeenCalled();
  });

  it("passes through a call without a tenant", async () => {
    mode.enforced = true;
    const { crud } = makeCrud();
    const adapter = makeAdapter();
    const wrapped = createRlsScopedCrud(crud as never, adapter as never, () => mode.enforced);

    await (wrapped as any).count("posts", {}, {});
    // Options omitted entirely: nothing to bind.
    await (wrapped as any).count("posts");

    expect(adapter.transaction).not.toHaveBeenCalled();
  });

  it("never wraps a streamed result", async () => {
    mode.enforced = true;
    const { crud } = makeCrud();
    const adapter = makeAdapter();
    const wrapped = createRlsScopedCrud(crud as never, adapter as never, () => mode.enforced);

    await (wrapped as any).streamMany("posts", {}, { tenantId: "tenant-a" });

    expect(adapter.transaction).not.toHaveBeenCalled();
  });

  it("propagates a failure from inside the transaction instead of swallowing it", async () => {
    mode.enforced = true;
    const crud = {
      findMany: vi.fn(async () => ({ success: false, message: "boom" })),
    };
    const adapter = makeAdapter();
    const wrapped = createRlsScopedCrud(crud as never, adapter as never, () => mode.enforced);

    await expect((wrapped as any).findMany("posts", {}, { tenantId: "tenant-a" })).resolves.toEqual(
      { success: false, message: "boom" },
    );
  });
});
