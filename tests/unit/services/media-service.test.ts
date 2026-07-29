/**
 * @file tests/unit/services/media-service.test.ts
 * @description Tests for MediaService — upload, manipulate, delete operations.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { MediaService } from "@src/utils/media/media-service.server";

// Mock dependencies
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 1000, height: 1000, format: "jpg" }),
    rotate: vi.fn().mockReturnThis(),
    flop: vi.fn().mockReturnThis(),
    flip: vi.fn().mockReturnThis(),
    extract: vi.fn().mockReturnThis(),
    modulate: vi.fn().mockReturnThis(),
    linear: vi.fn().mockReturnThis(),
    grayscale: vi.fn().mockReturnThis(),
    recomb: vi.fn().mockReturnThis(),
    blur: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    ensureAlpha: vi.fn().mockReturnThis(),
    clone: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    avif: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from("mock-buffer")),
  })),
}));

// Mock file I/O for manipulateMedia smoke tests
vi.mock("@src/utils/media/media-storage.server", () => ({
  getFile: vi.fn().mockResolvedValue(Buffer.from("fake-image-data")),
  saveFile: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(true),
}));

const mockDbAdapter = (globalThis as any).mockDbAdapter;

vi.mock("@utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    trace: vi.fn(),
  },
}));

describe("MediaService (Whitebox)", () => {
  let mediaService: MediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    mediaService = new MediaService(mockDbAdapter as any);
  });

  describe("Batch Processing Logic", () => {
    it("should process multiple images in parallel", async () => {
      const mockItems = [
        {
          _id: "id1",
          type: "image",
          filename: "test1.jpg",
          path: "global/test1.jpg",
        },
        {
          _id: "id2",
          type: "image",
          filename: "test2.jpg",
          path: "global/test2.jpg",
        },
      ];

      // Setup findOne mock
      (mockDbAdapter.crud.findOne as any)
        .mockResolvedValueOnce({ success: true, data: mockItems[0] })
        .mockResolvedValueOnce({ success: true, data: mockItems[1] });

      // Mock manipulation logic (since manipulateMedia reads files)
      vi.spyOn(mediaService as any, "manipulateMedia").mockImplementation(async (id) => ({
        _id: id,
        success: true,
      }));

      const results = await mediaService.batchProcessImages(
        ["id1", "id2"],
        {
          filters: { brightness: 20 },
          saveBehavior: "overwrite",
        },
        "user-123",
      );

      expect(results).toHaveLength(2);
      expect(mediaService.manipulateMedia).toHaveBeenCalledTimes(2);
    });

    it("should handle partial failures in batch processing", async () => {
      (mockDbAdapter.crud.findOne as any)
        .mockResolvedValueOnce({
          success: true,
          data: {
            _id: "id1",
            type: "image",
            filename: "test1.jpg",
            path: "path1",
          },
        })
        .mockResolvedValueOnce({ success: false, error: "Not found" });

      vi.spyOn(mediaService as any, "manipulateMedia").mockImplementation(async (id) => {
        if (id === "id2") throw new Error("Failed");
        return { _id: id } as any;
      });

      const results = await mediaService.batchProcessImages(
        ["id1", "id2"],
        { filters: {}, saveBehavior: "new" },
        "user-123",
      );

      expect(results).toHaveLength(1);
      expect(results[0]._id).toBe("id1");
    });
  });

  describe("Transformation Utilities", () => {
    it("should determine correct media type from mime", () => {
      expect(mediaService.getMediaType("image/jpeg")).toBe("image");
      expect(mediaService.getMediaType("video/mp4")).toBe("video");
      expect(mediaService.getMediaType("application/pdf")).toBe("document");
    });

    it("should fallback to document for unknown application/ types", () => {
      expect(mediaService.getMediaType("application/x-executable")).toBe("document");
    });
  });
});
