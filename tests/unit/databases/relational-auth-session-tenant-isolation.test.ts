/**
 * @file tests/unit/databases/relational-auth-session-tenant-isolation.test.ts
 * @description Regression coverage for `deleteSession` tenant scoping.
 * A tenant-scoped caller must not delete another tenant's session row by id; the
 * delete routes through `applyTenantFilter` only when a tenant is supplied, while
 * the tenant-less logout / session-rotation path (raw id delete) stays untouched.
 *
 * Features:
 * - scoped delete calls `applyTenantFilter` with the session tenant column
 * - tenant-less delete does not call `applyTenantFilter` (no fail-closed throw)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

vi.mock("@src/databases/core/relational-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/databases/core/relational-utils")>();
  return {
    ...actual,
    applyTenantFilter: vi.fn(actual.applyTenantFilter),
  };
});

import { applyTenantFilter } from "@src/databases/core/relational-utils";
import { RelationalAuthModule } from "@src/databases/core/relational-auth";

const authSessions = sqliteTable("auth_sessions", {
  _id: text("_id").primaryKey(),
  tenantId: text("tenantId"),
});

function makeModule() {
  const where = vi.fn().mockResolvedValue(undefined);
  const deleteFn = vi.fn(() => ({ where }));
  const mockDb = { delete: deleteFn };

  const adapter = {
    type: "sqlite",
    db: mockDb,
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

  const module = new RelationalAuthModule(adapter as never, { authSessions });
  return { module, deleteFn, where };
}

describe("RelationalAuthModule.deleteSession tenant isolation", () => {
  beforeEach(() => {
    vi.mocked(applyTenantFilter).mockClear();
  });

  it("scopes the delete by tenant when the caller supplies tenantId", async () => {
    const { module, deleteFn } = makeModule();

    await module.deleteSession("sess-1" as never, { tenantId: "tenant-a" as never });

    expect(deleteFn).toHaveBeenCalledWith(authSessions);
    expect(applyTenantFilter).toHaveBeenCalledTimes(1);
    expect(applyTenantFilter).toHaveBeenCalledWith(
      expect.any(Array),
      authSessions.tenantId,
      expect.objectContaining({ tenantId: "tenant-a" }),
    );
  });

  it("does not scope by tenant on the tenant-less logout path", async () => {
    const { module, deleteFn } = makeModule();

    await module.deleteSession("sess-1" as never);

    expect(deleteFn).toHaveBeenCalledWith(authSessions);
    expect(applyTenantFilter).not.toHaveBeenCalled();
  });
});
