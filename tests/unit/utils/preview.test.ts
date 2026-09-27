/**
 * @vitest-environment jsdom
 * @file tests/unit/utils/preview.test.ts
 * @description Unit tests for the Live Preview listener utility
 *
 * Tests:
 * - Message listener registration and teardown (same handler reference)
 * - Readiness signal to the parent frame
 * - onUpdate forwarding, `svelty:` prefix filtering, origin allowlisting
 * - visualEditing: style injection, click delegation, listener teardown
 * - Field select: smooth scroll plus the 2s highlight removal, CSS.escape hardening
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createLivePreviewListener } from "@src/utils/preview";

const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
const originalAddEventListener = window.addEventListener;
const originalRemoveEventListener = window.removeEventListener;

let addEventListenerMock: Mock;
let removeEventListenerMock: Mock;
/** Handler the listener registered for "message", captured from addEventListener. */
let messageHandler: ((event: MessageEvent) => void) | null = null;

/**
 * jsdom reports `window.parent === window`, so the readiness signal is skipped.
 * A distinct parent object is required to observe it.
 */
function useParentFrame(): Mock {
  const postMessage = vi.fn();
  Object.defineProperty(window, "parent", { value: { postMessage }, configurable: true });
  return postMessage;
}

function dispatchMessage(
  data: unknown,
  origin = "http://localhost:5173",
  fieldName?: string,
): void {
  if (!messageHandler) throw new Error("listener did not register a message handler");
  messageHandler({
    data,
    origin,
    ...(fieldName === undefined ? {} : { fieldName }),
  } as unknown as MessageEvent);
}

/** Clicks bubble to the document-level capture listener the utility installs. */
function click(element: Element): boolean {
  return element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("LivePreview Utility", () => {
  beforeEach(() => {
    messageHandler = null;
    addEventListenerMock = vi.fn((event: string, cb: unknown) => {
      if (event === "message") messageHandler = cb as (event: MessageEvent) => void;
    });
    removeEventListenerMock = vi.fn();
    window.addEventListener = addEventListenerMock as unknown as typeof window.addEventListener;
    window.removeEventListener =
      removeEventListenerMock as unknown as typeof window.removeEventListener;
  });

  afterEach(() => {
    // Restore by assignment, never `delete`: jsdom's window may own these methods
    // directly, and Vitest's own jsdom teardown calls window.removeEventListener.
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    if (parentDescriptor) Object.defineProperty(window, "parent", parentDescriptor);
    document.getElementById("svelty-live-preview-styles")?.remove();
    document.querySelectorAll("[data-svelty-field]").forEach((el) => el.remove());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("registers one message listener and announces readiness to the parent frame", () => {
    const parentPostMessage = useParentFrame();

    const { destroy } = createLivePreviewListener({ onUpdate: vi.fn() });

    expect(addEventListenerMock).toHaveBeenCalledTimes(1);
    expect(addEventListenerMock).toHaveBeenCalledWith("message", messageHandler);
    expect(parentPostMessage).toHaveBeenCalledWith({ type: "svelty:init", version: "1.2.0" }, "*");

    destroy();
    // The exact same reference must be removed — a fresh closure would leak the listener.
    expect(removeEventListenerMock).toHaveBeenCalledWith("message", messageHandler);
  });

  it("forwards svelty:update payloads to onUpdate", () => {
    useParentFrame();
    const onUpdate = vi.fn();
    createLivePreviewListener({ onUpdate });

    dispatchMessage({ type: "svelty:update", data: { title: "New Title" } });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ title: "New Title" });
  });

  it("ignores foreign messages and svelty:update without a payload", () => {
    useParentFrame();
    const onUpdate = vi.fn();
    createLivePreviewListener({ onUpdate });

    dispatchMessage({ type: "extension:ping", data: { title: "hijack" } });
    dispatchMessage({ type: "svelty:update" }); // no data payload
    dispatchMessage({ type: "svelty:init", version: "1.2.0" });
    dispatchMessage(null);
    dispatchMessage("svelty:update");

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("drops messages from an origin outside the allowlist but accepts the trusted origin", () => {
    useParentFrame();
    const onUpdate = vi.fn();
    createLivePreviewListener({ onUpdate, origin: "https://trusted.com" });

    dispatchMessage({ type: "svelty:update", data: { ok: false } }, "https://evil.com");
    expect(onUpdate).not.toHaveBeenCalled();

    dispatchMessage({ type: "svelty:update", data: { ok: true } }, "https://trusted.com");
    expect(onUpdate).toHaveBeenCalledWith({ ok: true });
  });

  it("injects the highlight stylesheet once and delegates field clicks under visualEditing", () => {
    const parentPostMessage = useParentFrame();
    const { destroy } = createLivePreviewListener({ onUpdate: vi.fn(), visualEditing: true });

    const style = document.getElementById("svelty-live-preview-styles");
    expect(style?.textContent).toContain(".svelty-field-active");

    // A second listener shares the already-injected stylesheet.
    const second = createLivePreviewListener({ onUpdate: vi.fn(), visualEditing: true });
    expect(document.querySelectorAll("#svelty-live-preview-styles")).toHaveLength(1);

    const field = document.createElement("div");
    field.setAttribute("data-svelty-field", "title");
    const child = document.createElement("span");
    field.appendChild(child);
    document.body.appendChild(field);

    // A decorated field intercepts the click (preventDefault) and reports it upward.
    expect(click(child)).toBe(false);
    expect(parentPostMessage).toHaveBeenCalledWith(
      { type: "svelty:field:click", fieldName: "title" },
      "*",
    );

    // Clicks on undecorated elements are left to the page.
    parentPostMessage.mockClear();
    const plain = document.createElement("button");
    document.body.appendChild(plain);
    expect(click(plain)).toBe(true);
    expect(parentPostMessage).not.toHaveBeenCalled();

    destroy();
    second.destroy();
    parentPostMessage.mockClear();
    expect(click(field)).toBe(true); // teardown removed both capture listeners
    expect(parentPostMessage).not.toHaveBeenCalled();

    plain.remove();
  });

  it("scrolls to a selected field, highlights it, then clears the highlight after 2s", () => {
    vi.useFakeTimers();
    useParentFrame();
    createLivePreviewListener({ onUpdate: vi.fn() });

    const field = document.createElement("div");
    field.setAttribute("data-svelty-field", "title");
    const scrollIntoView = vi.fn();
    field.scrollIntoView = scrollIntoView;
    document.body.appendChild(field);

    dispatchMessage({ type: "svelty:field:select", data: {}, fieldName: "title" });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(field.classList.contains("svelty-field-active")).toBe(true);

    vi.advanceTimersByTime(2000);
    expect(field.classList.contains("svelty-field-active")).toBe(false);

    // Field names are host-controlled: quoting must not break the selector or throw.
    expect(() =>
      dispatchMessage({ type: "svelty:field:select", data: {}, fieldName: 'odd"]name' }),
    ).not.toThrow();
    expect(() =>
      dispatchMessage({ type: "svelty:field:select", data: {}, fieldName: "missing-field" }),
    ).not.toThrow();
  });
});
