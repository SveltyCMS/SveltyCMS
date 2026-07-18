/**
 * @file tests/unit/config/plugins-api.test.ts
 * @description Unit tests for extensions plugin toggle API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { togglePlugin } from "../../../src/routes/(app)/config/extensions/plugins-api";

vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: { DEFAULT_CONTENT_LANGUAGE: "en" },
}));

describe("plugins-api", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    globalThis.fetch = fetchMock as typeof fetch;
    vi.stubGlobal("document", {
      get cookie() {
        return "csrf_token=plugin-csrf";
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("POSTs toggle with CSRF", async () => {
    await togglePlugin("demo", true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plugins/toggle",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "plugin-csrf" }),
        body: JSON.stringify({ pluginId: "demo", enabled: true }),
      }),
    );
  });
});
