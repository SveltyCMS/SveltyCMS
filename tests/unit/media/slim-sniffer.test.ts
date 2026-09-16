/**
 * @file tests/unit/media/slim-sniffer.test.ts
 * @description Unit tests for binary MIME type detection via magic bytes.
 *
 * Tests only formats the sniffer actually supports:
 * JPEG, PNG, GIF, WebP, SVG, MP4, WebM, PDF, DOCX (ZIP-based)
 */

import { describe, it, expect } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  sniffMimeType,
  resolveMimeType,
  resolveMimeTypeFromPath,
  mimeTypesConflict,
  assertMimeAgreement,
  resolveRemoteAssetMime,
} from "../../../src/utils/media/slim-sniffer.server";

describe("slim-sniffer — image formats", () => {
  it("detects JPEG via FF D8 FF", () => {
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      ext: "jpg",
      mime: "image/jpeg",
    });
  });

  it("detects PNG via 89 50 4E 47", () => {
    expect(sniffMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toEqual({
      ext: "png",
      mime: "image/png",
    });
  });

  it("detects GIF via 47 49 46 38", () => {
    expect(sniffMimeType(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toEqual({
      ext: "gif",
      mime: "image/gif",
    });
  });

  it("detects WebP via RIFF....WEBP", () => {
    const buf = Buffer.alloc(16);
    buf.write("RIFF", 0);
    buf.write("WEBP", 8);
    expect(sniffMimeType(buf)).toEqual({ ext: "webp", mime: "image/webp" });
  });

  it("detects SVG via '<svg' in header", () => {
    const buf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">', "ascii");
    expect(sniffMimeType(buf)).toEqual({ ext: "svg", mime: "image/svg+xml" });
  });

  it("detects HTML via doctype for polyglot defense", () => {
    const buf = Buffer.from("<!DOCTYPE html><html><body>x</body></html>", "ascii");
    expect(sniffMimeType(buf)).toEqual({ ext: "html", mime: "text/html" });
  });
});

describe("slim-sniffer — document/video formats", () => {
  it("detects PDF via 25 50 44 46", () => {
    expect(sniffMimeType(Buffer.from([0x25, 0x50, 0x44, 0x46]))).toEqual({
      ext: "pdf",
      mime: "application/pdf",
    });
  });

  it("detects bare ZIP via 50 4B 03 04 when OOXML markers are absent", () => {
    expect(sniffMimeType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toEqual({
      ext: "zip",
      mime: "application/zip",
    });
  });

  it("detects DOCX when ZIP local header carries word/ payload path", () => {
    // Minimal local-file header + filename "word/document.xml" so the sniffer
    // can distinguish OOXML from a plain ZIP (filename starts at offset 30).
    const name = "word/document.xml";
    const buf = Buffer.alloc(30 + name.length);
    buf[0] = 0x50;
    buf[1] = 0x4b;
    buf[2] = 0x03;
    buf[3] = 0x04;
    buf.writeUInt16LE(name.length, 26);
    buf.write(name, 30, "ascii");
    expect(sniffMimeType(buf)).toEqual({
      ext: "docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it("detects MP4 via ftyp box", () => {
    const buf = Buffer.alloc(12);
    buf.writeUInt32BE(12, 0);
    buf.write("ftyp", 4);
    expect(sniffMimeType(buf)).toEqual({ ext: "mp4", mime: "video/mp4" });
  });

  it("detects WebM via 1A 45 DF A3", () => {
    expect(sniffMimeType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))).toEqual({
      ext: "webm",
      mime: "video/webm",
    });
  });
});

describe("slim-sniffer — edge cases", () => {
  it("returns null for empty buffer", () => {
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for buffer < 4 bytes", () => {
    expect(sniffMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it("returns null for unknown bytes", () => {
    expect(sniffMimeType(Buffer.from([0xde, 0xad, 0xbe, 0xef]))).toBeNull();
  });
});

describe("slim-sniffer — resolveMimeType", () => {
  it("prefers a known extension over stored MIME", () => {
    expect(resolveMimeType({ name: "hero.webp", storedMime: "application/octet-stream" })).toBe(
      "image/webp",
    );
  });

  it("uses stored MIME when the extension is unknown", () => {
    expect(resolveMimeType({ name: "blob.bin", storedMime: "image/avif" })).toBe("image/avif");
  });

  it("skips stored octet-stream and sniffs magic bytes", () => {
    expect(
      resolveMimeType({
        name: "blob.bin",
        storedMime: "application/octet-stream",
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      }),
    ).toBe("image/jpeg");
  });

  it("falls back to octet-stream only when nothing else matches", () => {
    expect(
      resolveMimeType({ name: "blob.bin", buffer: Buffer.from([0xde, 0xad, 0xbe, 0xef]) }),
    ).toBe("application/octet-stream");
  });
});

describe("slim-sniffer — MIME agreement", () => {
  it("allows same-family image mismatches (jpeg vs png)", () => {
    expect(mimeTypesConflict("image/jpeg", "image/png")).toBe(false);
    expect(() =>
      assertMimeAgreement({
        filename: "photo.jpg",
        declaredMime: "image/jpeg",
        sniffedMime: "image/png",
      }),
    ).not.toThrow();
  });

  it("rejects scriptable sniff against an image claim", () => {
    expect(mimeTypesConflict("image/jpeg", "text/html")).toBe(true);
    expect(mimeTypesConflict("image/jpeg", "image/svg+xml")).toBe(true);
    expect(() =>
      assertMimeAgreement({
        filename: "photo.jpg",
        declaredMime: "image/jpeg",
        sniffedMime: "text/html",
      }),
    ).toThrow(/mismatch/);
  });

  it("rejects a .html name claiming to be jpeg", () => {
    expect(() =>
      assertMimeAgreement({
        filename: "page.html",
        declaredMime: "image/jpeg",
      }),
    ).toThrow(/mismatch/);
  });

  it("does not flag missing sniff", () => {
    expect(() =>
      assertMimeAgreement({ filename: "photo.jpg", declaredMime: "image/jpeg" }),
    ).not.toThrow();
  });
});

describe("slim-sniffer — resolveRemoteAssetMime", () => {
  it("recovers JPEG from magic bytes when the remote Content-Type is octet-stream", () => {
    expect(
      resolveRemoteAssetMime({
        filename: "blob.bin",
        declaredMime: "application/octet-stream",
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      }),
    ).toBe("image/jpeg");
  });

  it("prefers a known filename extension", () => {
    expect(
      resolveRemoteAssetMime({
        filename: "hero.webp",
        declaredMime: "application/octet-stream",
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      }),
    ).toBe("image/webp");
  });

  it("rejects a JPEG URL whose bytes are HTML", () => {
    expect(() =>
      resolveRemoteAssetMime({
        filename: "photo.jpg",
        declaredMime: "image/jpeg",
        buffer: Buffer.from("<!DOCTYPE html><html><body>x</body></html>"),
      }),
    ).toThrow(/mismatch|not allowed/i);
  });

  it("rejects a scriptable remote type even with a .bin name", () => {
    expect(() =>
      resolveRemoteAssetMime({
        filename: "blob.bin",
        declaredMime: "text/html",
        buffer: Buffer.from("<!DOCTYPE html><html></html>"),
      }),
    ).toThrow(/mismatch|not allowed/i);
  });
});

describe("slim-sniffer — resolveMimeTypeFromPath (file head)", () => {
  it("sniffs a file head when the path has no usable extension", async () => {
    const p = join(tmpdir(), `svelty-sniff-${Date.now()}.bin`);
    await writeFile(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    try {
      expect(await resolveMimeTypeFromPath(p)).toBe("image/png");
      expect(await resolveMimeTypeFromPath(p, "image/avif")).toBe("image/avif");
    } finally {
      await unlink(p);
    }
  });
});
