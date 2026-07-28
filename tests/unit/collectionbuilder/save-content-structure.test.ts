/**
 * @file tests/unit/collectionbuilder/save-content-structure.test.ts
 * @description Unit tests for Collection Builder saveContentStructure server action.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeGuiStructureSave = vi.fn();

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
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@src/routes/(app)/config/collectionbuilder/collectionbuilder-local.server", () => ({
  executeGuiStructureSave,
  getCollectionBuilderCms: vi.fn(),
  serializeStructureNodes: vi.fn((nodes: unknown[]) => nodes),
}));

function makeEvent(tenantId: string | null = "global"): RequestEvent {
  return {
    locals: {
      tenantId,
      roles: ["admin"],
      isAdmin: true,
    },
  } as unknown as RequestEvent;
}

describe("saveContentStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeGuiStructureSave.mockResolvedValue({
      success: true,
      contentStructure: [
        {
          _id: "cat-1",
          name: "Blog",
          path: "/blog",
          nodeType: "category",
          source: "builder",
        },
        {
          _id: "posts",
          name: "Posts",
          path: "/collection/posts",
          nodeType: "collection",
          parentId: "cat-1",
        },
      ],
    });
  });

  it("delegates to executeGuiStructureSave (LocalCMS gui-save path)", async () => {
    const { saveContentStructure } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    const result = await saveContentStructure(makeEvent(), [
      {
        type: "create",
        node: { _id: "cat-1", name: "Blog", path: "/blog", nodeType: "category" },
      },
      {
        type: "move",
        node: {
          _id: "posts",
          name: "Posts",
          path: "/collection/posts",
          nodeType: "collection",
          parentId: "cat-1",
        },
      },
    ]);

    expect(executeGuiStructureSave).toHaveBeenCalledWith("global", expect.any(Array));
    expect(result).toMatchObject({ success: true });
    expect((result as { contentStructure?: unknown[] }).contentStructure).toHaveLength(2);
  });

  it("returns fail when operations payload is invalid", async () => {
    const { saveContentStructure } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    const result = await saveContentStructure(makeEvent(), null as never);

    expect(result).toMatchObject({ status: 400, data: { message: "Invalid operations" } });
    expect(executeGuiStructureSave).not.toHaveBeenCalled();
  });

  it("handles empty operations array gracefully", async () => {
    executeGuiStructureSave.mockResolvedValue({
      success: true,
      contentStructure: [],
    });

    const { saveContentStructure } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    const result = await saveContentStructure(makeEvent(), []);
    expect(executeGuiStructureSave).toHaveBeenCalled();
    expect((result as { contentStructure?: unknown[] }).contentStructure).toHaveLength(0);
  });

  it("passes tenantId from event to executeGuiStructureSave", async () => {
    const { saveContentStructure } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    await saveContentStructure(makeEvent("tenant-xyz"), [
      {
        type: "create",
        node: { _id: "cat-1", name: "Test", path: "/test", nodeType: "category" },
      },
    ]);

    expect(executeGuiStructureSave).toHaveBeenCalledWith("tenant-xyz", expect.any(Array));
  });

  it("propagates executeGuiStructureSave failure", async () => {
    executeGuiStructureSave.mockResolvedValue({
      success: false,
      message: "Structure conflict detected",
    });

    const { saveContentStructure } =
      await import("@src/routes/(app)/config/collectionbuilder/collectionbuilder.server");

    const result = await saveContentStructure(makeEvent(), [
      {
        type: "create",
        node: { _id: "cat-dup", name: "Duplicate", path: "/dup", nodeType: "category" },
      },
    ]);

    expect(result).toMatchObject({ success: false, message: "Structure conflict detected" });
  });
});
