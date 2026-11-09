// @ts-nocheck
/**
 * @file tests/unit/multi-tenancy/crud-tenant-guard-batch.test.ts
 * @description Regression tests for the guarded CRUD wrapper (R3/R4).
 *
 * ### Features:
 * - guarded CRUD returns the inner promise directly (no extra async layer)
 * - a synchronous tenant throw is still observable as a rejection
 * - insertMany copies only tenant-less rows
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ICrudAdapter } from "@src/databases/db-interface";
import type { DatabaseId } from "@src/content/types";

vi.mock("@src/databases/config-state", () => ({
  getPrivateEnv: () => (globalThis as any).__privateEnv,
  setPrivateEnv: (env: any) => {
    (globalThis as any).__privateEnv = env;
  },
  loadPrivateConfig: () => Promise.resolve((globalThis as any).__privateEnv),
  clearPrivateConfigCache: () => {},
}));

describe("crud-tenant-guard batch / no-async-layer", () => {
  beforeEach(async () => {
    (globalThis as any).__privateEnv = { MULTI_TENANT: true };
    const { resetGuardCache } = await import("@src/databases/crud-tenant-guard");
    const { resetSafeQueryCache } = await import("@src/utils/security/safe-query");
    resetGuardCache();
    resetSafeQueryCache();
  });

  it("R3: returns the inner promise directly (no async wrapper layer)", async () => {
    const { createTenantGuardedCrud } = await import("@src/databases/crud-tenant-guard");
    const innerPromise = Promise.resolve({ success: true, data: [] });
    const inner = { find: vi.fn().mockReturnValue(innerPromise) } as unknown as ICrudAdapter;
    const guard = createTenantGuardedCrud(inner, "reject");

    const result = guard.find("posts", {}, { tenantId: "tenant-a" as DatabaseId });

    expect(result).toBe(innerPromise);
  });

  it("R3: a synchronous tenant throw is still observable as a rejection", async () => {
    const { createTenantGuardedCrud } = await import("@src/databases/crud-tenant-guard");
    const inner = { find: vi.fn() } as unknown as ICrudAdapter;
    const guard = createTenantGuardedCrud(inner, "reject");

    await expect((async () => guard.find("posts", {}))()).rejects.toThrow(
      /Security Violation|tenant/i,
    );
    expect(inner.find).not.toHaveBeenCalled();
  });

  it("R4: insertMany copies only tenant-less rows", async () => {
    const { createTenantGuardedCrud } = await import("@src/databases/crud-tenant-guard");
    const insertMany = vi.fn().mockResolvedValue({ success: true, data: [] });
    const inner = { insertMany } as unknown as ICrudAdapter;
    const guard = createTenantGuardedCrud(inner, "reject");

    const withTenant = { title: "A", tenantId: "tenant-a" as DatabaseId };
    const withoutTenant = { title: "B" };

    await guard.insertMany("posts", [withTenant, withoutTenant], {
      tenantId: "tenant-a" as DatabaseId,
    });

    const rows = insertMany.mock.calls[0][1];
    expect(rows[0]).toBe(withTenant); // already tenant-scoped — not copied
    expect(rows[1]).not.toBe(withoutTenant); // copied with the injected tenant
    expect(rows[1]).toEqual({ title: "B", tenantId: "tenant-a" });
  });
});
