/**
 * @file tests/unit/databases/relational-auth-validate-session-tenant-isolation.test.ts
 * @description Regression coverage for the raw `validateSession` fast path.
 * The Drizzle fallback scopes the session lookup by `options.tenantId`, but the
 * raw SQL path previously ignored it — a tenant-A session validated against
 * tenant-B. The raw path must carry the same tenant predicate.
 *
 * Features:
 * - non-null tenantId adds `u.tenantId = ?` and binds the tenant value
 * - null tenantId adds `u.tenantId IS NULL` with no tenant bind
 * - absent tenantId keeps the unscoped (tenant-less) query
 */

import { describe, expect, it, vi } from "vitest";
import { RelationalAuthModule } from "@src/databases/core/relational-auth";
import { SQLITE_DIALECT } from "@src/databases/core/sql-query-builder";

function makeModule(rawExecute: (sql: string, params?: any[]) => Promise<any>) {
  const adapter = {
    sqlDialect: SQLITE_DIALECT,
    raw: { execute: rawExecute },
    wrap: async (fn: () => Promise<unknown>) => {
      try {
        return { success: true as const, data: await fn() };
      } catch (error) {
        return {
          success: false as const,
          error: { code: "ERR", message: String(error) },
        };
      }
    },
  };
  // The raw path returns `null` on zero rows before ever touching the schema,
  // so an empty schema object is sufficient for this contract test.
  return new RelationalAuthModule(adapter as never, {} as never);
}

describe("RelationalAuthModule.validateSession raw path tenant isolation", () => {
  it("binds a non-null tenantId into the raw SQL tenant predicate", async () => {
    const rawExecute = vi.fn().mockResolvedValue([]);
    const module = makeModule(rawExecute);

    await module.validateSession("sess-a" as never, { tenantId: "tenant-b" as never });

    expect(rawExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = rawExecute.mock.calls[0];
    expect(sql).toContain("u.tenantId = ?");
    expect(params[2]).toBe("tenant-b");
  });

  it("emits an IS NULL predicate (no bind) for a null tenantId", async () => {
    const rawExecute = vi.fn().mockResolvedValue([]);
    const module = makeModule(rawExecute);

    await module.validateSession("sess-a" as never, { tenantId: null as never });

    const [sql, params] = rawExecute.mock.calls[0];
    expect(sql).toContain("u.tenantId IS NULL");
    // SQLite binds [sessionId, Date.now()] and no tenant value for IS NULL.
    expect(params).toHaveLength(2);
  });

  it("keeps the unscoped query when no tenant is supplied", async () => {
    const rawExecute = vi.fn().mockResolvedValue([]);
    const module = makeModule(rawExecute);

    await module.validateSession("sess-a" as never);

    const [sql] = rawExecute.mock.calls[0];
    // The SELECT list always carries the `u.tenantId` column; the tenant
    // *predicate* is what must be absent on the unscoped path.
    expect(sql).not.toContain("AND u.tenantId");
  });
});
