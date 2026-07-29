/**
 * @file tests/unit/config/trash-api.test.ts
 * @description Unit tests for trash browser API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  unwrapTrashList,
  listTrash,
  restoreTrashItem,
} from "../../../src/routes/(app)/config/trash/trash-api";
import { stubDocumentCookie, unstubAllGlobals } from "../helpers/stub-global";

vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: { DEFAULT_CONTENT_LANGUAGE: "en" },
}));

describe("trash-api", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    stubDocumentCookie(() => "csrf_token=trash-csrf");
  });

  afterEach(() => {
    unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("unwrapTrashList handles success/failure", () => {
    expect(unwrapTrashList({ success: false })).toEqual([]);
    expect(unwrapTrashList({ success: true, data: [{ _id: "1" }] } as any)).toHaveLength(1);
  });

  it("restore posts with CSRF", async () => {
    await restoreTrashItem("posts", "e1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/trash/restore",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "trash-csrf" }),
      }),
    );
  });

  it("listTrash is GET", async () => {
    await listTrash();
    expect(fetchMock.mock.calls[0][1].headers["X-CSRF-Token"]).toBeUndefined();
  });
});
