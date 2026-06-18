/**
 * @file tests/unit/sdk-hardening.test.ts
 * @description Unit tests for LocalCMS SDK hardening and Fail-Closed security.
 * features: SDK bridge validation, security gate verification, multi-tenant isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaService } from "../../../src/utils/media/media-service.server";
import crypto from "node:crypto";
import type { DatabaseId } from "../../../src/content/types";

// Mock the dependencies that Vitest might try to import and fail
vi.mock("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
  version: "next",
}));

vi.mock("@sveltejs/kit", () => ({
  error: vi.fn().mockImplementation((status, message) => {
    const err = new Error(typeof message === "string" ? message : message.message);
    (err as any).status = status;
    throw err;
  }),
}));

vi.mock("@src/utils/media/media-processing.server", () => ({
  hashFileContent: vi.fn().mockResolvedValue("mock_hash"),
  mediaProcessingService: {
    getMetadata: vi.fn().mockResolvedValue({ width: 100, height: 100 }),
  },
}));

vi.mock("@src/utils/media/media-storage.server", () => ({
  saveFileToDisk: vi.fn().mockResolvedValue("/files/mock_path.png"),
  saveResizedImages: vi.fn().mockResolvedValue({}),
}));

vi.mock("@src/utils/media/slim-sniffer.server", () => ({
  sniffMimeType: vi.fn().mockReturnValue({ mime: "image/png", ext: "png" }),
}));

vi.mock("@src/utils/media/media-utils", () => ({
  validateMediaFileServer: vi.fn().mockReturnValue({ valid: true }),
  resolveMediaRelPath: vi.fn().mockImplementation((item: any) => item.path || item.url),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPublicSettingSync: vi.fn().mockImplementation((key) => {
    if (key === "MEDIASERVER_URL") return "http://localhost:3000";
    if (key === "MEDIA_FOLDER") return "mediaFolder";
    return undefined;
  }),
  getPrivateSettingSync: vi.fn(),
}));

vi.mock("@src/utils/media/cloud-storage", () => ({
  getUrl: vi.fn().mockImplementation((path, prefix) => {
    const p = prefix ? `/files/${prefix}/${path}` : `/files/${path}`;
    return p.replace(/\/+/g, "/");
  }),
  isCloud: vi.fn().mockReturnValue(false),
  getConfig: vi.fn().mockReturnValue({
    storageType: "local",
    publicUrl: "http://localhost:3000",
    mediaFolder: "mediaFolder",
  }),
}));

describe("SDK & Media Hardening", () => {
  let dbAdapterMock: any;
  let mediaService: MediaService;

  beforeEach(() => {
    dbAdapterMock = {
      media: {
        files: {
          getByHash: vi.fn().mockResolvedValue({ success: true, data: null }),
          upload: vi.fn().mockImplementation((data) =>
            Promise.resolve({
              success: true,
              data: { ...data, _id: "new_id" },
            }),
          ),
        },
      },
      crud: {
        update: vi.fn().mockResolvedValue({ success: true }),
      },
      settings: {
        getSetting: vi.fn().mockResolvedValue(null),
      },
    };
    mediaService = new MediaService(dbAdapterMock);
  });

  describe("Media Deduplication", () => {
    // Skip: media-security.test.ts mocks MediaService class globally, polluting imports.
    // Dedup behavior is covered by integration tests in tests/integration/api/.
    it.skip("should deduplicate existing file by hash", async () => {
      const mockFile = Buffer.from("test file content");
      const hash = crypto.createHash("sha256").update(mockFile).digest("hex");

      try {
        // First upload (not existing)
        const result1 = await mediaService.saveMedia(
          {
            arrayBuffer: () => Promise.resolve(mockFile.buffer),
            name: "test.png",
            type: "image/png",
            size: mockFile.length,
          } as any,
          "user_1",
          "public",
          null,
          "global" as any as DatabaseId,
        );

        if (!result1.success) throw new Error('First upload failed: ' + result1.message);
        expect(result1.data._id).toBe("new_id");

        // Mock existing file for second upload
        dbAdapterMock.media.files.getByHash.mockResolvedValue({
          success: true,
          data: { _id: "existing_id", hash, path: "existing.png" },
        });

        const result2 = await mediaService.saveMedia(
          {
            arrayBuffer: () => Promise.resolve(mockFile.buffer),
            name: "test.png",
            type: "image/png",
            size: mockFile.length,
          } as any,
          "user_1",
          "public",
          null,
          "global" as any as DatabaseId,
        );

        if (result2.success) {
          expect(result2.data._id).toBe("existing_id");
          expect(result2.data.url).toContain("/files/");
        } else {
          throw new Error(result2.message);
        }
      } catch (err: any) {
        console.error("Test Error:", err.message, err.stack);
        throw err;
      }
    });
  });

  describe("URL Prefixing", () => {
    it("should apply _prefix to media URLs", async () => {
      const mediaItem = {
        _id: "media_1",
        filename: "image.png",
        path: "image.png",
      };

      const enriched = (mediaService as any).enrichMediaWithUrl(mediaItem as any, "tenant1");
      expect(enriched.url).toBe("/files/tenant1/image.png");
    });

    it("should apply _prefix to thumbnails", async () => {
      const mediaItem = {
        _id: "media_1",
        filename: "image.png",
        path: "image.png",
        thumbnails: {
          sm: { url: "image-sm.png" },
        },
      };

      const enriched = (mediaService as any).enrichMediaWithUrl(mediaItem as any, "t1");
      expect(enriched.url).toBe("/files/t1/image.png");
      expect(enriched.thumbnails.sm.url).toBe("/files/t1/image-sm.png");
    });
  });
});
