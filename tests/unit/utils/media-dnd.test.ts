/**
 * @file tests/unit/utils/media-dnd.test.ts
 * @description Unit tests for media drag-and-drop payload helpers.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MEDIA_DND_MIME,
  beginMediaDrag,
  getMediaDragPayload,
  hasMediaDrag,
  moveMediaToFolder,
  parseMediaDragPayload,
  resolveMediaDragIds,
  serializeMediaDragPayload,
} from "@utils/media/media-dnd";

describe("media-dnd", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("serializes unique non-empty ids", () => {
    const raw = serializeMediaDragPayload(["a", "b", "a", "", "c"]);
    expect(JSON.parse(raw)).toEqual({ ids: ["a", "b", "c"] });
  });

  it("parses valid payload", () => {
    expect(parseMediaDragPayload(serializeMediaDragPayload(["x", "y"]))).toEqual({
      ids: ["x", "y"],
    });
  });

  it("returns null for invalid payloads", () => {
    expect(parseMediaDragPayload(null)).toBeNull();
    expect(parseMediaDragPayload("")).toBeNull();
    expect(parseMediaDragPayload("{not-json")).toBeNull();
    expect(parseMediaDragPayload(JSON.stringify({ ids: [] }))).toBeNull();
    expect(parseMediaDragPayload(JSON.stringify({ ids: [1, 2] }))).toBeNull();
  });

  it("detects mime type on DataTransfer.types", () => {
    const dt = {
      types: [MEDIA_DND_MIME, "text/plain"],
      getData: (type: string) =>
        type === MEDIA_DND_MIME ? serializeMediaDragPayload(["id-1"]) : "",
    } as unknown as DataTransfer;

    expect(hasMediaDrag(dt)).toBe(true);
    expect(hasMediaDrag(null)).toBe(false);
    expect(getMediaDragPayload(dt)).toEqual({ ids: ["id-1"] });
  });

  it("moveMediaToFolder posts and returns moved count", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { movedCount: 2, fileIds: ["a", "b"], targetFolderId: "folder-1" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

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

  it("beginMediaDrag writes the multi-id payload", () => {
    const store = new Map<string, string>();
    const dt = {
      effectAllowed: "none",
      setData: (type: string, value: string) => {
        store.set(type, value);
      },
      setDragImage: () => {},
    } as unknown as DataTransfer;

    const ids = beginMediaDrag(dt, ["x", "y", "x"]);
    expect(ids).toEqual(["x", "y"]);
    expect(store.get(MEDIA_DND_MIME)).toBe(serializeMediaDragPayload(["x", "y"]));
    expect(dt.effectAllowed).toBe("move");
  });
});
