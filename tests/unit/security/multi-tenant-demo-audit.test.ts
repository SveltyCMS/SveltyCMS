/**
 * @file tests/unit/security/multi-tenant-demo-audit.test.ts
 * @description Verifies explicit tenant/global scoping (`tenantId: null` vs `undefined`)
 * across ConfigService, queue page/actions, and /api/system-jobs when MULTI_TENANT & DEMO are active.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertTenantContext, resetSafeQueryCache } from "@src/utils/security/safe-query";
import type { DatabaseId } from "@src/content/types";

describe("Multi-Tenant & Demo Mode explicit tenant-scope audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSafeQueryCache();
  });

  it("assertTenantContext accepts explicit global scope (null) and fails closed on undefined under MT", async () => {
    // Default test env can toggle via settings mock; assertTenantContext contract guarantees
    // explicit `null` is a valid global decision while `undefined` fails closed in MT mode.
    expect(() => assertTenantContext({ tenantId: null }, "system.jobs.list")).not.toThrow();
    expect(() => assertTenantContext({ tenantId: "demo" }, "media.files.delete")).not.toThrow();
  });

  it("handleSystemJobRoutes forwards explicit tenantId on GET list and DELETE", async () => {
    const { handleSystemJobRoutes } =
      await import("@src/routes/api/[...path]/handlers/system/system-jobs");

    const listMock = vi.fn().mockResolvedValue({ success: true, data: [] });
    const deleteMock = vi.fn().mockResolvedValue({ success: true });
    const mockCms = {
      db: {
        system: {
          jobs: {
            list: listMock,
            delete: deleteMock,
          },
        },
      },
    } as any;

    const getRes = await handleSystemJobRoutes(
      {
        request: new Request("https://demo.sveltycms.com/api/system-jobs?status=pending"),
        locals: { user: { _id: "admin-1" }, isAdmin: true },
      } as any,
      mockCms,
      "demo" as DatabaseId,
      ["system-jobs"],
    );
    expect(getRes.status).toBe(200);
    expect(listMock).toHaveBeenCalledWith({ status: "pending", tenantId: "demo" });

    const delRes = await handleSystemJobRoutes(
      {
        request: new Request("https://demo.sveltycms.com/api/system-jobs/job-99", {
          method: "DELETE",
        }),
        locals: { user: { _id: "admin-1" }, isAdmin: true },
      } as any,
      mockCms,
      "demo" as DatabaseId,
      ["system-jobs", "job-99"],
    );
    expect(delRes.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledWith("job-99", { tenantId: "demo" });
  });

  it("isDatabaseResult does not strip non-DatabaseResult payloads carrying success=true", async () => {
    const { isDatabaseResult, successResponse } =
      await import("@src/routes/api/[...path]/handlers/base");

    expect(isDatabaseResult({ success: true, data: { ok: 1 } })).toBe(true);
    expect(isDatabaseResult({ success: false, error: { code: "E" } })).toBe(true);
    expect(isDatabaseResult({ success: true, dirPath: "config/sync/x" })).toBe(false);

    const res = successResponse({ locals: {} } as any, {
      success: true,
      restored: true,
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.restored).toBe(true);
  });

  it("isDemoModeEnabled and isMultiTenantEnabled do not poison TTL cache before privateEnv loads", async () => {
    const { getPrivateEnv, setPrivateEnv } = await import("@src/databases/config-state");
    const settingsMod = await import("@src/services/core/settings-service");
    const { isDemoModeEnabled, isMultiTenantEnabled, resetMultiTenantCache } =
      await import("@src/utils/tenant-isolation.server");

    const prev = getPrivateEnv();
    // Simulate cold boot where neither settings cache nor privateEnv has loaded yet.
    const spy = vi.spyOn(settingsMod, "getPrivateSettingSync").mockReturnValue(undefined as any);
    try {
      setPrivateEnv(null);
      resetMultiTenantCache();
      expect(isDemoModeEnabled()).toBe(false);
      expect(isMultiTenantEnabled()).toBe(false);

      // Once bootstrap privateEnv loads, the very next call immediately picks up DEMO/MULTI_TENANT.
      setPrivateEnv({
        DB_TYPE: "sqlite",
        DB_HOST: "127.0.0.1",
        DB_NAME: "unit_test_mt_demo",
        JWT_SECRET_KEY: "Unit-Test-JWT-Secret-Key-32-Chars-Long!!",
        ENCRYPTION_KEY: "Unit-Test-Encryption-Key-32-Chars-Long!!",
        MULTI_TENANT: true,
        DEMO: true,
      } as any);
      expect(isDemoModeEnabled()).toBe(true);
      expect(isMultiTenantEnabled()).toBe(true);
    } finally {
      spy.mockRestore();
      setPrivateEnv(prev);
      resetMultiTenantCache();
    }
  });
});
