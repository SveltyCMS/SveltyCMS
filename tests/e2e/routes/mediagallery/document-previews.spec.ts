/**
 * @file tests/e2e/routes/mediagallery/document-previews.spec.ts
 * @description E2E for generated document previews — tile renditions plus the
 * PDF/CSV viewers in the media details modal.
 *
 * ### Features:
 * - Uploads a CSV (semicolon-delimited, quoted comma + quoted delimiter) and a
 *   minimal PDF through the real gallery upload input
 * - Asserts the grid tile renders a generated rendition (`img src`), not the file icon
 * - Asserts the details modal PDF iframe points at the original document
 * - Asserts the CSV table parses to `data-state="ready"` with the header and
 *   quoted cells intact
 * - Deletes both uploaded rows in `finally`
 */

import { test, expect, type Page } from "../../fixtures";
import { deleteMediaRow, mediaCard, openMediaGallery } from "../../helpers/media";

const ACTION_TIMEOUT = 25_000;

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

/** Upload through the toolbar input and resolve once the persisted card renders. */
async function uploadDocument(
  page: Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<string> {
  const responsePromise = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      (res.url().includes("?/upload") || res.url().includes("/api/media")),
    { timeout: 30_000 },
  );
  await page.getByTestId("media-upload-input").setInputFiles({ name, mimeType, buffer });

  const response = await responsePromise;
  expect(response.ok(), `${mimeType} upload: ${response.status()} ${response.url()}`).toBe(true);

  const card = mediaCard(page, name);
  await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT });
  const id = await card.getAttribute("data-media-id");
  expect(id, `${name} must expose a data-media-id`).toBeTruthy();
  return id!;
}

/** Open the details modal from the grid action tooltip. */
async function openDetails(page: Page, filename: string): Promise<void> {
  const card = mediaCard(page, filename);
  await card.scrollIntoViewIfNeeded();
  await card.hover();

  const actions = card.getByTestId("media-grid-actions").first();
  await expect(actions).toBeVisible({ timeout: 10_000 });
  await actions.getByLabel(`Details for ${filename}`).first().click();
  await expect(page.getByTestId("media-details-modal")).toBeVisible({ timeout: 10_000 });
}

async function closeDetails(page: Page): Promise<void> {
  const modal = page.getByTestId("media-details-modal");
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden({ timeout: 10_000 });
}

test.describe("Media gallery document previews", () => {
  test.setTimeout(150_000);

  test("renders generated tiles and PDF/CSV details previews", async ({ page }) => {
    await openMediaGallery(page);

    const stamp = Date.now().toString(36);
    const csvName = `e2e-doc-preview-${stamp}.csv`;
    const pdfName = `e2e-doc-preview-${stamp}.pdf`;
    // Semicolon-delimited, with a comma inside a quoted cell and a delimiter
    // inside another quoted cell: both the tile generator and the modal parser
    // must honour quotes instead of splitting on every `;`/`,`.
    const csv = Buffer.from(
      'name;amount;note\n"Acme, Inc.";1234.50;"Paid; net 30"\nBeta;99.00;Pending\n',
      "utf8",
    );

    const csvId = await uploadDocument(page, csvName, "text/csv", csv);
    let pdfId: string | undefined;

    try {
      pdfId = await uploadDocument(page, pdfName, "application/pdf", makeMinimalPdf());

      // Both document tiles render a generated first-page/table rendition.
      for (const name of [csvName, pdfName]) {
        const tile = mediaCard(page, name);
        const preview = tile.locator("img").first();
        await expect(preview).toBeVisible({ timeout: ACTION_TIMEOUT });
        await expect(preview).toHaveAttribute("src", /\/files\/.+\/(thumbnail|sm|md)\//);
      }

      // PDF: details modal hosts the native viewer pointed at the original file.
      await openDetails(page, pdfName);
      const pdfModal = page.getByTestId("media-details-modal");
      await expect(pdfModal.getByTestId("media-pdf-preview")).toBeVisible({
        timeout: ACTION_TIMEOUT,
      });
      const frame = pdfModal.getByTestId("media-pdf-frame");
      await expect(frame).toBeVisible({ timeout: 10_000 });
      await expect(frame).toHaveAttribute("src", /\/files\/.+\.pdf$/);
      await closeDetails(page);

      // CSV: the bounded parser resolves to ready and renders the real table.
      await openDetails(page, csvName);
      const csvModal = page.getByTestId("media-details-modal");
      const csvPreview = csvModal.getByTestId("media-csv-preview");
      await expect(csvPreview).toHaveAttribute("data-state", "ready", {
        timeout: ACTION_TIMEOUT,
      });
      const table = csvPreview.getByTestId("media-csv-table");
      await expect(table).toBeVisible({ timeout: 10_000 });
      await expect(table.getByRole("columnheader", { name: "name", exact: true })).toBeVisible();
      await expect(table.getByRole("cell", { name: "Acme, Inc.", exact: true })).toBeVisible();
      await expect(table.getByRole("cell", { name: "Paid; net 30", exact: true })).toBeVisible();
    } finally {
      await deleteMediaRow(page, csvId);
      await deleteMediaRow(page, pdfId);
    }
  });
});
