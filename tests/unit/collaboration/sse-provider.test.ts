/**
 * @file tests/unit/collaboration/sse-provider.test.ts
 * @description Unit tests for the SseProvider logic.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { SseProvider } from "@src/services/collaboration/sse-provider.svelte";
import * as Y from "yjs";

// Mock browser environment
vi.mock("$app/environment", () => ({
  browser: true,
}));

// Mock tenant-utils
vi.mock("@utils/tenant-utils", () => ({
  encodeYjsToBase64: vi.fn((_arr) => "base64-string"),
  decodeBase64ToYjs: vi.fn((_str) => new Uint8Array([1, 2, 3])),
}));

describe("SseProvider", () => {
  let yDoc: Y.Doc;
  let provider: SseProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock global fetch
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ success: true, stateBase64: "base64" }),
      }),
    ) as any;

    // Mock EventSource
    global.EventSource = class {
      addEventListener = vi.fn();
      close = vi.fn();
      onopen = null;
      onerror = null;
    } as any;

    yDoc = new Y.Doc();
    provider = new SseProvider({
      docId: "test-doc",
      yDoc,
    });
  });

  it("should initialize and fetch initial state", async () => {
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("docId=test-doc"));
  });

  it("should batch rapid local updates", async () => {
    // Simulate 3 rapid updates
    yDoc.getArray("test").insert(0, ["a"]);
    yDoc.getArray("test").insert(1, ["b"]);
    yDoc.getArray("test").insert(2, ["c"]);

    // Fetch should not have been called yet (batched)
    expect(global.fetch).not.toHaveBeenCalledWith("/api/collaboration/yjs", expect.anything());

    // Advance time past 50ms batch window
    vi.advanceTimersByTime(100);

    // Fetch should now be called with the batched update
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/collaboration/yjs",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("should throttle awareness updates", () => {
    const handleAwareness = (provider as any).handleAwarenessUpdate;

    handleAwareness();
    handleAwareness();
    handleAwareness();

    // Should only have one timeout pending
    vi.advanceTimersByTime(150);

    expect(provider.activeUsers).toBeDefined();
  });
});
