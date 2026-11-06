/**
 * @file tests/unit/media/document-previews.test.ts
 * @description First-page/table previews for non-image media (PDF, CSV, Office).
 *
 * The gallery renders these buffers as tile thumbnails. PDFs use the bundled
 * PDFium WASM, so the test must prove previews work without ImageMagick. Office
 * documents depend on an optional LibreOffice binary; a host without it must
 * degrade to "no thumbnail" instead of failing the upload.
 */

import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  buildDocumentPreview,
  detectDocumentPreviewKind,
  generateCsvThumbnail,
  generatePdfThumbnail,
} from "@src/utils/media/media-storage.server";

// The global unit setup stubs Sharp for speed; these assertions are about real pixels.
vi.unmock("sharp");

// Report every converter spawn as ENOENT, so the Office path is deterministic on
// machines and CI images that do ship LibreOffice.
vi.mock("node:child_process", async () => {
  const { EventEmitter } = await import("node:events");
  class FakeChildProcess extends EventEmitter {
    stderr = new EventEmitter();
    kill = vi.fn();
  }
  return {
    spawn: vi.fn(() => {
      const child = new FakeChildProcess();
      queueMicrotask(() => {
        child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
      });
      return child;
    }),
  };
});

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ODT_MIME = "application/vnd.oasis.opendocument.text";
const ODS_MIME = "application/vnd.oasis.opendocument.spreadsheet";
const ODP_MIME = "application/vnd.oasis.opendocument.presentation";

/** Minimal single-page PDF with a correct cross-reference table. */
function makeMinimalPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = "BT /F1 24 Tf 20 100 Td (Preview) Tj ET";
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

describe("document previews", () => {
  it("renders the first rows of a CSV as a spreadsheet image", async () => {
    const csv = Buffer.from(
      'name;amount;date\n"Acme, Inc.";1234.50;2026-01-02\nBeta;99.00;2026-02-03\n',
    );
    const preview = await generateCsvThumbnail(csv);
    expect(preview).not.toBeNull();
    const meta = await sharp(preview!).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBeGreaterThan(100);
  });

  it("returns null for binary input that is not a spreadsheet", async () => {
    expect(await generateCsvThumbnail(Buffer.from([0, 1, 2, 0, 255]))).toBeNull();
    expect(await generateCsvThumbnail(Buffer.alloc(0))).toBeNull();
  });

  it("renders the first page of a PDF without ImageMagick", async () => {
    const preview = await generatePdfThumbnail(makeMinimalPdf());
    expect(preview).not.toBeNull();
    const meta = await sharp(preview!).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBeGreaterThan(300);
    expect(meta.height).toBeGreaterThan(300);
  });

  it("returns null instead of throwing for malformed PDF bytes", async () => {
    expect(await generatePdfThumbnail(Buffer.from("not a pdf"))).toBeNull();
  });
});

describe("office document previews", () => {
  it("classifies Office documents by extension and by MIME type", () => {
    for (const filename of [
      "report.docx",
      "sheet.xlsx",
      "deck.pptx",
      "notes.odt",
      "table.ods",
      "slides.odp",
    ]) {
      expect(detectDocumentPreviewKind(filename, "application/octet-stream")).toBe("office");
    }

    for (const mimeType of [DOCX_MIME, XLSX_MIME, PPTX_MIME, ODT_MIME, ODS_MIME, ODP_MIME]) {
      expect(detectDocumentPreviewKind("upload", mimeType)).toBe("office");
    }

    expect(detectDocumentPreviewKind("photo.JPG", "image/jpeg")).toBeNull();
    expect(detectDocumentPreviewKind("clip.mp4", "video/mp4")).toBeNull();
    expect(detectDocumentPreviewKind("archive.zip", "application/zip")).toBeNull();
  });

  it("keeps the PDF and delimited-text classification stable", () => {
    expect(detectDocumentPreviewKind("manual.pdf", "application/octet-stream")).toBe("pdf");
    expect(detectDocumentPreviewKind("upload", "application/pdf")).toBe("pdf");
    expect(detectDocumentPreviewKind("rows.csv", "text/csv")).toBe("delimited");
    expect(detectDocumentPreviewKind("rows.tsv", "text/tab-separated-values")).toBe("delimited");
    expect(detectDocumentPreviewKind("rows.CSV", "application/octet-stream")).toBe("delimited");
  });

  it("returns no thumbnails without throwing when LibreOffice is absent", async () => {
    const result = await buildDocumentPreview(
      Buffer.from("PK\u0003\u0004 not a real docx"),
      "a".repeat(64),
      "report.docx",
      DOCX_MIME,
      "tenant-preview-test",
    );

    expect(result).toEqual({ metadata: {}, thumbnails: {} });
  });

  it("never attempts a converter for non-document uploads", async () => {
    expect(
      await buildDocumentPreview(
        Buffer.from([0xff, 0xd8, 0xff]),
        "b".repeat(64),
        "photo.jpg",
        "image/jpeg",
      ),
    ).toEqual({ metadata: {}, thumbnails: {} });
  });
});
