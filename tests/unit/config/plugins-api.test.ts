/**
 * @file tests/unit/config/plugins-api.test.ts
 * @description Unit tests for extensions plugin toggle API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { togglePlugin } from "../../../src/routes/(app)/config/extensions/plugins-api";
import { stubDocumentCookie, unstubAllGlobals } from "../helpers/stub-global";

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
    stubDocumentCookie(() => "csrf_token=plugin-csrf");
  });

  afterEach(() => {
    unstubAllGlobals();
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

  it("toggle disables a plugin", async () => {
    await togglePlugin("my-plugin", false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plugins/toggle",
      expect.objectContaining({
        body: JSON.stringify({ pluginId: "my-plugin", enabled: false }),
      }),
    );
  });

  it("handles API error response gracefully", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, message: "Server error" }),
    });

    const result = await togglePlugin("demo", true);
    expect(result.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes CSRF token from cookie", async () => {
    stubDocumentCookie(() => "csrf_token=custom-value; other=stuff");
    await togglePlugin("test", true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plugins/toggle",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-CSRF-Token": "custom-value" }),
      }),
    );
  });
});
