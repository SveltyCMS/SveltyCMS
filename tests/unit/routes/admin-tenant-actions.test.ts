/**
 * @file tests/unit/routes/admin-tenant-actions.test.ts
 * @description Unit tests for tenant mutation actions.
 * The dbAdapter is injected, so only its `create`/`update` methods are mocked; `raise`
 * and `rethrow` are the real implementations from @utils/error-handling.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IDBAdapter, Tenant } from "@src/databases/db-interface";
import {
  createTenant,
  deleteTenant,
  toggleTenantStatus,
} from "../../../src/routes/(app)/config/tenants/tenants-actions.server";

type CreateTenantFn = IDBAdapter["system"]["tenants"]["create"];
type GetTenantFn = IDBAdapter["system"]["tenants"]["getById"];
type UpdateTenantFn = IDBAdapter["system"]["tenants"]["update"];
type DeleteTenantFn = IDBAdapter["system"]["tenants"]["delete"];
type CrudDeleteManyFn = IDBAdapter["crud"]["deleteMany"];

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
  const getById = vi.fn<GetTenantFn>();
  const update = vi.fn<UpdateTenantFn>();
  const del = vi.fn<DeleteTenantFn>();
  const deleteMany = vi.fn<CrudDeleteManyFn>().mockResolvedValue({
    success: true,
    data: { deletedCount: 0 },
  });
  const dbAdapter = {
    crud: { deleteMany },
    system: { tenants: { create, getById, update, delete: del } },
  } as unknown as IDBAdapter;
  return { create, getById, dbAdapter, update, del, deleteMany };
}

describe("createTenant and toggleTenantStatus edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when data is missing or name is undefined", async () => {
    const { create, dbAdapter } = makeTenantAdapter();
    await expect(createTenant({} as any, dbAdapter)).rejects.toMatchObject({
      status: 400,
      message: "Tenant name is required",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("toggleTenantStatus rejects when tenantId is empty string", async () => {
    const { dbAdapter, update } = makeTenantAdapter();
    await expect(
      toggleTenantStatus({ tenantId: "", status: "active" }, dbAdapter),
    ).rejects.toMatchObject({
      status: 400,
      message: "Invalid parameters",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("createTenant wraps thrown adapter rejection as AppError 500", async () => {
    const { create, dbAdapter } = makeTenantAdapter();
    create.mockRejectedValue(new Error("network failure"));
    await expect(createTenant({ name: "Acme" }, dbAdapter)).rejects.toMatchObject({
      status: 500,
      message: "Failed to create tenant",
    });
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
        maxCollections: 10,
        maxStorageBytes: 26214400,
        maxUsers: 5,
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

describe("deleteTenant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects empty tenantId with 400", async () => {
    const { dbAdapter, del, getById } = makeTenantAdapter();
    await expect(deleteTenant({ tenantId: "  " }, dbAdapter)).rejects.toMatchObject({
      status: 400,
      message: "Tenant ID is required",
    });
    expect(getById).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses deleting the caller's active workspace tenant", async () => {
    const { dbAdapter, del, getById } = makeTenantAdapter();
    await expect(
      deleteTenant({ tenantId: "demo", currentTenantId: "demo" }, dbAdapter),
    ).rejects.toMatchObject({
      status: 400,
      message: "Cannot delete the active tenant workspace",
    });
    expect(getById).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("returns 404 when the tenant does not exist", async () => {
    const { dbAdapter, del, getById } = makeTenantAdapter();
    getById.mockResolvedValue({ success: true, data: null });

    await expect(deleteTenant({ tenantId: "missing" }, dbAdapter)).rejects.toMatchObject({
      status: 404,
      message: "Tenant not found",
    });
    expect(del).not.toHaveBeenCalled();
  });

  it("cascade-deletes tenant data across tenant tables and deletes the tenant record", async () => {
    const { dbAdapter, del, deleteMany, getById } = makeTenantAdapter();
    getById.mockResolvedValue({ success: true, data: makeTenant({ _id: "kaz" as Tenant["_id"] }) });
    del.mockResolvedValue({ success: true, data: undefined });

    await expect(
      deleteTenant({ tenantId: "kaz", currentTenantId: "demo" }, dbAdapter),
    ).resolves.toEqual({ success: true });

    expect(deleteMany).toHaveBeenCalled();
    expect(deleteMany.mock.calls[0]?.[1]).toEqual({ tenantId: "kaz" });
    expect(deleteMany.mock.calls[0]?.[2]).toMatchObject({
      permanent: true,
      systemScope: { kind: "system", reason: "bootstrap" },
    });
    expect(del).toHaveBeenCalledWith("kaz");
  });

  it("wraps adapter delete failure as 500", async () => {
    const { dbAdapter, del, getById } = makeTenantAdapter();
    getById.mockResolvedValue({ success: true, data: makeTenant({ _id: "kaz" as Tenant["_id"] }) });
    del.mockResolvedValue({
      success: false,
      message: "delete blocked",
      error: { code: "DELETE_TENANT_FAILED", message: "delete blocked" },
    });

    await expect(deleteTenant({ tenantId: "kaz" }, dbAdapter)).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to delete tenant",
    });
  });
});
