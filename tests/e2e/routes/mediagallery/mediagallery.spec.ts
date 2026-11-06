/**
 * @file tests/e2e/routes/mediagallery/mediagallery.spec.ts
 * @description E2E tests for /mediagallery — toolbar, grid/table views, search, upload, delete.
 *
 * Uses data-testid selectors (not role/CSS) so tests survive layout changes.
 */

import { test, expect } from "../../fixtures";
import { waitForHydration } from "../../helpers/auth";
import { seedMediaWithMetadata } from "../../helpers/api";
import {
  deleteMediaRow,
  mediaCard,
  openMediaGallery,
  uploadUniqueImage,
} from "../../helpers/media";

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

test.describe("Media Gallery", () => {
  test.beforeEach(async ({ page }) => {
    await openMediaGallery(page);
  });

  test("loads with toolbar, content area and default grid view", async ({ page }) => {
    const content = page.getByTestId("media-gallery-content");
    await expect(page.getByTestId("media-gallery-toolbar")).toBeVisible();
    await expect(content).toBeVisible();
    await expect(content).toHaveAttribute("data-view", "grid");
    await expect(page.getByTestId("media-grid")).toBeVisible();
    await expect(page.getByTestId("media-view-grid")).toHaveAttribute("aria-pressed", "true");
  });

  test("supports search and type filtering", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: /search media assets/i });
    await expect(search).toBeVisible();

    await search.fill("e2e-no-match-xyz-random");
    const empty = page.getByTestId("media-grid-empty");
    await expect(empty).toBeVisible({ timeout: 10_000 });
    await expect(empty).toContainText(/no assets match your filters/i);

    // A narrowed view can reset itself — it must not pretend the folder is empty.
    await empty.getByRole("button", { name: /reset filters/i }).click();
    await expect(search).toHaveValue("");
    // Reset either restores rows (a folder with assets) or the unfiltered empty
    // state. The filtered-empty copy must not linger in either case — and the
    // element itself may unmount, so assert on the copy, not the container.
    await expect.poll(async () => page.getByText(/no assets match your filters/i).count()).toBe(0);

    await search.clear();
    await expect(page.getByTestId("media-grid")).toBeVisible();

    const typeFilter = page
      .getByLabel(/filter by media type/i)
      .or(page.locator("#media-type-filter"));
    await typeFilter.selectOption({ label: "IMAGE" });
    await expect(typeFilter).toHaveValue("image");
    await expect(page.getByTestId("media-grid")).toBeVisible();
  });

  test("shift-click selects a range of tiles", async ({ page }) => {
    const seeded = await seedMediaWithMetadata(page);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      await page.getByTestId("media-selection-toggle").click();

      const ids = seeded.items.map((item) => item._id);
      const first = page.locator(`[data-media-id="${ids[0]}"]`);
      const last = page.locator(`[data-media-id="${ids[ids.length - 1]}"]`);
      await expect(first).toBeVisible({ timeout: 15_000 });

      await first.getByRole("button", { name: /preview .*drag to move/i }).click();
      await expect(first).toHaveAttribute("aria-selected", "true");

      await last
        .getByRole("button", { name: /preview .*drag to move/i })
        .click({ modifiers: ["Shift"] });
      await expect(last).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("media-bulk-count")).toContainText(/\d+\s*selected/i);
    } finally {
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });

  test("can switch between grid and table views", async ({ page }) => {
    const seeded = await seedMediaWithMetadata(page);
    const target = seeded.items[0]!;
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);

      const gridBtn = page.getByTestId("media-view-grid");
      const tableBtn = page.getByTestId("media-view-table");

      await expect(gridBtn).toBeVisible({ timeout: 15_000 });
      await expect(tableBtn).toBeVisible();
      await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");
      await expect(page.getByTestId("media-grid")).toBeVisible();
      await expect(page.getByTestId("media-grid").getByText(target.filename).first()).toBeVisible({
        timeout: 10_000,
      });

      // Switch to table — the seeded asset must be a real data row, not just a shell.
      await tableBtn.click();
      await expect(tableBtn).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
      await expect(gridBtn).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByTestId("media-table")).toBeVisible({ timeout: 10_000 });
      await expect(
        page
          .getByTestId("media-table")
          .getByText(target.filename)
          .filter({ visible: true })
          .first(),
      ).toBeVisible({
        timeout: 10_000,
      });

      // Switch back to grid.
      await gridBtn.click();
      await expect(gridBtn).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
      await expect(page.getByTestId("media-grid").getByText(target.filename).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId("media-gallery-content")).toHaveAttribute("data-view", "grid");
    } finally {
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });

  test("uploads CSV and PDF assets with document previews", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const csvName = `e2e-preview-${stamp}.csv`;
    const pdfName = `e2e-preview-${stamp}.pdf`;
    const csv = Buffer.from("name;amount;date\nAcme;1234.50;2026-01-02\nBeta;99.00;2026-02-03\n");

    const upload = async (name: string, mimeType: string, buffer: Buffer) => {
      const responsePromise = page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          (res.url().includes("?/upload") || res.url().includes("/api/media")),
        { timeout: 30_000 },
      );
      await page.getByTestId("media-upload-input").setInputFiles({ name, mimeType, buffer });
      const response = await responsePromise;
      expect(response.ok(), `${mimeType} upload: ${response.status()}`).toBe(true);

      const card = page.getByTestId("media-item").filter({ hasText: name }).first();
      await expect(card).toBeVisible({ timeout: 25_000 });
      return { card, id: await card.getAttribute("data-media-id") };
    };

    const csvRow = await upload(csvName, "text/csv", csv);
    const pdfRow = await upload(pdfName, "application/pdf", makeMinimalPdf());
    try {
      for (const row of [csvRow, pdfRow]) {
        // The tile renders a generated preview image instead of the generic
        // file icon, and the URL is a real rendition — not the document itself.
        const preview = row.card.locator("img").first();
        await expect(preview).toBeVisible({ timeout: 15_000 });
        await expect(preview).toHaveAttribute("src", /\/files\/.+\/(thumbnail|sm|md)\//);
      }
    } finally {
      await deleteMediaRow(page, csvRow.id ?? undefined);
      await deleteMediaRow(page, pdfRow.id ?? undefined);
    }
  });

  test("can upload an image and verify it persists", async ({ page }) => {
    const filename = `e2e-upload-${Date.now().toString(36)}.png`;
    const row = await uploadUniqueImage(page, filename);
    try {
      await expect(page.getByText(filename).first()).toBeVisible({ timeout: 15_000 });

      // Create → reload → assert: the card comes back from the API, not local state.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(
        page.getByTestId("media-item").filter({ hasText: filename }).first(),
      ).toBeVisible({
        timeout: 25_000,
      });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("can delete an uploaded asset via grid action menu", async ({ page }) => {
    const filename = `e2e-delete-${Date.now().toString(36)}.png`;
    const row = await uploadUniqueImage(page, filename);
    const mediaId = String(row._id);

    try {
      const item = page.locator(`[data-media-id="${mediaId}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });

      const deleteBtn = actions.getByLabel(`Delete ${filename}`).first();
      await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
      await deleteBtn.click();

      const dialog = page.locator("dialog[open]").first();
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog
        .getByTestId("modal-confirm")
        .or(dialog.getByRole("button", { name: /confirm|delete/i }))
        .first()
        .click();

      // Outcome 1: the specific item disappears from the grid.
      await expect(item).toHaveCount(0, { timeout: 15_000 });
      await expect(dialog).not.toBeVisible({ timeout: 10_000 });

      // Outcome 2: the row is gone on the server too — reload and assert the
      // card does not come back. (The media list API response shape is not a
      // reliable oracle here; the rendered gallery is.)
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(mediaCard(page, filename)).toHaveCount(0, { timeout: 25_000 });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("advanced search filters by filename and restores all items", async ({ page }) => {
    const seeded = await seedMediaWithMetadata(page);
    const [canon, nikon] = seeded.items;
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(
        page.getByTestId("media-item").filter({ hasText: canon!.filename }).first(),
      ).toBeVisible({ timeout: 25_000 });

      const searchBtn = page.getByTestId("media-advanced-search");
      await expect(searchBtn).toBeVisible({ timeout: 5_000 });
      await searchBtn.click();

      const modal = page
        .getByRole("dialog")
        .filter({ hasText: /advanced search/i })
        .first();
      await expect(modal).toBeVisible({ timeout: 5_000 });

      await modal.getByLabel("Filename", { exact: true }).fill(canon!.filename);
      await modal.getByRole("button", { name: /^search$/i }).click();
      await expect(modal).not.toBeVisible({ timeout: 5_000 });

      // Outcome: only the matching asset remains in the grid.
      await expect(
        page.getByTestId("media-item").filter({ hasText: canon!.filename }).first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId("media-item").filter({ hasText: nikon!.filename })).toHaveCount(
        0,
      );
      await expect(page.getByTestId("media-advanced-search")).toHaveClass(/text-primary-500/);
    } finally {
      for (const item of seeded.items) await deleteMediaRow(page, item._id);
    }
  });

  test("filter by type selects IMAGE", async ({ page }) => {
    const typeFilter = page.locator("#media-type-filter");
    await expect(typeFilter).toBeVisible({ timeout: 5_000 });
    await typeFilter.selectOption({ label: "IMAGE" });
    await expect(typeFilter).toHaveValue("image");
    await expect(page.getByTestId("media-grid")).toBeVisible({ timeout: 5_000 });
  });

  test("selection mode and bulk bar appear after selecting image", async ({ page }) => {
    const row = await uploadUniqueImage(page, `e2e-select-${Date.now().toString(36)}.png`);
    try {
      const item = page.locator(`[data-media-id="${row._id}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });

      await page.getByTestId("media-selection-toggle").click();
      await expect(page.getByTestId("media-selection-toggle")).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      const label = item.locator("label").first();
      await label.click({ timeout: 5_000 });

      await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("media-bulk-count")).toContainText(/1 selected/i);
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("tooltip actions appear on hover", async ({ page }) => {
    const row = await uploadUniqueImage(page, `e2e-tips-${Date.now().toString(36)}.png`);
    try {
      const item = page.locator(`[data-media-id="${row._id}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });

      // Details / edit / delete tooltips
      await expect(actions.getByLabel(/details for/i).first()).toBeVisible({ timeout: 3_000 });
      await expect(actions.getByLabel(/edit/i).first()).toBeVisible({ timeout: 3_000 });
      await expect(actions.getByLabel(/delete/i).first()).toBeVisible({ timeout: 3_000 });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("tag editor modal opens for image", async ({ page }) => {
    const row = await uploadUniqueImage(page, `e2e-tags-${Date.now().toString(36)}.png`);
    try {
      const item = page.locator(`[data-media-id="${row._id}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });

      const tagBtn = actions.getByLabel(/tags for/i).first();
      await expect(tagBtn).toBeVisible({ timeout: 3_000 });
      await tagBtn.click();

      const modal = page.getByRole("dialog").filter({ hasText: /tag/i }).first();
      await expect(modal).toBeVisible({ timeout: 5_000 });
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible({ timeout: 5_000 });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });

  test("quick focal point action saves metadata from the grid", async ({ page }) => {
    const row = await uploadUniqueImage(page, `e2e-focal-${Date.now().toString(36)}.png`);
    const mediaId = String(row._id);
    try {
      const item = page.locator(`[data-media-id="${mediaId}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });
      await actions.getByTestId("media-focal-button").click();

      const modal = page
        .getByRole("dialog")
        .filter({ hasText: /set focal point/i })
        .first();
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // Keyboard steps are deterministic: two right + one down from the 50/50 default.
      const slider = modal.getByRole("slider", { name: /focal point position/i });
      await slider.focus();
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowDown");

      const patch = page.waitForResponse(
        (res) => res.url().includes(`/api/media/${mediaId}`) && res.request().method() === "PATCH",
        { timeout: 15_000 },
      );
      await modal.getByRole("button", { name: /^save$/i }).click();
      expect((await patch).status()).toBe(200);

      // Outcome: the persisted metadata moved, not just a toast.
      await expect(async () => {
        const res = await page.request.get(`/api/media/${mediaId}`);
        const body = (await res.json()) as {
          data?: { metadata?: { focalPoint?: { x: number; y: number } } };
        };
        const focal = body.data?.metadata?.focalPoint;
        expect(focal?.x).toBeGreaterThan(50);
        expect(focal?.y).toBeGreaterThan(50);
      }).toPass({ timeout: 15_000 });
    } finally {
      await deleteMediaRow(page, mediaId);
    }
  });

  test("create folder via New Folder prompt", async ({ page }) => {
    const folderName = `e2e-test-folder-${Date.now().toString(36)}`;
    let folderId = "";
    try {
      const createBtn = page.getByTestId("media-create-folder");
      await expect(createBtn).toBeVisible({ timeout: 5_000 });
      await createBtn.click();

      const dialog = page
        .getByRole("dialog")
        .filter({ hasNotText: /cookie|privacy/i })
        .first();
      await expect(dialog).toBeVisible({ timeout: 5_000 });
      await dialog.locator("input").first().fill(folderName);
      await dialog.getByRole("button", { name: /ok|create|confirm|save/i }).click();
      await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: 10_000 });

      // Persistence: the API must contain the folder, and a reload must show it.
      const list = await page.request.get("/api/system-virtual-folder");
      const body = await list.json();
      expect(body.success).toBe(true);
      const created = (body.data as Array<{ _id?: string; name?: string }>).find(
        (folder) => folder.name === folderName,
      );
      expect(created?._id, "folder must be persisted").toBeTruthy();
      folderId = String(created!._id);

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      await expect(page.getByText(folderName, { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      if (folderId) {
        await page.request.delete(
          `/api/system-virtual-folder?folderId=${encodeURIComponent(folderId)}`,
        );
      }
    }
  });

  test("sort dropdown changes selection", async ({ page }) => {
    const sortFilter = page.locator("#sort-by-filter");
    await expect(sortFilter).toBeVisible({ timeout: 5_000 });

    await sortFilter.selectOption({ label: "Oldest first" });
    await expect(sortFilter).toHaveValue("oldest");

    await sortFilter.selectOption({ label: "Newest first" });
    await expect(sortFilter).toHaveValue("newest");

    await expect(page.getByTestId("media-grid")).toBeVisible({ timeout: 5_000 });
  });

  test("advanced search exposes the JSON path filter", async ({ page }) => {
    await page.getByTestId("media-advanced-search").click();
    // The JSON-path input lives in the advanced-search dialog (it is not a
    // toolbar field), so the contract is reachable-through-the-modal, not always-on.
    await expect(page.getByTestId("media-json-path-filter")).toBeVisible({ timeout: 5_000 });
  });

  test("grid size toggle cycles the thumbnail size", async ({ page }) => {
    // One cycling control (aria-label `Grid size: <label>`), not a button group.
    const toggle = page.getByTestId("media-grid-size-toggle");
    await expect(toggle).toBeVisible({ timeout: 5_000 });

    const before = await toggle.getAttribute("data-size");
    await toggle.click();
    await expect(toggle).not.toHaveAttribute("data-size", before ?? "");

    // Grid should still be visible
    await expect(page.getByTestId("media-grid")).toBeVisible({ timeout: 5_000 });
  });

  test("breadcrumb exists and is clickable", async ({ page }) => {
    // Create folder, then navigate into it to generate breadcrumbs
    await page.getByTestId("media-create-folder").click();
    const dialog = page
      .getByRole("dialog")
      .filter({ hasNotText: /cookie|privacy/i })
      .first();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const folderName = "e2e-bc-" + Date.now().toString(36);
    await dialog.locator("input").first().fill(folderName);
    await dialog.getByRole("button", { name: /ok|create|confirm|save/i }).click();
    await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: 10_000 });

    // Navigate into the folder. The sidebar tree refreshes asynchronously after
    // creation, so wait for the folder link before clicking, then confirm the
    // navigation actually lands inside the folder (URL gains ?folderId=).
    const folderLink = page.getByText(folderName, { exact: true }).first();
    await expect(folderLink).toBeVisible({ timeout: 15_000 });
    await folderLink.click();
    await expect(page).toHaveURL(/folderId=/, { timeout: 15_000 });

    // Breadcrumbs now show the folder as a non-root crumb.
    await expect(page.getByTestId("media-gallery-breadcrumbs").getByText(folderName)).toBeVisible({
      timeout: 10_000,
    });

    // Click root breadcrumb to go back — now rendered as a link (not the
    // current-folder span), so navigation lands back at /mediagallery.
    await page.getByTestId("media-breadcrumb-root").click();
    await expect(page).toHaveURL(/\/mediagallery$/, { timeout: 15_000 });
    await expect(page.getByTestId("media-gallery-content")).toBeVisible({ timeout: 10_000 });
  });

  test("can edit asset metadata from the details modal and persist it", async ({ page }) => {
    const filename = `e2e-meta-${Date.now().toString(36)}.png`;
    const row = await uploadUniqueImage(page, filename);
    const renamed = `renamed-${Date.now().toString(36)}`;

    try {
      const item = page.locator(`[data-media-id="${row._id}"]`);
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.hover();

      const actions = item.getByTestId("media-grid-actions").first();
      await expect(actions).toBeVisible({ timeout: 5_000 });

      // Keep the image-editor entry point covered.
      await expect(actions.getByTestId("media-edit-button")).toBeVisible({ timeout: 3_000 });

      await actions.getByLabel(`Details for ${filename}`).first().click();
      const modal = page.getByTestId("media-details-modal");
      await expect(modal).toBeVisible({ timeout: 10_000 });

      const nameEdit = modal.getByRole("button", { name: /edit asset name/i }).first();
      await expect(nameEdit).toBeVisible({ timeout: 5_000 });
      await nameEdit.click();

      const patch = page.waitForResponse(
        (res) => res.request().method() === "PATCH" && res.url().includes(`/api/media/${row._id}`),
        { timeout: 15_000 },
      );
      const nameInput = modal.getByRole("textbox").first();
      await nameInput.fill(renamed);
      const res = await patch;
      expect(res.ok(), `PATCH ${res.status()} ${res.url()}`).toBe(true);

      // Persistence: reload, reopen details, and read the saved name back.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      const reloadedItem = page.locator(`[data-media-id="${row._id}"]`);
      await expect(reloadedItem).toBeVisible({ timeout: 25_000 });
      await reloadedItem.hover();
      await reloadedItem
        .getByTestId("media-grid-actions")
        .first()
        .getByLabel(`Details for ${filename}`)
        .first()
        .click();
      await expect(page.getByTestId("media-details-modal")).toContainText(renamed, {
        timeout: 10_000,
      });
    } finally {
      await deleteMediaRow(page, row._id);
    }
  });
});
