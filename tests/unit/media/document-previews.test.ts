/**
 * @file tests/unit/media/document-previews.test.ts
 * @description First-page/table previews for non-image media (PDF, CSV).
 *
 * The gallery renders these buffers as tile thumbnails. PDFs use the bundled
 * PDFium WASM, so the test must prove previews work without ImageMagick.
 */

import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { generateCsvThumbnail, generatePdfThumbnail } from "@src/utils/media/media-storage.server";

// The global unit setup stubs Sharp for speed; these assertions are about real pixels.
vi.unmock("sharp");

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
