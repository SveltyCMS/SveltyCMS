/**
 * @file tests/unit/api/graphql-tenant-scope.test.ts
 * @description Cross-tenant scope gate for the GraphQL data-operation resolvers.
 *
 * WHY: the REST routes reject a `?tenantId=` that differs from the session tenant for
 * everyone but a super-admin (handlers/system/system-shared.ts:68-83). The GraphQL
 * resolvers resolved `args.tenantId ?? tid`, so `contentExportRun(tenantId: "other")`
 * ran against another tenant for any authenticated user — `contentExportRun` checked
 * only `ctx.user`, not even `isAdmin`. These tests pin the gate so the two surfaces
 * cannot drift apart again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  runExport: vi.fn(),
  multiTenant: { enabled: true },
}));

vi.mock("@src/services/core/config-service", () => ({
  configService: { getStatus: mocks.getStatus },
}));
vi.mock("@src/services/core/content-package-service", () => ({
  contentPackageService: { runExport: mocks.runExport, validateExport: vi.fn() },
}));
vi.mock("@utils/tenant-isolation.server", () => ({
  isMultiTenantEnabled: () => mocks.multiTenant.enabled,
}));

import {
  dataOperationsQueryResolvers,
  dataOperationsMutationResolvers,
} from "@src/routes/api/graphql/resolvers/data-operations";

const adapter = {} as never;
const cleanStatus = {
  status: "clean",
  changes: { new: 0, updated: 0, deleted: 0 },
  unmetRequirements: [],
};

const adminCtx = { user: { _id: "u1", isAdmin: true, role: "admin" } };
const superCtx = { user: { _id: "root", isAdmin: true, role: "super-admin" } };
const editorCtx = { user: { _id: "u2", isAdmin: false, role: "editor" } };

beforeEach(() => {
  mocks.getStatus.mockReset().mockResolvedValue(cleanStatus);
  mocks.runExport.mockReset().mockResolvedValue({ manifest: { resources: {} }, collections: {} });
  mocks.multiTenant.enabled = true;
});

describe("GraphQL data operations — tenant scope", () => {
  it("rejects a foreign tenantId for a tenant admin (query path)", async () => {
    const q = dataOperationsQueryResolvers(adapter, "tenant-a");
    await expect(q.configStatus({}, { tenantId: "tenant-b" }, adminCtx as never)).rejects.toThrow(
      /Cannot access other tenants/,
    );
    expect(mocks.getStatus).not.toHaveBeenCalled();
  });

  it("rejects a foreign tenantId for a plain user on contentExportRun (was the open hole)", async () => {
    const m = dataOperationsMutationResolvers(adapter, "tenant-a");
    await expect(
      m.contentExportRun(
        {},
        { collections: ["Articles"], tenantId: "tenant-b" },
        editorCtx as never,
      ),
    ).rejects.toThrow(/Cannot access other tenants/);
    expect(mocks.runExport).not.toHaveBeenCalled();
  });

  it("allows a foreign tenantId for a super-admin", async () => {
    const q = dataOperationsQueryResolvers(adapter, "tenant-a");
    await q.configStatus({}, { tenantId: "tenant-b" }, superCtx as never);
    expect(mocks.getStatus).toHaveBeenCalledWith("tenant-b");
  });

  it("falls back to the session tenant when no argument is given", async () => {
    const q = dataOperationsQueryResolvers(adapter, "tenant-a");
    await q.configStatus({}, {}, adminCtx as never);
    expect(mocks.getStatus).toHaveBeenCalledWith("tenant-a");
  });

  it("accepts an explicit tenantId that equals the session tenant", async () => {
    const m = dataOperationsMutationResolvers(adapter, "tenant-a");
    await m.contentExportRun(
      {},
      { collections: ["Articles"], tenantId: "tenant-a" },
      editorCtx as never,
    );
    expect(mocks.runExport).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a" }));
  });

  it("fails closed when a multi-tenant deployment has no session tenant", async () => {
    const q = dataOperationsQueryResolvers(adapter, undefined);
    await expect(q.configStatus({}, { tenantId: "tenant-b" }, adminCtx as never)).rejects.toThrow(
      /Tenant context required/,
    );
  });

  it("keeps single-tenant behaviour unchanged", async () => {
    mocks.multiTenant.enabled = false;
    const q = dataOperationsQueryResolvers(adapter, undefined);
    await q.configStatus({}, { tenantId: "tenant-b" }, adminCtx as never);
    expect(mocks.getStatus).toHaveBeenCalledWith("tenant-b");
  });
});
