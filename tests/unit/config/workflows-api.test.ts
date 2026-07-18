/**
 * @file tests/unit/config/workflows-api.test.ts
 * @description Unit tests for workflow builder browser API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listWorkflowCollections,
  loadWorkflow,
  saveWorkflowDefinition,
} from "../../../src/routes/(app)/config/workflows/workflows-api";

vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: { DEFAULT_CONTENT_LANGUAGE: "en" },
}));

describe("workflows-api mutations attach CSRF", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { _id: "wf1", states: [], transitions: [] } }),
    });
    globalThis.fetch = fetchMock as typeof fetch;
    vi.stubGlobal("document", {
      get cookie() {
        return "csrf_token=wf-csrf";
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("listWorkflowCollections is GET without CSRF", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [{ _id: "c1", name: "Posts" }] }),
    });
    const cols = await listWorkflowCollections();
    expect(cols).toHaveLength(1);
    expect(fetchMock.mock.calls[0][1]?.headers?.["X-CSRF-Token"]).toBeUndefined();
  });

  it("loadWorkflow is GET", async () => {
    await loadWorkflow("posts");
    expect(fetchMock.mock.calls[0][0]).toContain("/api/workflows?collectionId=posts");
    expect(fetchMock.mock.calls[0][1]?.headers?.["X-CSRF-Token"]).toBeUndefined();
  });

  it("saveWorkflowDefinition posts with CSRF", async () => {
    await saveWorkflowDefinition({
      collectionId: "posts",
      states: [],
      transitions: [],
    } as any);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/workflows",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "wf-csrf" }),
      }),
    );
  });
});
