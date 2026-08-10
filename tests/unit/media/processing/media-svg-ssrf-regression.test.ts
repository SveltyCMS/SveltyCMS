/**
 * @file tests/unit/media/processing/media-svg-ssrf-regression.test.ts
 * @description P0/P1 regression tests for GHSA-class media bugs:
 * - SVG always sanitized (never pure-stream unsanitized)
 * - Oversized SVG rejected (MAX_SVG_BYTES)
 * - saveRemoteMedia blocks private/metadata URLs (SSRF)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const uploadMock = vi.fn();
const getByHashMock = vi.fn();
const saveFileMock = vi.fn();
const fileExistsMock = vi.fn();

vi.mock("@src/utils/media/media-storage.server", () => ({
  fileExists: (...args: unknown[]) => fileExistsMock(...args),
  getFile: vi.fn(),
  saveFile: (...args: unknown[]) => saveFileMock(...args),
  saveResizedImages: vi.fn().mockResolvedValue({}),
}));

vi.mock("@src/utils/media/slim-sniffer.server", () => ({
  sniffMimeType: vi.fn().mockReturnValue(null),
}));

// Avoid sharp / image processor side effects
vi.mock("@src/services/media/image-processor", () => ({
  processImageWithPresets: vi.fn().mockResolvedValue([]),
}));

vi.mock("@src/utils/media/media-processing.server", async (importOriginal) => {
  const real = await importOriginal<typeof import("@src/utils/media/media-processing.server")>();
  return {
    ...real,
    hashFileContent: vi.fn(async (buf: Buffer) => {
      // Deterministic short hash from content length + prefix
      const head = buf.subarray(0, 16).toString("hex");
      return `hash_${buf.length}_${head}`;
    }),
    hashStream: vi.fn(async () => "hash_stream"),
  };
});

import { MediaService, MAX_SVG_BYTES } from "@src/utils/media/media-service.server";

function createMockDb() {
  return {
    media: {
      files: {
        getByHash: getByHashMock,
        upload: uploadMock,
        delete: vi.fn(),
      },
    },
    crud: {
      update: vi.fn().mockResolvedValue({ success: true }),
      findOne: vi.fn(),
    },
    registerHook: undefined,
  } as any;
}

describe("MediaService SVG sanitization path (P0)", () => {
  let service: MediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    fileExistsMock.mockResolvedValue(false);
    saveFileMock.mockResolvedValue(undefined);
    // After write, ensureOriginalOnDisk verifies with refresh
    fileExistsMock.mockImplementation(async (_path: string, opts?: { refresh?: boolean }) => {
      return opts?.refresh === true;
    });
    getByHashMock.mockResolvedValue({ success: true, data: null });
    uploadMock.mockImplementation(async (payload: any) => ({
      success: true,
      data: { _id: "m1", ...payload },
    }));
    service = new MediaService(createMockDb());
  });

  it("sanitizes SVG with script before storage", async () => {
    const evil =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="1"/></svg>';
    const file = new File([evil], "evil.svg", { type: "image/svg+xml" });

    const result = await service.saveMedia(file, "user-1", "public", null);

    expect(result.success).toBe(true);
    expect(saveFileMock).toHaveBeenCalled();
    const savedPayload = saveFileMock.mock.calls[0][0];
    const saved = Buffer.isBuffer(savedPayload)
      ? savedPayload.toString("utf-8")
      : String(savedPayload);
    expect(saved).not.toContain("<script");
    expect(saved).not.toContain("alert");
    expect(uploadMock).toHaveBeenCalled();
    const uploadArg = uploadMock.mock.calls[0][0];
    expect(uploadArg.mimeType).toBe("image/svg+xml");
  });

  it("rejects SVG larger than MAX_SVG_BYTES", async () => {
    // Construct metadata size above cap without allocating the full buffer in memory
    const oversize = {
      name: "huge.svg",
      type: "image/svg+xml",
      size: MAX_SVG_BYTES + 1,
      arrayBuffer: async () => new ArrayBuffer(0),
      stream: () =>
        new ReadableStream({
          start(c) {
            c.close();
          },
        }),
    };

    const result = await service.saveMedia(oversize as any, "user-1", "public", null);

    expect(result.success).toBe(false);
    expect(String((result as { success: false; message: string }).message)).toMatch(
      /SVG|sanitiz|MB/i,
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("MediaService.saveRemoteMedia SSRF (P1)", () => {
  let service: MediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    getByHashMock.mockResolvedValue({ success: true, data: null });
    uploadMock.mockResolvedValue({ success: true, data: { _id: "m1" } });
    service = new MediaService(createMockDb());
  });

  it("blocks loopback URL without fetching media", async () => {
    const result = await service.saveRemoteMedia(
      "http://127.0.0.1:9000/internal-proof.txt",
      "user-1",
      "public",
      null,
    );

    expect(result.success).toBe(false);
    expect(String((result as { success: false; message: string }).message)).toMatch(
      /Blocked|private|HTTP not allowed|Failed to fetch/i,
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("blocks cloud metadata IP", async () => {
    const result = await service.saveRemoteMedia(
      "http://169.254.169.254/latest/meta-data/",
      "user-1",
      "public",
      null,
    );

    expect(result.success).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("blocks RFC1918 private host", async () => {
    const result = await service.saveRemoteMedia(
      "https://10.0.0.5/secret",
      "user-1",
      "public",
      null,
    );

    expect(result.success).toBe(false);
    expect(String((result as { success: false; message: string }).message)).toMatch(
      /Blocked|private|Failed to fetch/i,
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
