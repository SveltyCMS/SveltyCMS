/**
 * @file tests/unit/utils/upload-client-tus-routing.test.ts
 * @description Resumable-lane routing: 6–15 MiB files use TUS, smaller files
 * keep the legacy form path, and the client reports progress/cancel through the
 * existing handle contract.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@utils/media/tus-upload-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@utils/media/tus-upload-client")>();
  return {
    ...actual,
    uploadFileViaTus: vi.fn(async (_file: File, options: { onProgress?: (p: number) => void }) => {
      options.onProgress?.(100);
      return { success: true, mediaId: "media-tus-1" };
    }),
  };
});

const { uploadMediaFilesHandle } = await import("@utils/media/upload-client");
const { uploadFileViaTus } = await import("@utils/media/tus-upload-client");

function fakeFile(name: string, size: number, type = "image/png"): File {
  return {
    name,
    size,
    type,
    lastModified: 1_700_000_000_000,
  } as unknown as File;
}

describe("uploadMediaFilesHandle — resumable routing", () => {
  it("routes a 7 MiB file through TUS", async () => {
    const file = fakeFile("hero.png", 7 * 1024 * 1024);
    const percents: number[] = [];
    const handle = uploadMediaFilesHandle([file], {
      formActionUrl: "?/upload",
      onProgress: (percent) => percents.push(percent),
    });

    const result = await handle.promise;
    expect(result.success).toBe(true);
    expect(uploadFileViaTus).toHaveBeenCalledTimes(1);
    expect(percents.at(-1)).toBe(100);
  });

  it("only claims the 6–15 MiB window", async () => {
    const { shouldUseTusUpload } = await import("@utils/media/tus-upload-client");
    expect(shouldUseTusUpload(fakeFile("a.png", 5 * 1024 * 1024))).toBe(false);
    expect(shouldUseTusUpload(fakeFile("b.png", 6 * 1024 * 1024))).toBe(true);
    expect(shouldUseTusUpload(fakeFile("c.png", 15 * 1024 * 1024))).toBe(true);
    expect(shouldUseTusUpload(fakeFile("d.png", 15 * 1024 * 1024 + 1))).toBe(false);
  });

  it("does not route when resumable is disabled", async () => {
    class SilentXhr {
      upload = { addEventListener() {} };
      open() {}
      send() {}
      abort() {}
      status = 0;
      responseText = "";
    }
    vi.stubGlobal("XMLHttpRequest", SilentXhr);
    try {
      const before = (uploadFileViaTus as unknown as { mock: { calls: unknown[] } }).mock.calls
        .length;
      const handle = uploadMediaFilesHandle([fakeFile("big.png", 7 * 1024 * 1024)], {
        formActionUrl: "?/upload",
        resumable: false,
        signal: AbortSignal.abort(),
      });
      const result = await handle.promise;
      expect(result.success).toBe(false);
      expect(
        (uploadFileViaTus as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
      ).toBe(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
