/**
 * @file tests/unit/media/slim-sniffer.test.ts
 * @description Unit tests for binary MIME type detection via magic bytes.
 *
 * Tests only formats the sniffer actually supports:
 * JPEG, PNG, GIF, WebP, SVG, MP4, WebM, PDF, DOCX (ZIP-based)
 */

import { describe, it, expect } from "vitest";
import { sniffMimeType } from "../../../src/utils/media/slim-sniffer.server";

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
});

describe("slim-sniffer — document/video formats", () => {
  it("detects PDF via 25 50 44 46", () => {
    expect(sniffMimeType(Buffer.from([0x25, 0x50, 0x44, 0x46]))).toEqual({
      ext: "pdf",
      mime: "application/pdf",
    });
  });

  it("detects DOCX/ZIP via 50 4B 03 04", () => {
    expect(sniffMimeType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toEqual({
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
