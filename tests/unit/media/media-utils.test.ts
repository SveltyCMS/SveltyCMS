/**
 * @file tests/unit/media/media-utils.test.ts
 * @description Unit tests for client-safe media utilities.
 */

import { describe, it, expect } from "vitest";
import {
  getMimeType,
  isAllowedUploadMime,
  getExtensionFromMimeType,
  sanitizedFilename,
  getSanitizedFileName,
  validateFile,
  validateBuffer,
  resolveMediaRelPath,
  buildOriginalRelPath,
  mediaDisplayUrl,
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

  it("maps upload-allowlist aliases", () => {
    expect(getMimeType("scan.tif")).toBe("image/tiff");
    expect(getMimeType("clip.m4v")).toBe("video/mp4");
    expect(getMimeType("audio.oga")).toBe("audio/ogg");
    expect(getMimeType("archive.gz")).toBe("application/gzip");
    expect(getMimeType("photo.heic")).toBe("image/heic");
  });

  it("is case-insensitive", () => {
    expect(getMimeType("PHOTO.JPG")).toBe("image/jpeg");
    expect(getMimeType("Image.PnG")).toBe("image/png");
  });

  it("reads the extension from a path, not directory dots", () => {
    expect(getMimeType("global/ab.hash/original/hero.webp")).toBe("image/webp");
    expect(getMimeType("C:\\media\\foo.bar\\photo.jpg")).toBe("image/jpeg");
    expect(getMimeType("C:\\media\\foo.bar\\noext")).toBeNull();
  });

  it("returns null for unknown extension", () => {
    expect(getMimeType("file.xyz")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getMimeType("")).toBeNull();
  });
});

describe("media-utils — upload allowlist", () => {
  it("allows CMS media types including HEIC/AVIF aliases", () => {
    expect(isAllowedUploadMime("image/jpeg")).toBe(true);
    expect(isAllowedUploadMime("image/avif")).toBe(true);
    expect(isAllowedUploadMime("image/heic")).toBe(true);
    expect(isAllowedUploadMime("image/svg+xml")).toBe(true);
    expect(isAllowedUploadMime("application/pdf")).toBe(true);
    expect(isAllowedUploadMime("audio/flac")).toBe(true);
  });

  it("strips RFC 7231 parameters before matching", () => {
    expect(isAllowedUploadMime("image/jpeg; charset=binary")).toBe(true);
  });

  it("rejects scriptable and office types", () => {
    expect(isAllowedUploadMime("text/html")).toBe(false);
    expect(isAllowedUploadMime("text/javascript")).toBe(false);
    expect(isAllowedUploadMime("application/xml")).toBe(false);
    expect(isAllowedUploadMime("application/msword")).toBe(false);
    expect(isAllowedUploadMime("application/octet-stream")).toBe(false);
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

describe("media-utils — gallery display URL", () => {
  it("prefers a named thumbnail over the original", () => {
    expect(
      mediaDisplayUrl(
        {
          url: "/files/global/original/hero.jpg",
          thumbnails: {
            thumbnail: { url: "/files/global/thumbnail/hero.jpg" },
            sm: { url: "/files/global/sm/hero.jpg" },
          },
        },
        "sm",
      ),
    ).toBe("/files/global/sm/hero.jpg");
  });

  it("falls back thumbnail → sm → md → original", () => {
    expect(
      mediaDisplayUrl({
        url: "/files/original.jpg",
        thumbnails: { md: { url: "/files/md.jpg" } },
      }),
    ).toBe("/files/md.jpg");
    expect(mediaDisplayUrl({ url: "/files/original.jpg" })).toBe("/files/original.jpg");
    expect(mediaDisplayUrl({})).toBe("");
  });

  it("uses the server-normalized thumbnail field", () => {
    expect(
      mediaDisplayUrl({
        url: "/files/original.jpg",
        thumbnail: { url: "/files/thumb.jpg" },
      }),
    ).toBe("/files/thumb.jpg");
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
