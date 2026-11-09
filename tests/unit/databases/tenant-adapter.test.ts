// @ts-nocheck
/**
 * @file tests/unit/databases/tenant-adapter.test.ts
 * @description Regression tests for forTenant/injectTenant (R1/R2).
 *
 * ### Features:
 * - bound adapter is reused for the same (adapter, tenant)
 * - injectTenant returns options unchanged on bypass and when tenantId is already set
 */

import { describe, expect, it, vi } from "vitest";
import { forTenant } from "@src/databases/tenant-adapter";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import type { DatabaseAdapter, DatabaseId } from "@src/databases/db-interface";

function makeAdapter(crud: unknown): DatabaseAdapter {
  return { crud } as unknown as DatabaseAdapter;
}

describe("forTenant adapter binding", () => {
  it("R1: reuses the bound adapter for the same (adapter, tenant)", () => {
    const adapter = makeAdapter({ findMany: vi.fn() });

    const first = forTenant(adapter, "tenant-a" as DatabaseId);
    const second = forTenant(adapter, "tenant-a" as DatabaseId);
    expect(first).toBe(second);

    const otherTenant = forTenant(adapter, "tenant-b" as DatabaseId);
    expect(otherTenant).not.toBe(first);
  });

  it("R2: returns the options bag unchanged on a system-scope bypass", async () => {
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [] });
    const adapter = makeAdapter({ findMany });
    const bound = forTenant(adapter, "tenant-a" as DatabaseId);

    const bypassOpts = withSystemScope("scheduler");
    await bound.crud.findMany("posts", {}, bypassOpts);

    expect(findMany).toHaveBeenCalledWith("posts", {}, bypassOpts);
  });

  it("R2: returns the options bag unchanged when tenantId is already set", async () => {
    const findMany = vi.fn().mockResolvedValue({ success: true, data: [] });
    const adapter = makeAdapter({ findMany });
    const bound = forTenant(adapter, "tenant-a" as DatabaseId);

    const alreadySet = { tenantId: "tenant-b" as DatabaseId };
    await bound.crud.findMany("posts", {}, alreadySet);

    expect(findMany).toHaveBeenCalledWith("posts", {}, alreadySet);
  });
});
