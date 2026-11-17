/**
 * @file tests/unit/api/config-handler.test.ts
 * @description Unit tests for handleConfigRoutes (`/api/config/*`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@src/content/types";

const { mockGetStatus, mockPerformExport, mockPerformImport, mockListExports } = vi.hoisted(() => ({
  mockGetStatus: vi.fn(),
  mockPerformExport: vi.fn(),
  mockPerformImport: vi.fn(),
  mockListExports: vi.fn(),
}));

vi.mock("@src/services/core/config-service", () => ({
  configService: {
    getStatus: mockGetStatus,
    performExport: mockPerformExport,
    performImport: mockPerformImport,
    listExports: mockListExports,
  },
}));

vi.mock("@src/services/background/automation/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

import { handleConfigRoutes } from "@src/routes/api/[...path]/handlers/config";

function makeEvent(method: string, url = "http://localhost/api/config", body?: unknown) {
  return {
    request: new Request(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
    locals: { user: { _id: "admin-1" }, isAdmin: true },
  } as any;
}

describe("handleConfigRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStatus.mockResolvedValue({
      status: "changes_detected",
      changes: {
        new: [{ uuid: "c1", type: "collection", name: "posts" }],
        updated: [{ uuid: "c2", type: "collection", name: "pages" }],
        deleted: [{ uuid: "c3", type: "collection", name: "legacy" }],
      },
      unmetRequirements: [],
    });
    mockPerformImport.mockResolvedValue(undefined);
    mockPerformExport.mockResolvedValue({ dirPath: "config/sync/export_t1_123" });
    mockListExports.mockResolvedValue([
      {
        dirName: "export_t1_123",
        dirPath: "config/sync/export_t1_123",
        createdAt: "2026-11-17T10:00:00.000Z",
        adapter: "sqlite",
        tenantId: "t1",
        resources: { collections: 2 },
        totalResources: 2,
      },
    ]);
  });

  it("raises 501 for GET /api/config/history (unimplemented operation history)", async () => {
    const event = makeEvent("GET", "http://localhost/api/config/history");

    try {
      await handleConfigRoutes(event, {} as any, "tenant-1" as DatabaseId, ["config", "history"]);
      expect.unreachable("Should have thrown 501");
    } catch (err: any) {
      expect(err.status).toBe(501);
      expect(err.message).toBe("Operation history is not yet persisted.");
      expect(err.code).toBe("NOT_IMPLEMENTED");
    }
  });

  it("raises 404 for unknown config actions", async () => {
    const event = makeEvent("GET", "http://localhost/api/config/unknown");

    try {
      await handleConfigRoutes(event, {} as any, "tenant-1" as DatabaseId, ["config", "unknown"]);
      expect.unreachable("Should have thrown 404");
    } catch (err: any) {
      expect(err.status).toBe(404);
      expect(err.code).toBe("NOT_FOUND");
    }
  });

  it("GET /api/config/exports lists snapshots via configService.listExports", async () => {
    const res = await handleConfigRoutes(
      makeEvent("GET", "http://localhost/api/config/exports"),
      {} as any,
      "t1" as DatabaseId,
      ["config", "exports"],
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.exports).toHaveLength(1);
    expect(mockListExports).toHaveBeenCalledWith("t1");
  });

  it("POST /api/config/plan filters operations according to safety mode", async () => {
    const addRes = await handleConfigRoutes(
      makeEvent("POST", "http://localhost/api/config/plan", { mode: "add" }),
      {} as any,
      "t1" as DatabaseId,
      ["config", "plan"],
    );
    const addPlan = (await addRes.json()).data;
    expect(addPlan.mode).toBe("add");
    expect(addPlan.operations.map((o: { action: string }) => o.action)).toEqual(["create"]);
    expect(addPlan.requiresConfirmation).toBe(false);

    const mergeRes = await handleConfigRoutes(
      makeEvent("POST", "http://localhost/api/config/plan", { mode: "merge" }),
      {} as any,
      "t1" as DatabaseId,
      ["config", "plan"],
    );
    const mergePlan = (await mergeRes.json()).data;
    expect(mergePlan.mode).toBe("merge");
    expect(mergePlan.operations.map((o: { action: string }) => o.action)).toEqual([
      "create",
      "update",
    ]);
    expect(mergePlan.requiresConfirmation).toBe(false);
  });

  it("POST /api/config/apply gates destructive plans on confirmed=true and forwards mode", async () => {
    const planRes = await handleConfigRoutes(
      makeEvent("POST", "http://localhost/api/config/plan", { mode: "mirror" }),
      {} as any,
      "t1" as DatabaseId,
      ["config", "plan"],
    );
    const plan = (await planRes.json()).data;
    expect(plan.requiresConfirmation).toBe(true);

    await expect(
      handleConfigRoutes(
        makeEvent("POST", "http://localhost/api/config/apply", { planId: plan.planId }),
        {} as any,
        "t1" as DatabaseId,
        ["config", "apply"],
      ),
    ).rejects.toMatchObject({ status: 400, code: "CONFIRMATION_REQUIRED" });

    const applyRes = await handleConfigRoutes(
      makeEvent("POST", "http://localhost/api/config/apply", {
        planId: plan.planId,
        confirmed: true,
      }),
      {} as any,
      "t1" as DatabaseId,
      ["config", "apply"],
    );
    expect(applyRes.status).toBe(200);
    expect(mockPerformImport).toHaveBeenCalledWith({ tenantId: "t1", mode: "mirror" });
  });
});
