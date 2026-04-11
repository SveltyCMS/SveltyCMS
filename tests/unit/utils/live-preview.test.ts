/**
 * @file tests/unit/utils/livePreview.test.ts
 * @description Unit tests for the Live Preview listener utility
 *
 * Tests:
 * - Message listener registration
 * - Readiness signal
 * - onUpdate callback invocation
 * - Origin validation
 * - Cleanup
 */

import { createLivePreviewListener } from "@src/utils/use-live-preview";

describe("LivePreview Utility", () => {
  let mockOnUpdate: any;

  beforeEach(() => {
    mockOnUpdate = mock(() => {});

    // Spy/Mock individual properties instead of replacing window
    (window as any).addEventListener = mock((_event, _cb) => {});
    (window as any).removeEventListener = mock((_event, _cb) => {});

    // window.parent is often readonly, but we try to mock postMessage on it
    const mockPostMessage = mock((_msg, _origin) => {});

    // If window.parent is window (which it is in Bun), we mock window.postMessage
    (window as any).postMessage = mockPostMessage;
  });

  it("should register a message listener and signal readiness", () => {
    // Mock window.parent to be different from window to trigger the init message
    const originalParentObj = window.parent;
    const mockPostMessage = mock();
    Object.defineProperty(window, "parent", {
      value: { postMessage: mockPostMessage },
      configurable: true,
    });

    const { destroy } = createLivePreviewListener({ onUpdate: mockOnUpdate });

    expect(window.addEventListener).toHaveBeenCalledWith("message", expect.any(Function));
    expect(mockPostMessage).toHaveBeenCalledWith({ type: "svelty:init" }, "*");

    destroy();
    expect(window.removeEventListener).toHaveBeenCalledWith("message", expect.any(Function));

    // Restore
    Object.defineProperty(window, "parent", {
      value: originalParentObj,
      configurable: true,
    });
  });

  it("should call onUpdate when a valid message is received", () => {
    let messageHandler: any;
    (window as any).addEventListener = mock((event, cb) => {
      if (event === "message") {
        messageHandler = cb;
      }
    });

    createLivePreviewListener({ onUpdate: mockOnUpdate });

    // Simulate valid message
    const mockEvent = {
      data: {
        type: "svelty:update",
        data: { title: "New Title" },
      },
      origin: "http://localhost:5173",
    };

    messageHandler(mockEvent);
    expect(mockOnUpdate).toHaveBeenCalledWith({ title: "New Title" });
  });

  it("should validate origin if specified", () => {
    let messageHandler: any;
    (window as any).addEventListener = mock((event, cb) => {
      if (event === "message") {
        messageHandler = cb;
      }
    });

    createLivePreviewListener({
      onUpdate: mockOnUpdate,
      origin: "https://trusted.com",
    });

    // Simulate message from untrusted origin
    messageHandler({
      data: { type: "svelty:update", data: {} },
      origin: "https://evil.com",
    });
    expect(mockOnUpdate).not.toHaveBeenCalled();

    // Simulate message from trusted origin
    messageHandler({
      data: { type: "svelty:update", data: { ok: true } },
      origin: "https://trusted.com",
    });
    expect(mockOnUpdate).toHaveBeenCalledWith({ ok: true });
  });
});
