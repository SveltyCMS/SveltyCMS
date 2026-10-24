/**
 * @file tests/unit/routes/admin-tenant-actions.test.ts
 * @description Unit tests for the /admin super-admin guard and the tenant mutation actions.
 * The dbAdapter is injected, so only its `create`/`update` methods are mocked; `raise`
 * and `rethrow` are the real implementations from @utils/error-handling.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IDBAdapter, Tenant } from "@src/databases/db-interface";
import { load } from "../../../src/routes/(admin)/admin/+page.server";
import {
  createTenant,
  toggleTenantStatus,
} from "../../../src/routes/(admin)/admin/tenants/tenants-actions.server";

type CreateTenantFn = IDBAdapter["system"]["tenants"]["create"];
type UpdateTenantFn = IDBAdapter["system"]["tenants"]["update"];

type AdminLocalsOptions = {
  isAdmin?: boolean;
  tenantId?: string | null;
};

function makeLocals({ isAdmin = true, tenantId = null }: AdminLocalsOptions = {}): App.Locals {
  return {
    user: {
      _id: "user-1",
      email: "admin@example.com",
      role: "admin",
      tenantId,
    },
    isAdmin,
    roles: [],
    allTokens: [],
    allUsers: [],
    customCss: "",
    darkMode: false,
  } as unknown as App.Locals;
}

function makeLoadEvent(locals: App.Locals) {
  return { locals } as unknown as Parameters<typeof load>[0];
}

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    _id: "tenant-1" as Tenant["_id"],
    createdAt: "2026-01-01T00:00:00.000Z" as Tenant["createdAt"],
    updatedAt: "2026-01-01T00:00:00.000Z" as Tenant["updatedAt"],
    name: "Acme",
    ownerId: "owner-1" as Tenant["ownerId"],
    plan: "free",
    status: "active",
    quota: {
      maxApiRequestsPerMonth: 10000,
      maxCollections: 20,
      maxStorageBytes: 5368709120,
      maxUsers: 10,
    },
    usage: {
      apiRequestsMonth: 0,
      collectionsCount: 0,
      lastUpdated: new Date("2026-01-01T00:00:00.000Z"),
      storageBytes: 0,
      usersCount: 0,
    },
    ...overrides,
  };
}

function makeTenantAdapter() {
  const create = vi.fn<CreateTenantFn>();
  const update = vi.fn<UpdateTenantFn>();
  const dbAdapter = {
    system: { tenants: { create, update } },
  } as unknown as IDBAdapter;
  return { create, dbAdapter, update };
}

describe("/admin +page.server load", () => {
  it("redirects a non-admin to the site root", async () => {
    await expect(load(makeLoadEvent(makeLocals({ isAdmin: false })))).rejects.toMatchObject({
      status: 303,
      location: "/",
    });
  });

  it("redirects a tenant admin to the site root", async () => {
    await expect(
      load(makeLoadEvent(makeLocals({ isAdmin: true, tenantId: "tenant-1" }))),
    ).rejects.toMatchObject({
      status: 303,
      location: "/",
    });
  });

  it("returns for a super-admin", async () => {
    await expect(load(makeLoadEvent(makeLocals()))).resolves.toBeUndefined();
  });
});

describe("createTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an empty name without touching the adapter", async () => {
    const { create, dbAdapter } = makeTenantAdapter();

    await expect(createTenant({ name: "   " }, dbAdapter)).rejects.toMatchObject({
      status: 400,
      message: "Tenant name is required",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("calls the adapter with the expected free-plan quota", async () => {
    const { create, dbAdapter } = makeTenantAdapter();
    const tenant = makeTenant();
    create.mockResolvedValue({ success: true, data: tenant });

    await expect(createTenant({ name: "  Acme  " }, dbAdapter)).resolves.toEqual({
      success: true,
      tenant,
    });

    expect(create).toHaveBeenCalledTimes(1);
    const [payload] = create.mock.calls[0];
    expect(payload).toMatchObject({
      name: "Acme",
      plan: "free",
      status: "active",
      quota: {
        maxApiRequestsPerMonth: 10000,
        maxCollections: 20,
        maxStorageBytes: 5368709120,
        maxUsers: 10,
      },
    });
    expect(payload.ownerId).toEqual(expect.any(String));
  });

  it("surfaces an adapter failure", async () => {
    const { create, dbAdapter } = makeTenantAdapter();
    create.mockResolvedValue({
      success: false,
      message: "insert failed",
      error: { code: "DB_WRITE_FAILED", message: "insert failed" },
    });

    await expect(createTenant({ name: "Acme" }, dbAdapter)).rejects.toMatchObject({
      status: 500,
      message: "insert failed",
    });
  });
});

describe("toggleTenantStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid status without touching the adapter", async () => {
    const { dbAdapter, update } = makeTenantAdapter();

    await expect(
      toggleTenantStatus({ tenantId: "tenant-1", status: "archived" }, dbAdapter),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid parameters",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("updates the tenant status", async () => {
    const { dbAdapter, update } = makeTenantAdapter();
    update.mockResolvedValue({ success: true, data: makeTenant({ status: "suspended" }) });

    await expect(
      toggleTenantStatus({ tenantId: "tenant-1", status: "suspended" }, dbAdapter),
    ).resolves.toEqual({ success: true });
    expect(update).toHaveBeenCalledWith("tenant-1", { status: "suspended" });
  });

  it("surfaces an adapter failure", async () => {
    const { dbAdapter, update } = makeTenantAdapter();
    update.mockResolvedValue({
      success: false,
      message: "adapter offline",
      error: { code: "DB_UNAVAILABLE", message: "adapter offline" },
    });

    await expect(
      toggleTenantStatus({ tenantId: "tenant-1", status: "active" }, dbAdapter),
    ).rejects.toMatchObject({
      status: 500,
      message: "adapter offline",
    });
  });

  it("wraps a thrown adapter error as a 500", async () => {
    const { dbAdapter, update } = makeTenantAdapter();
    update.mockRejectedValue(new Error("socket closed"));

    await expect(
      toggleTenantStatus({ tenantId: "tenant-1", status: "active" }, dbAdapter),
    ).rejects.toMatchObject({
      status: 500,
      message: "Update failed",
    });
  });
});
