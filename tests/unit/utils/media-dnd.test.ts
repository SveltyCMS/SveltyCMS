/**
 * @file tests/unit/utils/media-dnd.test.ts
 * @description Unit tests for media drag-and-drop helpers.
 *
 * Compatible with both Vitest and bun:test (via vitest shim) — avoid vi.stubGlobal.
 * Drag transport itself (dragData in-memory via @thisux/sveltednd's dndState) is
 * exercised by the mediagallery e2e suite, not here.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { moveMediaToFolder, resolveMediaDragIds } from "@utils/media/media-dnd";

describe("media-dnd", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("moveMediaToFolder posts and returns moved count", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { movedCount: 2, fileIds: ["a", "b"], targetFolderId: "folder-1" },
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await moveMediaToFolder(["a", "b"], "folder-1", { csrfToken: "tok" });

    expect(result).toEqual({
      movedCount: 2,
      fileIds: ["a", "b"],
      targetFolderId: "folder-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/media/move",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "tok" }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ fileIds: ["a", "b"], targetFolderId: "folder-1" });
  });

  it("moveMediaToFolder rejects empty ids", async () => {
    await expect(moveMediaToFolder([], null)).rejects.toThrow("No media to move");
  });

  it("resolveMediaDragIds uses full selection when dragged id is selected", () => {
    expect(resolveMediaDragIds("b", ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(resolveMediaDragIds("z", ["a", "b"])).toEqual(["z"]);
    expect(resolveMediaDragIds("solo", [])).toEqual(["solo"]);
  });
});
