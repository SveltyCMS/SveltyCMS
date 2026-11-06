/**
 * @file tests/e2e/routes/mediagallery/media-table.spec.ts
 * @description E2E for the /mediagallery table view — data rows, generated
 * previews, row dividers, per-row action menus and document details.
 *
 * ### Features:
 * - Uploads real assets so the table renders the same rendition ladder as the grid
 * - Asserts every row exposes a preview URL, a SIZE cell and an action trigger
 * - Asserts each `<tr>` paints its own divider (the old `divide-y` on `<tbody>`
 *   painted nothing)
 * - Opens the bottom-most row menu and asserts it stays fully inside the viewport
 *   without covering that row's SIZE cell
 * - Opens the PDF and CSV viewers from a table row menu (not just the grid)
 * - Deletes every uploaded row in `finally`
 */

import { test, expect, type Locator, type Page } from "../../fixtures";
import {
  deleteMediaRow,
  mediaCard,
  openMediaGallery,
  uploadUniqueImage,
} from "../../helpers/media";

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

/** Upload through the toolbar input and resolve once the persisted tile renders. */
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

/** Switch to the table view and return the table locator. */
async function openTableView(page: Page) {
  await page.getByTestId("media-view-table").click();
  await expect(page.getByTestId("media-view-table")).toHaveAttribute("aria-pressed", "true");
  const table = page.getByTestId("media-table");
  await expect(table).toBeVisible({ timeout: 10_000 });
  return table;
}

/** The table row for a filename (name cell carries the exact text). */
function tableRow(table: Locator, name: string): Locator {
  return table.locator("tbody tr").filter({ hasText: name }).first();
}

/** Open the per-row menu and choose Details. */
async function openDetailsFromRow(page: Page, name: string): Promise<void> {
  const row = tableRow(page.getByTestId("media-table"), name);
  await row.scrollIntoViewIfNeeded();
  await row.getByRole("button", { name: `Actions for ${name}` }).click();

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible({ timeout: 10_000 });
  await menu.getByRole("menuitem", { name: /details/i }).click();
  await expect(page.getByTestId("media-details-modal")).toBeVisible({ timeout: 10_000 });
}

test.describe("Media gallery table view", () => {
  test.setTimeout(150_000);

  test("renders previews, sizes, dividers and viewport-safe row menus", async ({ page }) => {
    // A short viewport forces the bottom row's menu to flip above the trigger
    // instead of hanging below the fold.
    await page.setViewportSize({ width: 1280, height: 420 });
    await openMediaGallery(page);

    const stamp = Date.now().toString(36);
    // A 320px source yields the 200px `thumbnail` derivative; a 24px fixture
    // would (correctly) fall back to the original and prove nothing about the ladder.
    const first = await uploadUniqueImage(page, `e2e-table-a-${stamp}.png`, 320);
    const second = await uploadUniqueImage(page, `e2e-table-b-${stamp}.png`, 320);

    try {
      const table = await openTableView(page);
      const rows = table.locator("tbody tr");
      await expect(rows.filter({ hasText: second.filename })).toHaveCount(1, {
        timeout: 15_000,
      });

      for (const asset of [first, second]) {
        const row = tableRow(table, asset.filename);
        await expect(row).toBeVisible({ timeout: 15_000 });

        // Same rendition ladder as the grid — a real generated preview, not an icon.
        const preview = row.locator("td.media-table-preview img");
        await expect(preview).toBeVisible({ timeout: 15_000 });
        await expect(preview).toHaveAttribute("src", /\/files\/.+\/(thumbnail|sm|md)\//);

        const size = row.locator("td.media-table-size");
        await expect(size).toBeVisible();
        await expect(size).toHaveText(/^\d/);

        await expect(
          row.getByRole("button", { name: `Actions for ${asset.filename}` }),
        ).toBeVisible();
      }

      // The old `divide-y` utility on <tbody> painted no rule; each row now
      // carries `border-b` and the last row opts out with `last:border-0`.
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThanOrEqual(2);
      const borderWidth = (index: number) =>
        rows.nth(index).evaluate((el) => getComputedStyle(el).borderBottomWidth);
      for (let index = 0; index < rowCount - 1; index++) {
        expect(await borderWidth(index), `row ${index} must paint a divider`).not.toBe("0px");
      }
      expect(await borderWidth(rowCount - 1), "the last row must not paint a divider").toBe("0px");

      // Open the bottom-most menu: it must stay fully inside the viewport and
      // must not sit on top of the same row's SIZE cell.
      const lastRow = rows.last();
      const trigger = lastRow.locator("td.media-table-actions button");
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click();

      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible({ timeout: 10_000 });
      await expect(menu).toBeInViewport({ ratio: 1 });

      const menuBox = await menu.boundingBox();
      const sizeBox = await lastRow.locator("td.media-table-size").boundingBox();
      expect(menuBox, "row menu must have a box").not.toBeNull();
      expect(sizeBox, "SIZE cell must have a box").not.toBeNull();
      const overlapsSizeCell =
        menuBox!.y < sizeBox!.y + sizeBox!.height && menuBox!.y + menuBox!.height > sizeBox!.y;
      expect(overlapsSizeCell, "row menu must not cover the SIZE cell").toBe(false);
    } finally {
      await deleteMediaRow(page, first._id);
      await deleteMediaRow(page, second._id);
    }
  });

  test("opens PDF and CSV details from a table row menu", async ({ page }) => {
    await openMediaGallery(page);

    const stamp = Date.now().toString(36);
    const csvName = `e2e-table-doc-${stamp}.csv`;
    const pdfName = `e2e-table-doc-${stamp}.pdf`;
    const csv = Buffer.from(
      'name;amount;note\n"Acme, Inc.";1234.50;"Paid; net 30"\nBeta;99.00;Pending\n',
      "utf8",
    );

    const csvId = await uploadDocument(page, csvName, "text/csv", csv);
    let pdfId: string | undefined;

    try {
      pdfId = await uploadDocument(page, pdfName, "application/pdf", makeMinimalPdf());

      const table = await openTableView(page);
      for (const name of [csvName, pdfName]) {
        const row = tableRow(table, name);
        await expect(row).toBeVisible({ timeout: 20_000 });

        // Document rows render their generated first-page/table rendition too.
        const preview = row.locator("td.media-table-preview img");
        await expect(preview).toBeVisible({ timeout: ACTION_TIMEOUT });
        await expect(preview).toHaveAttribute("src", /\/files\/.+\/(thumbnail|sm|md)\//);
      }

      // PDF: the row menu opens the same viewer as the grid.
      await openDetailsFromRow(page, pdfName);
      const pdfModal = page.getByTestId("media-details-modal");
      await expect(pdfModal.getByTestId("media-pdf-preview")).toBeVisible({
        timeout: ACTION_TIMEOUT,
      });
      await expect(pdfModal.getByTestId("media-pdf-frame")).toHaveAttribute(
        "src",
        /\/files\/.+\.pdf$/,
      );
      await page.keyboard.press("Escape");
      await expect(pdfModal).toBeHidden({ timeout: 10_000 });

      // CSV: quoted delimiter cells survive in the modal's parsed table.
      await openDetailsFromRow(page, csvName);
      const csvModal = page.getByTestId("media-details-modal");
      const csvPreview = csvModal.getByTestId("media-csv-preview");
      await expect(csvPreview).toHaveAttribute("data-state", "ready", {
        timeout: ACTION_TIMEOUT,
      });
      const csvTable = csvPreview.getByTestId("media-csv-table");
      await expect(csvTable.getByRole("columnheader", { name: "name", exact: true })).toBeVisible();
      await expect(csvTable.getByRole("cell", { name: "Acme, Inc.", exact: true })).toBeVisible();
      await expect(csvTable.getByRole("cell", { name: "Paid; net 30", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(csvModal).toBeHidden({ timeout: 10_000 });
    } finally {
      await deleteMediaRow(page, csvId);
      await deleteMediaRow(page, pdfId);
    }
  });
});
