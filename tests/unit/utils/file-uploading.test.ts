import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadFile, createDirectory, deleteDirectory } from "@src/utils/file-uploading";
import * as fs from "node:fs/promises";
import * as nodeFs from "node:fs";
import path from "node:path";

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  access: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
  readFile: vi.fn(),
}));

// Mock node:fs for createWriteStream (used by uploadFile streaming path)
vi.mock("node:fs", () => ({
  createWriteStream: vi.fn(() => ({
    write: vi.fn((_chunk, cb) => cb?.()),
    end: vi.fn((cb) => cb?.()),
    on: vi.fn(),
    once: vi.fn(),
  })),
}));

// Mock global-settings
vi.mock("@src/stores/global-settings.svelte.ts", () => ({
  publicEnv: {
    MEDIA_FOLDER: "mediaFolder",
  },
}));

describe("File Uploading Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "cwd").mockReturnValue("/root");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("uploadFile", () => {
    it("should upload a valid file successfully", async () => {
      const mockFile = new File(["content"], "test.png", { type: "image/png" });
      (fs.access as any).mockRejectedValue({ code: "ENOENT" }); // File doesn't exist
      (fs.mkdir as any).mockResolvedValue(undefined);

      const onProgress = vi.fn();
      const result = await uploadFile(mockFile, "uploads", onProgress);

      expect(result.success).toBe(true);
      expect(result.filename).toBe("test.png");
      expect(fs.mkdir).toHaveBeenCalled();
      expect(nodeFs.createWriteStream).toHaveBeenCalled();
      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it("should throw error for invalid file", async () => {
      await expect(uploadFile(null as any)).rejects.toThrow("Invalid file provided");
    });

    it("should throw error if file size exceeds limit", async () => {
      const largeFile = { size: 100 * 1024 * 1024, name: "large.zip" } as File;
      await expect(uploadFile(largeFile)).rejects.toThrow("File size exceeds maximum limit");
    });

    it("should sanitize filename", async () => {
      const mockFile = new File(["content"], "my file@2024!.png", {
        type: "image/png",
      });
      (fs.access as any).mockRejectedValue({ code: "ENOENT" });

      const result = await uploadFile(mockFile);
      expect(result.filename).toBe("my_file_2024_.png");
    });

    it("should prevent directory traversal in folder name", async () => {
      const mockFile = new File(["content"], "test.png", { type: "image/png" });
      (fs.access as any).mockRejectedValue({ code: "ENOENT" });

      // 🛡️ Hardened: Path traversal now throws before any fs operation
      await expect(uploadFile(mockFile, "../../../etc/passwd")).rejects.toThrow(
        "Security Violation",
      );
    });

    it("should throw error if file already exists", async () => {
      const mockFile = new File(["content"], "exists.png", {
        type: "image/png",
      });
      (fs.access as any).mockResolvedValue(undefined); // File exists

      await expect(uploadFile(mockFile)).rejects.toThrow('File "exists.png" already exists');
    });
  });

  describe("createDirectory", () => {
    it("should create a directory successfully", async () => {
      (fs.mkdir as any).mockResolvedValue(undefined);

      const result = await createDirectory("new-folder");

      expect(result.success).toBe(true);
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(path.join("mediaFolder", "new-folder")),
        { recursive: true },
      );
    });

    it("should throw error if path is not a string", async () => {
      await expect(createDirectory(123 as any)).rejects.toThrow("Folder path must be a string");
    });
  });

  describe("deleteDirectory", () => {
    it("should delete an existing directory", async () => {
      (fs.access as any).mockResolvedValue(undefined);
      (fs.rm as any).mockResolvedValue(undefined);

      const result = await deleteDirectory("old-folder");

      expect(result.success).toBe(true);
      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining(path.join("mediaFolder", "old-folder")),
        { recursive: false, force: false },
      );
    });

    it("should support recursive delete with force flag", async () => {
      (fs.access as any).mockResolvedValue(undefined);

      await deleteDirectory("heavy-folder", true);

      expect(fs.rm).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
        force: true,
      });
    });

    it("should throw error for empty folder name", async () => {
      await expect(deleteDirectory("")).rejects.toThrow("Folder name cannot be empty");
    });
  });
});
