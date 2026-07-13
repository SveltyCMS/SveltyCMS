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
    type: "failure",
    status,
    data,
  })),
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
});
