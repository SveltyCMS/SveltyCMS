/**
 * @file tests/unit/config/widgets-api.test.ts
 * @description Unit tests for extensions widgets browser API client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listWidgets,
  setWidgetStatus,
  uninstallWidget,
  unwrapWidgetList,
} from "../../../src/routes/(app)/config/extensions/widgets-api";
import { stubDocumentCookie, unstubAllGlobals } from "../helpers/stub-global";

vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: { DEFAULT_CONTENT_LANGUAGE: "en" },
}));

describe("widgets-api", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { widgets: [{ name: "input", isActive: true }] } }),
    });
    globalThis.fetch = fetchMock as typeof fetch;
    stubDocumentCookie(() => "csrf_token=widget-csrf");
  });

  afterEach(() => {
    unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("unwrapWidgetList handles envelopes", () => {
    expect(unwrapWidgetList({ success: false })).toEqual([]);
    expect(
      unwrapWidgetList({
        success: true,
        data: { widgets: [{ name: "a", isActive: true }] },
      } as any),
    ).toHaveLength(1);
  });

  it("listWidgets is GET without CSRF", async () => {
    await listWidgets();
    expect(fetchMock.mock.calls[0][1]?.headers?.["X-CSRF-Token"]).toBeUndefined();
  });

  it("setWidgetStatus posts with CSRF", async () => {
    await setWidgetStatus("input", false, "tenant-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/widgets/status",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-CSRF-Token": "widget-csrf",
          "X-Tenant-ID": "tenant-1",
        }),
      }),
    );
  });

  it("uninstallWidget posts with CSRF", async () => {
    await uninstallWidget("custom-widget");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/widgets/uninstall",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "widget-csrf" }),
      }),
    );
  });
});
