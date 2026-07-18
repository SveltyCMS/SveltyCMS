/**
 * @file tests/unit/config/website-tokens-api.test.ts
 * @description Unit tests for website-tokens browser API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createWebsiteToken,
  deleteWebsiteTokenById,
  listWebsiteTokens,
  unwrapWebsiteTokensList,
  bulkDeleteWebsiteTokens,
} from "../../../src/routes/(app)/config/access-management/website-tokens-api";

vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: { DEFAULT_CONTENT_LANGUAGE: "en" },
}));

describe("website-tokens-api", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    });
    globalThis.fetch = fetchMock as typeof fetch;
    vi.stubGlobal("document", {
      get cookie() {
        return "csrf_token=token-csrf";
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("unwrapWebsiteTokensList handles success/failure", () => {
    expect(unwrapWebsiteTokensList({ success: false })).toEqual({
      items: [],
      totalItems: 0,
    });
    expect(
      unwrapWebsiteTokensList({
        success: true,
        data: [{ _id: "1" }],
        pagination: { totalItems: 5 },
      } as any),
    ).toEqual({ items: [{ _id: "1" }], totalItems: 5 });
  });

  it("listWebsiteTokens is GET without CSRF", async () => {
    await listWebsiteTokens(new URLSearchParams({ page: "1" }));
    expect(fetchMock.mock.calls[0][1]?.headers?.["X-CSRF-Token"]).toBeUndefined();
  });

  it("createWebsiteToken posts with CSRF", async () => {
    await createWebsiteToken({
      name: "ci",
      permissions: [],
      expiresAt: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/website-tokens",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "token-csrf" }),
      }),
    );
  });

  it("deleteWebsiteTokenById is DELETE with CSRF", async () => {
    await deleteWebsiteTokenById("tok-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/website-tokens/tok-1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-CSRF-Token": "token-csrf" }),
      }),
    );
  });

  it("bulkDeleteWebsiteTokens deletes each id", async () => {
    const { successCount } = await bulkDeleteWebsiteTokens(["a", "b"]);
    expect(successCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
