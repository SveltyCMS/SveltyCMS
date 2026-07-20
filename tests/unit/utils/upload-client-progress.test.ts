/**
 * @file tests/unit/utils/upload-client-progress.test.ts
 * @description Unit tests for sequential multi-file progress helpers.
 *
 * XMLHttpRequest is stubbed so tests run under jsdom/Vitest without a real network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MockXHR {
  static instances: MockXHR[] = [];
  upload = { addEventListener: vi.fn() };
  status = 200;
  responseText = "{}";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = vi.fn();
  send = vi.fn(() => {
    // Auto-succeed after open/send so sequential batch can complete
    queueMicrotask(() => this.onload?.());
  });
  abort = vi.fn(() => this.onabort?.());
  setRequestHeader = vi.fn();

  constructor() {
    MockXHR.instances.push(this);
  }
}

describe("uploadMediaFilesHandle sequential progress", () => {
  const OriginalXHR = globalThis.XMLHttpRequest;

  beforeEach(() => {
    MockXHR.instances = [];
    // @ts-expect-error test stub
    globalThis.XMLHttpRequest = MockXHR as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = OriginalXHR;
  });

  it("reports per-file progress for multi-file sequential upload", async () => {
    const { uploadMediaFilesHandle } = await import("@utils/media/upload-client");

    const files = [
      new File([new Uint8Array(100)], "a.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array(100)], "b.jpg", { type: "image/jpeg" }),
    ];

    const fileEvents: string[] = [];
    const percents: number[] = [];

    const handle = uploadMediaFilesHandle(files, {
      formActionUrl: "?/upload",
      sequential: true,
      onProgress: (p) => percents.push(p),
      onFileProgress: (fp) => {
        fileEvents.push(`${fp.fileIndex}:${fp.fileName}:${fp.filePercent}`);
      },
    });

    const result = await handle.promise;
    expect(result.success).toBe(true);
    expect(result.files).toHaveLength(2);
    expect(fileEvents.some((e) => e.includes("a.jpg"))).toBe(true);
    expect(fileEvents.some((e) => e.includes("b.jpg"))).toBe(true);
    expect(percents.length).toBeGreaterThan(0);
  });

  it("aborts sequential batch via cancel()", async () => {
    const { uploadMediaFilesHandle } = await import("@utils/media/upload-client");

    // Hang first XHR until abort
    MockXHR.prototype.send = vi.fn(function (this: MockXHR) {
      /* never auto-complete */
    }) as any;

    const files = [
      new File([new Uint8Array(10)], "slow.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array(10)], "never.jpg", { type: "image/jpeg" }),
    ];

    const handle = uploadMediaFilesHandle(files, {
      formActionUrl: "?/upload",
      sequential: true,
    });

    queueMicrotask(() => handle.cancel());
    const result = await handle.promise;
    expect(result.aborted || result.success === false).toBe(true);
  });
});
