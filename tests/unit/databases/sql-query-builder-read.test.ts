/**
 * @file tests/unit/databases/sql-query-builder-read.test.ts
 * @description QueryBuilder list/exists path: schema-aware in-place conversion
 *   and LIMIT 1 exists (the admin collection list uses queryBuilder, not crud.findMany).
 */

import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { SqlQueryBuilder, SQLITE_DIALECT } from "@src/databases/core/sql-query-builder";
import { registerTableSchema } from "@src/databases/core/relational-utils";

function chainFrom(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.$dynamic = () => chain;
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = (n: number) => {
    chain._limit = n;
    return chain;
  };
  chain.offset = () => chain;
  // Drizzle queries are thenable; the mock must be too so `await q` resolves.
  // oxlint-disable-next-line unicorn/no-thenable
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

describe("SqlQueryBuilder list/exists read path", () => {
  it("exists selects _id LIMIT 1 instead of COUNT(*)", async () => {
    const idCol = { name: "_id" };
    const table = { _id: idCol, status: { name: "status" } };
    const chain = chainFrom([{ id: "1" }]);
    const select = vi.fn((proj: unknown) => {
      expect(proj).toEqual({ id: idCol });
      return { from: () => chain };
    });
    const qb = new SqlQueryBuilder(
      {
        db: { select },
        getTable: () => table,
        getJsonField: () => sql`data`,
        handleError: () => ({
          success: false as const,
          message: "err",
          error: { code: "TEST_ERR", message: "err" },
        }),
        notImplemented: () => ({
          success: false as const,
          message: "ni",
          error: { code: "TEST_NI", message: "ni" },
        }),
        registerReadSchema: vi.fn(),
      },
      "posts",
      SQLITE_DIALECT,
    );

    const res = await qb.exists();
    if (!res.success) throw new Error("expected success");
    expect(res.success).toBe(true);
    expect(res.data).toBe(true);
    expect(chain._limit).toBe(1);
  });

  it("execute registers read schema before converting rows in place", async () => {
    registerTableSchema("posts", ["_id", "createdAt", "title"]);
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const row = { _id: "1", createdAt, title: "Hello" };
    const chain = chainFrom([row]);
    const registerReadSchema = vi.fn();
    const qb = new SqlQueryBuilder(
      {
        db: {
          select: () => ({ from: () => chain }),
        },
        getTable: () => ({ _id: {}, createdAt: {}, title: {} }),
        getJsonField: () => sql`data`,
        handleError: () => ({
          success: false as const,
          message: "err",
          error: { code: "TEST_ERR", message: "err" },
        }),
        notImplemented: () => ({
          success: false as const,
          message: "ni",
          error: { code: "TEST_NI", message: "ni" },
        }),
        registerReadSchema,
      },
      "posts",
      SQLITE_DIALECT,
    );

    const res = await qb.execute();
    if (!res.success) throw new Error("expected success");
    expect(registerReadSchema).toHaveBeenCalledWith("posts");
    expect(res.success).toBe(true);
    expect(res.data?.[0]).toBe(row);
    expect(row.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
