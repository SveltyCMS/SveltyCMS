/**
 * @file tests/unit/config/automations-api.test.ts
 * @description Unit tests for automations browser API (CSRF via fetchApi).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  unwrapFlowList,
  listAutomations,
  createAutomation,
  deleteAutomation,
  saveAutomation,
  testAutomation,
} from "../../../src/routes/(app)/config/automations/automations-api";
import { stubDocumentCookie, unstubAllGlobals } from "../helpers/stub-global";

vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: { DEFAULT_CONTENT_LANGUAGE: "en" },
}));

describe("unwrapFlowList", () => {
  it("returns empty on failure", () => {
    expect(unwrapFlowList({ success: false })).toEqual([]);
  });

  it("unwraps data arrays", () => {
    const flows = [{ id: "1", name: "A" }];
    expect(unwrapFlowList({ success: true, data: flows } as any)).toEqual(flows);
  });
});

describe("automations-api mutations attach CSRF", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: "a1" } }),
    });
    globalThis.fetch = fetchMock as typeof fetch;
    stubDocumentCookie(() => "csrf_token=auto-csrf");
  });

  afterEach(() => {
    unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("list is GET without CSRF requirement", async () => {
    await listAutomations();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/automations");
    expect(fetchMock.mock.calls[0][1].headers["X-CSRF-Token"]).toBeUndefined();
  });

  it("create/delete/test attach CSRF", async () => {
    await createAutomation({ name: "X" });
    await deleteAutomation("a1");
    await testAutomation("a1");
    for (const call of fetchMock.mock.calls.slice(0)) {
      const method = call[1].method;
      if (method && method !== "GET") {
        expect(call[1].headers["X-CSRF-Token"]).toBe("auto-csrf");
      }
    }
  });

  it("saveAutomation chooses POST vs PATCH", async () => {
    await saveAutomation({ name: "new" }, true);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    await saveAutomation({ id: "z", name: "edit" }, false);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/automations/z");
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
  });
});
