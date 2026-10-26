/**
 * @file tests/unit/routes/admin-tenants-page-server.test.ts
 * @description Unit tests for the super-admin gate and tenant-list contract of
 * `/admin/tenants` (`+page.server.ts`).
 *
 * Only the database boundary is mocked: authorization helper, redirects and the
 * load return shape run for real, so the tests pin both refusal paths and the
 * data handed to the page.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getDbInitPromise: vi.fn<(force?: boolean, scope?: string) => Promise<void>>(),
  listTenants: vi.fn<(options?: unknown) => Promise<unknown>>(),
}));

vi.mock("@src/databases/db", () => ({
  getDbInitPromise: (force?: boolean, scope?: string) => h.getDbInitPromise(force, scope),
  dbAdapter: {
    system: {
      tenants: {
        list: (options?: unknown) => h.listTenants(options),
      },
    },
  },
}));

import { load } from "../../../src/routes/(admin)/admin/tenants/+page.server";

type TenantsLoadEvent = Parameters<typeof load>[0];

function makeLocals({
  isAdmin = true,
  tenantId = null,
}: { isAdmin?: boolean; tenantId?: string | null } = {}): App.Locals {
  return {
    user: {
      _id: "user-1",
      email: "admin@example.com",
      role: "admin",
      tenantId,
    },
    isAdmin,
    tenantId,
  } as unknown as App.Locals;
}

function makeLoadEvent(locals: App.Locals): TenantsLoadEvent {
  return { locals } as unknown as TenantsLoadEvent;
}

const TENANTS = [
  { _id: "tenant-1", name: "Acme" },
  { _id: "tenant-2", name: "Globex" },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.getDbInitPromise.mockResolvedValue(undefined);
  h.listTenants.mockResolvedValue({ success: true, data: TENANTS });
});

describe("/admin/tenants +page.server load", () => {
  it("redirects a non-admin to the site root", async () => {
    await expect(load(makeLoadEvent(makeLocals({ isAdmin: false })))).rejects.toMatchObject({
      status: 303,
      location: "/",
    });
    expect(h.listTenants).not.toHaveBeenCalled();
  });

  it("redirects a tenant admin to the site root", async () => {
    await expect(
      load(makeLoadEvent(makeLocals({ isAdmin: true, tenantId: "tenant-1" }))),
    ).rejects.toMatchObject({
      status: 303,
      location: "/",
    });
    expect(h.listTenants).not.toHaveBeenCalled();
  });

  it("returns the tenant list for a super-admin", async () => {
    await expect(load(makeLoadEvent(makeLocals()))).resolves.toEqual({ tenants: TENANTS });
    expect(h.getDbInitPromise).toHaveBeenCalledWith(false, "CORE");
    expect(h.listTenants).toHaveBeenCalledWith({ sort: { createdAt: "desc" } });
  });
});
