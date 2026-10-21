/**
 * @file tests/e2e/routes/mediagallery/media-widget.spec.ts
 * @description Media picker + Media widget round-trip.
 *
 * Pins the regressions reported in the 2026-10-21 recording:
 *
 * | Reported symptom                                              | Pinned here                     |
 * | ------------------------------------------------------------- | ------------------------------- |
 * | `/api/media/:id` envelope read as the document (broken preview) | edit + list image assertions  |
 * | uploaded file preview differs from the gallery (label/size)   | local-upload preview labels     |
 * | library tile click does not select / confirm                  | select → confirm round-trip     |
 * | saved media not shown in the entry list                       | reload + list `<img>` assertion |
 * | "Failed to load folders" toast on the gallery                 | folder-tree smoke               |
 *
 * The collection fixture is seeded through `POST /api/testing`
 * (`create-collection`); the asset is uploaded through the real gallery input
 * and attached through the real create → picker → save journey.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";
import { TEST_API_HEADERS } from "../../helpers/api";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";
import {
  deleteMediaRow,
  openMediaGallery,
  uniquePng,
  uploadUniqueImage,
} from "../../helpers/media";

test.describe.configure({ mode: "serial", timeout: 180_000 });

function collectionUrl(collectionId: string, query = "") {
  return `/en/collection/${collectionId}${query}`;
}

type CollectionField = Record<string, unknown>;

async function seedCollection(
  page: Page,
  fields: CollectionField[],
  prefix = "e2e_media",
): Promise<{ collectionId: string }> {
  const collectionId = `${prefix}_${Date.now().toString(36)}`;
  const response = await page.request.post("/api/testing", {
    headers: TEST_API_HEADERS,
    data: {
      action: "create-collection",
      schema: {
        _id: collectionId,
        name: collectionId,
        path: `/collection/${collectionId}`,
        fields,
      },
    },
  });
  expect(response.ok(), `create-collection failed: ${response.status()}`).toBeTruthy();
  return { collectionId };
}

async function seedMediaCollection(page: Page): Promise<{ collectionId: string }> {
  return seedCollection(page, [
    { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
    {
      db_fieldName: "images",
      label: "Images",
      widget: { Name: "MediaUpload" },
      type: "string",
      multiupload: true,
    },
  ]);
}

/** Wait for an `<img>` to decode; a broken src leaves naturalWidth at 0. */
async function expectImageLoaded(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      async () =>
        locator.evaluate((img) => {
          const el = img as HTMLImageElement;
          return el.complete && el.naturalWidth > 0;
        }),
      { timeout: 20_000, intervals: [250, 500, 1_000] },
    )
    .toBe(true);
}

async function fetchEntryId(page: Page, collectionId: string, title: string): Promise<string> {
  const res = await page.request.get(
    `/api/collections/${collectionId}?publicationFilter=all&bypassCache=true&limit=100`,
  );
  if (!res.ok()) return "";
  const body = await res.json().catch(() => ({}));
  const rows = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.data?.items)
      ? body.data.items
      : [];
  return String(rows.find((row: { title?: string }) => row.title === title)?._id ?? "");
}

/**
 * Enter create mode through the deep link the Create button produces.
 * Using `?create=true` directly also exercises the SSR create path.
 */
async function openCreateForm(
  page: Page,
  collectionId: string,
  label: RegExp = /^title$/i,
): Promise<Locator> {
  await page.goto(collectionUrl(collectionId, "?create=true"), {
    waitUntil: "domcontentloaded",
  });
  await waitForHydration(page);

  const fieldBox = page.getByRole("textbox", { name: label }).first();
  await expect(fieldBox).toBeVisible({ timeout: 25_000 });
  return fieldBox;
}

test.describe("Media widget + picker", () => {
  test.beforeEach(async ({ page }) => {
    await seedCookieConsent(page);
    await loginAsAdmin(page);
    await dismissCookieConsent(page);
  });

  test("gallery folder tree loads without the error toast", async ({ page }) => {
    await openMediaGallery(page);

    await expect(page.getByText("Media Root").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Failed to load folders")).toHaveCount(0);
  });

  test("media picked in the library persists to the entry list", async ({ page }) => {
    const { collectionId } = await seedMediaCollection(page);

    // Real bytes through the gallery toolbar — the card exposes its DB id.
    await openMediaGallery(page);
    const filename = `e2e-widget-${Date.now().toString(36)}.png`;
    const uploaded = await uploadUniqueImage(page, filename);
    const title = `e2e media entry ${Date.now().toString(36)}`;

    let entryId = "";
    try {
      const titleBox = await openCreateForm(page, collectionId);
      await titleBox.fill(title);
      await titleBox.blur();

      // 1. Pick the uploaded asset through the real modal.
      const addMedia = page.getByRole("button", { name: /add media|change media/i }).first();
      await expect(addMedia).toBeVisible({ timeout: 20_000 });
      await addMedia.click();

      const modal = page.getByTestId("media-library-modal");
      await expect(modal).toBeVisible({ timeout: 20_000 });

      // Picker search + type filter (new picker improvements).
      const search = modal.getByTestId("media-library-search");
      await search.fill("definitely-no-such-asset");
      await expect(modal.getByTestId("media-library-empty")).toBeVisible();
      await search.fill("");
      await modal.getByTestId("media-library-type-image").click();

      const item = modal.getByTestId("media-library-item").filter({ hasText: filename }).first();
      await expect(item).toBeVisible({ timeout: 20_000 });
      await item.click();
      await expect(item).toHaveAttribute("aria-pressed", "true");

      await modal.getByTestId("media-library-select").click();
      await expect(modal).toBeHidden({ timeout: 10_000 });

      // 2. The widget immediately shows a decoded preview (no broken envelope).
      await expectImageLoaded(page.getByTestId("media-widget-preview").first());

      // 3. Save → back to the list.
      const save = page.getByRole("button", { name: /^save$/i }).first();
      await expect(save).toBeEnabled({ timeout: 15_000 });
      await save.click();
      await expect(page).toHaveURL(new RegExp(`/collection/${collectionId}(?:\\?|$)`), {
        timeout: 25_000,
      });

      // 4. The Images column renders the real thumbnail.
      const row = page.locator("tbody tr").filter({ hasText: title }).first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expectImageLoaded(row.locator("img").first());

      // 5. Reload → the server-rendered row still resolves the thumbnail.
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForHydration(page);
      const reloadedRow = page.locator("tbody tr").filter({ hasText: title }).first();
      await expect(reloadedRow).toBeVisible({ timeout: 20_000 });
      await expectImageLoaded(reloadedRow.locator("img").first());

      // 6. Edit mode hydrates the same asset through `/api/media/:id`.
      await expect
        .poll(
          async () => {
            entryId = await fetchEntryId(page, collectionId, title);
            return entryId;
          },
          { timeout: 30_000, intervals: [500, 1_000] },
        )
        .not.toBe("");

      await page.goto(collectionUrl(collectionId, `?edit=${entryId}`), {
        waitUntil: "domcontentloaded",
      });
      await waitForHydration(page);
      await expectImageLoaded(page.getByTestId("media-widget-preview").first());
    } finally {
      if (entryId) {
        await page.request.post("/api/testing", {
          headers: TEST_API_HEADERS,
          data: { action: "delete", collectionId, id: entryId },
        });
      }
      await deleteMediaRow(page, uploaded._id);
    }
  });

  test("create form survives a Team-like schema (repeater + rich text + media)", async ({
    page,
  }) => {
    const { collectionId } = await seedCollection(
      page,
      [
        {
          db_fieldName: "name",
          label: "Name",
          widget: { Name: "Input" },
          type: "string",
          required: true,
        },
        {
          db_fieldName: "role",
          label: "Role",
          widget: { Name: "Input" },
          type: "string",
          required: true,
        },
        { db_fieldName: "bio", label: "Bio", widget: { Name: "RichText" }, type: "string" },
        { db_fieldName: "photo", label: "Photo", widget: { Name: "MediaUpload" }, type: "string" },
        {
          db_fieldName: "social",
          label: "Social Links",
          widget: { Name: "Repeater" },
          type: "object",
          fields: [
            {
              db_fieldName: "label",
              label: "Label",
              widget: { Name: "Input" },
              type: "string",
            },
            {
              db_fieldName: "url",
              label: "URL",
              widget: { Name: "Input" },
              type: "string",
            },
          ],
        },
      ],
      "e2e_team",
    );

    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    const nameBox = await openCreateForm(page, collectionId, /^name$/i);
    await nameBox.fill("Ada Lovelace");
    await nameBox.blur();

    // The repeater must remain interactive — an effect loop would replace the
    // page with the 500 boundary before this button could be clicked.
    const addItem = page.getByRole("button", { name: /add item/i }).first();
    await expect(addItem).toBeVisible({ timeout: 15_000 });
    await addItem.click();
    await expect(page.getByRole("textbox", { name: /^label$/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    expect(
      consoleErrors.filter((message) => message.includes("effect_update_depth_exceeded")),
      `effect loop: ${consoleErrors.join("\n")}`,
    ).toEqual([]);
    await expect(page.getByText("500 — System Error")).toHaveCount(0);
  });

  test("local upload preview matches the gallery labels and renders the image", async ({
    page,
  }) => {
    const { collectionId } = await seedMediaCollection(page);

    await openCreateForm(page, collectionId);

    const addMedia = page.getByRole("button", { name: /add media|change media/i }).first();
    await expect(addMedia).toBeVisible({ timeout: 25_000 });
    await addMedia.click();

    const modal = page.getByTestId("media-library-modal");
    await expect(modal).toBeVisible({ timeout: 20_000 });

    await modal.getByRole("button", { name: /^local upload$/i }).click();

    const dropzone = page.getByTestId("media-upload-dropzone");
    await expect(dropzone).toBeVisible({ timeout: 10_000 });

    // The drop zone grows with its content (no clipped inner scrollbar).
    const dropzoneBox = await dropzone.boundingBox();
    expect(dropzoneBox?.height ?? 0).toBeGreaterThan(180);

    const file = await uniquePng("e2e-preview.png");
    await dropzone.locator('input[type="file"]').setInputFiles(file);

    const queued = page.getByTestId("media-upload-queued").first();
    await expect(queued).toBeVisible({ timeout: 10_000 });

    const preview = queued.getByTestId("media-upload-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute("src", /^blob:/);
    await expect
      .poll(async () =>
        preview.evaluate((img) => {
          const el = img as HTMLImageElement;
          return el.complete && el.naturalWidth > 0;
        }),
      )
      .toBe(true);

    // Same labels the gallery tile uses: MIME subtype + a formatted size.
    await expect(queued.getByText("PNG", { exact: true })).toBeVisible();
    await expect(queued.getByText(/\d+(?:\.\d+)?\s(?:Bytes|KB|MB|GB)/)).toBeVisible();

    // The "Add Files" card keeps its label inside the button box.
    const addFiles = page.getByTestId("media-upload-add-files");
    const addBox = await addFiles.boundingBox();
    const labelBox = await addFiles.locator("span").boundingBox();
    expect(addBox && labelBox && labelBox.y + labelBox.height).toBeLessThanOrEqual(
      (addBox?.y ?? 0) + (addBox?.height ?? 0) + 1,
    );

    await modal
      .locator("footer")
      .getByRole("button", { name: /^cancel$/i })
      .click();
    await expect(modal).toBeHidden({ timeout: 10_000 });
  });
});
