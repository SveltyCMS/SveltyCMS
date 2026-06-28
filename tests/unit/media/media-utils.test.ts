/**
 * @file tests/unit/media/media-utils.test.ts
 * @description Unit tests for client-safe media utilities.
 */

import { describe, it, expect } from "vitest";
import {
  getMimeType,
  getExtensionFromMimeType,
  sanitizedFilename,
  getSanitizedFileName,
  validateFile,
  validateBuffer,
  resolveMediaRelPath,
  buildOriginalRelPath,
} from "../../../src/utils/media/media-utils";

describe("media-utils — MIME lookup", () => {
  it("returns correct MIME for known extensions", () => {
    expect(getMimeType("photo.jpg")).toBe("image/jpeg");
    expect(getMimeType("image.png")).toBe("image/png");
    expect(getMimeType("doc.pdf")).toBe("application/pdf");
    expect(getMimeType("song.mp3")).toBe("audio/mpeg");
    expect(getMimeType("video.mp4")).toBe("video/mp4");
    expect(getMimeType("data.json")).toBe("application/json");
  });

  it("is case-insensitive", () => {
    expect(getMimeType("PHOTO.JPG")).toBe("image/jpeg");
    expect(getMimeType("Image.PnG")).toBe("image/png");
  });

  it("returns null for unknown extension", () => {
    expect(getMimeType("file.xyz")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getMimeType("")).toBeNull();
  });
});

describe("media-utils — reverse MIME lookup", () => {
  it("returns extension from MIME type", () => {
    expect(getExtensionFromMimeType("image/jpeg")).toBe("jpeg");
    expect(getExtensionFromMimeType("image/png")).toBe("png");
    expect(getExtensionFromMimeType("application/pdf")).toBe("pdf");
  });

  it("returns false for unknown MIME", () => {
    expect(getExtensionFromMimeType("application/unknown")).toBe(false);
  });
});

describe("media-utils — filename sanitization", () => {
  it("splits filename into name and ext", () => {
    const result = sanitizedFilename("my photo.jpg");
    expect(result.name).toBe("my photo");
    expect(result.ext).toBe("jpg");
  });

  it("handles filenames without extension", () => {
    const result = sanitizedFilename("noext");
    expect(result.name).toBe("noext");
    expect(result.ext).toBe("");
  });

  it("throws on invalid input", () => {
    expect(() => sanitizedFilename("")).toThrow("Invalid filename");
  });

  it("backward compat alias works", () => {
    const result = getSanitizedFileName("test.PNG");
    expect(result.fileNameWithoutExt).toBe("test");
    expect(result.ext).toBe("png");
  });
});

describe("media-utils — path resolution", () => {
  it("builds hash-based original path", () => {
    const p = buildOriginalRelPath("abc123def", "photo.jpg");
    expect(p).toBe("global/abc123def/original/photo-abc123def.jpg");
  });

  it("resolves legacy hash rows", () => {
    const result = resolveMediaRelPath({
      path: "global/abc123",
      hash: "abc123",
      filename: "photo.jpg",
    });
    expect(result).toBe("global/abc123/original/photo-abc123.jpg");
  });
});

describe("media-utils — validation", () => {
  it("validateFile accepts valid file", () => {
    const file = new File(["test"], "photo.jpg", { type: "image/jpeg" });
    expect(validateFile(file, /^image\//).valid).toBe(true);
  });

  it("validateFile rejects wrong type", () => {
    const file = new File(["test"], "doc.pdf", { type: "application/pdf" });
    expect(validateFile(file, /^image\//).valid).toBe(false);
  });

  it("validateBuffer accepts valid buffer", () => {
    expect(validateBuffer(Buffer.from("test"), "photo.jpg", /^image\//).valid).toBe(true);
  });
});
