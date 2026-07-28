/**
 * @file tests/unit/collectionbuilder/delete-content-nodes.test.ts
 * @description Unit tests for Collection Builder deleteContentNodes — LocalCMS contentStructure path.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteByIds = vi.fn();

vi.mock("@sveltejs/kit", () => ({
  error: vi.fn((status: number, message: string) => {
    throw Object.assign(new Error(message), { status });
  }),
  fail: vi.fn((status: number, data: Record<string, unknown>) => ({
    type: "failure" as const,
    status,
    data,
  })),
  redirect: vi.fn(),
  json: vi.fn((data: unknown) => new Response(JSON.stringify(data))),
}));

vi.mock("@src/databases/auth/permissions", () => ({
  hasCollectionBuilderPermission: vi.fn(() => true),
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn(() => ({ _id: "admin-user" })),
}));

vi.mock("@utils/logger", () => ({
  logger: { error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@src/routes/(app)/config/collectionbuilder/collectionbuilder-local.server", () => ({
  getCollectionBuilderCms: vi.fn(async () => ({
    contentStructure: { deleteByIds },
  })),
  executeGuiStructureSave: vi.fn(),
  serializeStructureNodes: vi.fn((nodes: unknown[]) => nodes),
}));

function makeEvent(tenantId: string | null = "global"): RequestEvent {
  return {
    locals: { tenantId, roles: ["admin"], isAdmin: true },
  } as unknown as RequestEvent;
}

describe("deleteContentNodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteByIds.mockResolvedValue({ found: true, paths: ["/temp-cat"] });
  });

  it("delegates deletes through LocalCMS contentStructure.deleteByIds", async () => {
    const { deleteContentNodes } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    const result = await deleteContentNodes(makeEvent(), ["cat-del"]);

    expect(deleteByIds).toHaveBeenCalledWith(["cat-del"], { tenantId: "global" });
    expect(result).toMatchObject({ success: true });
  });

  it("returns 404 when deleteByIds finds no matching paths", async () => {
    deleteByIds.mockResolvedValue({ found: false, paths: [] });

    const { deleteContentNodes } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    const result = await deleteContentNodes(makeEvent(), ["missing-id"]);
    expect(result).toMatchObject({ status: 404, data: { message: "No matching nodes found" } });
  });

  it("returns 400 for null IDs", async () => {
    const { deleteContentNodes } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    const result = await deleteContentNodes(makeEvent(), null as never);
    expect(result).toMatchObject({ status: 400, data: { message: "Invalid IDs" } });
    expect(deleteByIds).not.toHaveBeenCalled();
  });

  it("passes tenantId from event locals to deleteByIds", async () => {
    const { deleteContentNodes } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    await deleteContentNodes(makeEvent("tenant-abc"), ["node-1", "node-2"]);
    expect(deleteByIds).toHaveBeenCalledWith(["node-1", "node-2"], { tenantId: "tenant-abc" });
  });

  it("handles multiple IDs in a single delete call", async () => {
    deleteByIds.mockResolvedValue({ found: true, paths: ["/a", "/b", "/c"] });

    const { deleteContentNodes } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    const result = await deleteContentNodes(makeEvent(), ["id-1", "id-2", "id-3"]);
    expect(deleteByIds).toHaveBeenCalledWith(["id-1", "id-2", "id-3"], { tenantId: "global" });
    expect(result).toMatchObject({ success: true });
  });
});
