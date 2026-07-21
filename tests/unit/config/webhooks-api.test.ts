/**
 * @file tests/unit/config/webhooks-api.test.ts
 * @description Unit tests for webhooks browser API client (reference Testing 2026).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  unwrapWebhookList,
  listWebhooks,
  createWebhook,
  deleteWebhook,
  saveWebhook,
  testWebhookDelivery,
} from "../../../src/routes/(app)/config/webhooks/webhooks-api";
import { stubDocumentCookie, unstubAllGlobals } from "../helpers/stub-global";

vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: { DEFAULT_CONTENT_LANGUAGE: "en" },
}));

describe("unwrapWebhookList", () => {
  it("returns empty on failure", () => {
    expect(unwrapWebhookList({ success: false, message: "no" })).toEqual([]);
  });

  it("unwraps data array", () => {
    const list = [{ id: "1", name: "A", url: "https://x", events: [], active: true }];
    expect(unwrapWebhookList({ success: true, data: list } as any)).toEqual(list);
  });
});

describe("webhooks-api + fetchApi CSRF", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    stubDocumentCookie(() => "csrf_token=unit-csrf-token");
  });

  afterEach(() => {
    unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("listWebhooks uses GET without requiring CSRF", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    });
    await listWebhooks();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks",
      expect.objectContaining({
        method: "GET",
        headers: expect.not.objectContaining({ "X-CSRF-Token": expect.anything() }),
      }),
    );
  });

  it("createWebhook POSTs with CSRF from cookie", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: { id: "w1" } }),
    });
    await createWebhook({ name: "N", url: "https://ex.com", events: ["entry:publish"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-CSRF-Token": "unit-csrf-token",
        }),
      }),
    );
  });

  it("deleteWebhook and testWebhookDelivery attach CSRF", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await deleteWebhook("w1");
    await testWebhookDelivery("w1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/w1",
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-CSRF-Token": "unit-csrf-token" }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/webhooks/w1/test",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-CSRF-Token": "unit-csrf-token" }),
      }),
    );
  });

  it("saveWebhook routes to create vs update", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    await saveWebhook({ name: "A", url: "https://a.com", events: [] });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/webhooks");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");

    await saveWebhook({ id: "x", name: "B", url: "https://b.com", events: [] });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/webhooks/x");
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
  });
});
