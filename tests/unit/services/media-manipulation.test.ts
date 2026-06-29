/**
 * @file tests/unit/services/media-manipulation.test.ts
 * @description Sharp pipeline integration tests for MediaService.manipulateMedia.
 *
 * Uses real Sharp + real test image to validate rotation, crop, filters,
 * and error handling. File I/O is mocked; DB adapter is mocked.
 *
 * ⚠️ Isolated from the main media-service.test.ts to avoid mock bleeding
 * from vi.clearAllMocks() called in other test suites.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

// ── Module-level mocks (hoisted by Vitest) ──

vi.mock("@src/utils/media/media-storage.server", () => ({
  getFile: vi.fn(),
  saveFile: vi.fn(),
  fileExists: vi.fn(),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  },
}));

// ── Tests ──

const TEST_IMAGE = path.resolve("tests/e2e/testthumb.png");
const mockDbAdapter = (globalThis as any).mockDbAdapter;

describe("MediaService — Sharp Pipeline", () => {
  let mediaService: any;
  let testBuffer: Buffer;
  let storageMock: any;

  beforeAll(async () => {
    testBuffer = await fs.readFile(TEST_IMAGE);
    storageMock = await import("@src/utils/media/media-storage.server");
    // We never clearAllMocks in this file — set implementations once
    storageMock.getFile.mockResolvedValue(testBuffer);
    storageMock.saveFile.mockResolvedValue(undefined);
    storageMock.fileExists.mockResolvedValue(true);
  });

  beforeEach(async () => {
    // Reset DB mocks only (not file I/O)
    vi.clearAllMocks();
    // Re-apply file I/O mocks that clearAllMocks wiped
    storageMock.getFile.mockResolvedValue(testBuffer);
    storageMock.saveFile.mockResolvedValue(undefined);
    storageMock.fileExists.mockResolvedValue(true);

    const { MediaService } =
      await import("@src/utils/media/media-service.server");
    mediaService = new MediaService(mockDbAdapter as any);
  });

  function mockRecord(overrides: Record<string, unknown> = {}) {
    return {
      _id: "img-test",
      filename: "testthumb.png",
      path: "global/testthumb.png",
      mimeType: "image/png",
      size: testBuffer.length,
      hash: "abc123",
      url: "/files/global/testthumb.png",
      metadata: {},
      access: "public",
      ...overrides,
    };
  }

  function mockUpdateOk() {
    (mockDbAdapter.crud.update as any).mockResolvedValue({ success: true });
  }

  function mockFinalFindOne() {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord({ path: "updated/out.png", hash: "newhash" }),
    });
  }

  // ── Basic operations ──

  it("rotates an image 90 degrees", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    mockUpdateOk();
    mockFinalFindOne();

    const result = await mediaService.manipulateMedia(
      "img-test",
      { rotation: 90, saveBehavior: "overwrite" },
      "user-1",
    );

    expect(result).toBeDefined();
    expect(result._id).toBeDefined();
  });

  it("crops an image to a rectangle", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    mockUpdateOk();
    mockFinalFindOne();

    const result = await mediaService.manipulateMedia(
      "img-test",
      {
        crop: { x: 10, y: 10, width: 50, height: 50 },
        saveBehavior: "overwrite",
      },
      "user-1",
    );

    expect(result).toBeDefined();
  });

  it("applies brightness and contrast filters", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    mockUpdateOk();
    mockFinalFindOne();

    const result = await mediaService.manipulateMedia(
      "img-test",
      { filters: { brightness: 30, contrast: 10 }, saveBehavior: "overwrite" },
      "user-1",
    );

    expect(result).toBeDefined();
  });

  it("flips horizontally and vertically", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    mockUpdateOk();
    mockFinalFindOne();

    const result = await mediaService.manipulateMedia(
      "img-test",
      { flipH: true, flipV: true, saveBehavior: "overwrite" },
      "user-1",
    );

    expect(result).toBeDefined();
  });

  it("saves as new media record when saveBehavior is 'new'", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    (mockDbAdapter.media.files.upload as any).mockResolvedValue({
      success: true,
      data: mockRecord({ _id: "img-new", path: "new/out.png" }),
    });

    const result = await mediaService.manipulateMedia(
      "img-test",
      { rotation: 90, saveBehavior: "new" },
      "user-1",
    );

    expect(result).toBeDefined();
    expect(result._id).toBe("img-new");
  });

  // ── Error handling ──

  it("throws when media record is not found", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: false,
      data: null,
    });

    await expect(
      mediaService.manipulateMedia(
        "nonexistent",
        { rotation: 90, saveBehavior: "overwrite" },
        "user-1",
      ),
    ).rejects.toThrow("Media not found");
  });

  it("throws when update fails", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    (mockDbAdapter.crud.update as any).mockResolvedValue({
      success: false,
      message: "Database error",
    });

    await expect(
      mediaService.manipulateMedia(
        "img-test",
        { rotation: 90, saveBehavior: "overwrite" },
        "user-1",
      ),
    ).rejects.toThrow("Database error");
  });

  // ── Advanced ──

  it("handles sepia + grayscale filters", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    mockUpdateOk();
    mockFinalFindOne();

    const result = await mediaService.manipulateMedia(
      "img-test",
      {
        filters: { sepia: 80, grayscale: 50, temperature: 10 },
        saveBehavior: "overwrite",
      },
      "user-1",
    );

    expect(result).toBeDefined();
  });

  it("handles crop with circle shape", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    mockUpdateOk();
    mockFinalFindOne();

    const result = await mediaService.manipulateMedia(
      "img-test",
      {
        crop: { x: 0, y: 0, width: 100, height: 100, shape: "circle" },
        saveBehavior: "overwrite",
      },
      "user-1",
    );

    expect(result).toBeDefined();
  });

  it("handles watermark text overlay", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    mockUpdateOk();
    mockFinalFindOne();

    const result = await mediaService.manipulateMedia(
      "img-test",
      {
        watermarks: [
          {
            type: "text",
            text: "CONFIDENTIAL",
            x: 20,
            y: 30,
            fontSize: 24,
            color: "#ff0000",
            opacity: 0.7,
          },
        ],
        saveBehavior: "overwrite",
      },
      "user-1",
    );

    expect(result).toBeDefined();
  });

  it("handles annotations (rect + line + text)", async () => {
    (mockDbAdapter.crud.findOne as any).mockResolvedValue({
      success: true,
      data: mockRecord(),
    });
    mockUpdateOk();
    mockFinalFindOne();

    const result = await mediaService.manipulateMedia(
      "img-test",
      {
        annotations: [
          {
            type: "rect",
            x: 10,
            y: 10,
            width: 80,
            height: 60,
            stroke: "#00ff00",
          },
          {
            type: "line",
            x: 5,
            y: 5,
            width: 90,
            height: 0,
            stroke: "#0000ff",
            strokeWidth: 3,
          },
          {
            type: "text",
            x: 40,
            y: 40,
            text: "Hello",
            fontSize: 18,
            stroke: "#ffffff",
          },
        ],
        saveBehavior: "overwrite",
      },
      "user-1",
    );

    expect(result).toBeDefined();
  });
});
