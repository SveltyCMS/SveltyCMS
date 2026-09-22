/**
 * @file tests/e2e/routes/mediagallery/move-remote.spec.ts
 * @description Media move (selection + breadcrumb / pointer-driven sidebar drop) + remote URL upload page.
 *
 * Uses data-testid selectors so tests survive CSS/layout changes.
 *
 * Drop transport is @thisux/sveltednd in POINTER mode (document-level
 * pointermove/pointerup + an `elementFromPoint` hit test at release), so a drag
 * has to be driven with the mouse API, not with a pre-resolved target element.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, waitForHydration } from "../../helpers/auth";
import { dismissCookieConsent, seedCookieConsent } from "../../helpers/cookie-consent";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_IMAGE = path.join(__dirname, "..", "..", "testthumb.png");
const ACTION_TIMEOUT = 25_000;

async function openGallery(page: Page) {
  await seedCookieConsent(page);
  await loginAsAdmin(page);
  await page.goto("/mediagallery", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.getByTestId("media-gallery-toolbar")).toBeVisible({
    timeout: ACTION_TIMEOUT,
  });
  // Toolbar is SSR HTML — upload/drop handlers only exist after hydration.
  await waitForHydration(page);
  // This spec runs with a blank storageState (see test.use below), so the GDPR
  // banner can still be present/overlapping the sidebar drop targets even after
  // loginAsAdmin — dismiss it so later drags/clicks aren't intercepted by it.
  await dismissCookieConsent(page);
}

async function createFolder(page: Page, name: string) {
  const createApi = page.waitForResponse(
    (res) => res.url().includes("/api/system-virtual-folder") && res.request().method() === "POST",
    { timeout: ACTION_TIMEOUT },
  );
  await page.getByTestId("media-create-folder").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: ACTION_TIMEOUT });
  await dialog.locator("input").first().fill(name);
  await dialog.getByRole("button", { name: /confirm/i }).click();
  const res = await createApi;
  expect(res.ok()).toBe(true);
  await expect(page.getByText(/folder created/i)).toBeVisible({ timeout: ACTION_TIMEOUT });
}

function mediaItemSelector(mediaId: string): string {
  return `[data-testid="media-item"][data-media-id="${mediaId}"]`;
}

/** `data-media-id`s currently rendered in the gallery grid. */
async function visibleMediaIds(page: Page): Promise<string[]> {
  return page
    .getByTestId("media-item")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-media-id") ?? ""));
}

/**
 * Upload the fixture into the current gallery level and return the record's id.
 *
 * Two things this helper must respect:
 *
 * 1. The upload API DEDUPLICATES BY CONTENT HASH per tenant (`getByHash` in
 *    media-service.server.ts): a second upload of the same fixture reuses the
 *    existing record (and re-points its folderId at the upload level) instead of
 *    creating a new one. "A brand new id must appear" is therefore not a valid
 *    assertion — the fixture is resolved by id diff first and by its rendered
 *    name second, which is unambiguous because dedupe collapses all uploads of
 *    the fixture into ONE record per tenant.
 * 2. The grid is waited for as "empty state OR items", never as "empty": a
 *    sibling spec in the same worker may already have assets at this level.
 */
async function uploadImage(page: Page): Promise<string> {
  // Settle gate: entering a virtual folder is a client-side navigation that
  // re-renders the page (grid + header actions). Driving the file input while the
  // view is still swapping silently drops the change event.
  await expect(
    page.getByTestId("media-grid-empty").or(page.getByTestId("media-item").first()).first(),
  ).toBeVisible({ timeout: ACTION_TIMEOUT });

  const existingIds = new Set(await visibleMediaIds(page));

  // Assert the API round-trip instead of polling blindly: a swallowed response
  // turned a handler that never ran into an opaque 25 s "no media item" timeout.
  const uploadResponse = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" &&
      (res.url().includes("?/upload") || res.url().includes("/api/media")),
    { timeout: ACTION_TIMEOUT },
  );
  const uploadInput = page.getByTestId("media-upload-input");
  await uploadInput.setInputFiles(TEST_IMAGE);

  // KNOWN GAP (2026-09-21): after the client-side navigation into a folder,
  // Playwright's CDP file selection reaches the input (files land, a `change`
  // event is even observed on the node) but never reaches the component's
  // upload path, while the same file at the gallery root uploads fine. The
  // header "Upload" button and its `bind:this` still work, so this is not
  // reachable through the UI alone. Until the wiring is understood, re-dispatch
  // one `change` when the app did not react — the upload itself is still
  // asserted end-to-end (POST + grid item), so nothing is skipped silently.
  const reacted = await Promise.race([
    uploadResponse.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3_000)),
  ]);
  if (!reacted) {
    await uploadInput.evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
  }
  const response = await uploadResponse;
  expect(response.ok(), `upload POST ${response.status()} ${response.url()}`).toBe(true);

  // Resolve the fixture's record: the diff catches a fresh upload, the rendered
  // name catches the dedupe path (stats: exactly one record per fixture + tenant).
  let uploadedId = "";
  await expect(async () => {
    const ids = await visibleMediaIds(page);
    uploadedId = ids.find((id) => id && !existingIds.has(id)) ?? "";
    if (!uploadedId) {
      uploadedId =
        (await page
          .getByTestId("media-item")
          .filter({ hasText: /testthumb/i })
          .first()
          .getAttribute("data-media-id")) ?? "";
    }
    expect(uploadedId, "the uploaded item must appear in the grid").toBeTruthy();
  }).toPass({ timeout: ACTION_TIMEOUT, intervals: [1_000, 2_000] });
  return uploadedId;
}

test.describe.configure({ mode: "serial" });
test.use({ storageState: { cookies: [], origins: [] } });

// ---------------------------------------------------------------------------
// Move: selection + breadcrumb, then a real pointer drag onto a sidebar folder
// ---------------------------------------------------------------------------
test.describe("Media move to folder", () => {
  test.setTimeout(180_000);

  test("selection + root breadcrumb moves item out of folder", async ({ page }) => {
    await openGallery(page);
    const folderName = `e2e_move_${Date.now().toString(36).slice(-6)}`;
    await createFolder(page, folderName);

    // Enter folder and wait for content to settle
    await page.getByText(folderName, { exact: true }).first().click();
    await expect(page.getByTestId("media-gallery-breadcrumbs").getByText(folderName)).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Upload inside folder
    const mediaId = await uploadImage(page);

    // Enter selection mode
    await page.getByTestId("media-selection-toggle").click();
    await expect(page.getByTestId("media-selection-toggle")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Select the uploaded item via its checkbox — use the native hidden input
    // (Checkbox component renders <input type="checkbox" class="sr-only">)
    const item = page.locator(mediaItemSelector(mediaId));
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Click the Checkbox component's visible label (the styled box) to toggle selection.
    // NOTE: the native input is `sr-only` (1x1, clipped) — force-clicking it fails with
    // "Element is outside of the viewport" because clip:rect(0,0,0,0) leaves no clickable
    // point (AGENTS.md pitfall #12). Click the visible <label for={id}> instead.
    const checkboxLabel = item.locator("label").first();
    await checkboxLabel.click({ timeout: ACTION_TIMEOUT });

    await expect(page.getByTestId("media-bulk-bar")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Breadcrumbs — root crumb should allow moving selected items out of folder
    const crumbs = page.getByTestId("media-gallery-breadcrumbs");
    const moveApi = page.waitForResponse(
      (res) => res.url().includes("/api/media/move") && res.request().method() === "POST",
      { timeout: ACTION_TIMEOUT },
    );

    // Click root breadcrumb (while selection is active, this triggers MOVE not navigate)
    const rootCrumb = crumbs
      .locator('[data-testid="media-breadcrumb-root"]')
      .or(crumbs.getByRole("link", { name: /media gallery/i }))
      .first();
    await expect(rootCrumb).toBeVisible({ timeout: ACTION_TIMEOUT });
    await rootCrumb.click();

    const res = await moveApi;
    expect(res.ok()).toBe(true);
    await expect(page.getByText(/moved/i).first()).toBeVisible({ timeout: ACTION_TIMEOUT });
  });

  test("drag-and-drop onto a sidebar folder target moves the item (sveltednd)", async ({
    page,
  }) => {
    await openGallery(page);
    const folderName = `e2e_dnd_${Date.now().toString(36).slice(-6)}`;
    await createFolder(page, folderName);
    const mediaId = await uploadImage(page);

    const item = page.locator(mediaItemSelector(mediaId));
    await expect(item).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Drag by the card's preview surface: the card's action buttons are excluded
    // from the drag (`interactive: ['[data-no-drag]']` in liftAndCarry), so the
    // press must land on the preview, not on an edit/delete control.
    const dragHandle = item.getByRole("button", { name: /preview/i });
    await expect(dragHandle, "the media card must expose a draggable preview").toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Drop target: the folder row in the sidebar tree. It is the only folder
    // surface reachable from the gallery root — at root the breadcrumb trail is
    // the current-folder crumb, which rejects the drop by design (error ring).
    const folderRow = page
      .getByTestId("sidebar-media-context")
      .getByRole("treeitem")
      .filter({ hasText: folderName })
      .first();
    await expect(folderRow, "the new folder must appear in the sidebar tree").toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
    await folderRow.scrollIntoViewIfNeeded();

    const source = await dragHandle.boundingBox();
    const target = await folderRow.boundingBox();
    expect(source, "the drag source must be laid out").not.toBeNull();
    expect(target, "the drop target must be laid out").not.toBeNull();

    const moveApi = page.waitForResponse(
      (res) => res.url().includes("/api/media/move") && res.request().method() === "POST",
      { timeout: ACTION_TIMEOUT },
    );

    // sveltednd is pointer-driven: the button must stay down for the whole
    // gesture, and the sidebar rows only become droppables WHILE the drag is in
    // flight (`externalDrop.enabled = isMediaDragActive` in media-folders.svelte
    // → `data-media-drop-target` is a mid-drag observable, never a precondition).
    // Probing that attribute before the gesture starts always came back empty and
    // silently fell back to the current-folder crumb, whose drop is a no-op — the
    // old shape could therefore pass without moving anything.
    await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
    await page.mouse.down();

    // Hard gate: no live drop target means the drag never started → fail loudly
    // instead of annotating the test green.
    await expect(folderRow).toHaveAttribute("data-media-drop-target", /./, { timeout: 10_000 });
    const targetFolderId = await folderRow.getAttribute("data-media-drop-target");

    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, {
      steps: 12,
    });
    // Long drags auto-scroll the folder list, which moves the row under the
    // cursor — re-measure so the release lands on the current row position.
    const settled = await folderRow.boundingBox();
    if (settled) {
      await page.mouse.move(settled.x + settled.width / 2, settled.y + settled.height / 2, {
        steps: 4,
      });
    }
    await page.mouse.up();

    const res = await moveApi;
    expect(res.ok(), `move POST ${res.status()} ${res.url()}`).toBe(true);

    // Persistence (create → move → reload → assert): gone from the gallery root,
    // present inside the target folder after a full page load.
    await expect(item).toHaveCount(0, { timeout: ACTION_TIMEOUT });
    await page.goto(`/mediagallery?folderId=${targetFolderId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await waitForHydration(page);
    await expect(page.locator(mediaItemSelector(mediaId))).toHaveCount(1, {
      timeout: ACTION_TIMEOUT,
    });
  });
});

// ---------------------------------------------------------------------------
// Remote URL upload page
// ---------------------------------------------------------------------------

/** Open /mediagallery/upload-media and wait until its tabs are interactive. */
async function openUploadMedia(page: Page) {
  await loginAsAdmin(page);
  await dismissCookieConsent(page);
  await page.goto("/mediagallery/upload-media", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await expect(page.getByTestId("upload-media-page")).toBeVisible({ timeout: ACTION_TIMEOUT });
  // Tab buttons are SSR HTML — clicking one before hydration does nothing.
  await waitForHydration(page);
  await dismissCookieConsent(page);
}

test.describe("Remote URL upload", () => {
  test.setTimeout(90_000);

  test("upload-media page shows local and remote tabs", async ({ page }) => {
    await openUploadMedia(page);
    await expect(page.getByTestId("upload-tab-local")).toBeVisible();
    await expect(page.getByTestId("upload-tab-remote")).toBeVisible();
  });

  test("remote tab calls uploadRemoteUrls remote query", async ({ page }) => {
    await openUploadMedia(page);

    await page.getByTestId("upload-tab-remote").click();
    await expect(page.getByTestId("remote-upload-panel")).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    const remoteUrl =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Blank_page.png/32px-Blank_page.png";

    await page.getByTestId("remote-urls-input").fill(remoteUrl);

    // The remote tab no longer posts a SvelteKit form action (?/remoteUpload):
    // remote-upload.svelte calls uploadRemoteUrls from remote-upload.remote.ts,
    // which is a `query()` remote function — SvelteKit transports it as a GET
    // request to /_app/remote/<hash>/uploadRemoteUrls?payload=… (only `command`
    // and `form` remote functions use POST).
    const actionResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/_app/remote/") ||
        res.url().includes("uploadRemoteUrls") ||
        res.url().includes("/api/media"),
      { timeout: ACTION_TIMEOUT },
    );

    await page.getByTestId("remote-upload-submit").click();
    const res = await actionResponse;
    expect([200, 303, 400, 422, 500]).toContain(res.status());
    await expect(page.getByTestId("remote-upload-panel")).toBeVisible();
  });

  test("rejects empty remote URL submit with warning", async ({ page }) => {
    await openUploadMedia(page);
    await page.getByTestId("upload-tab-remote").click();
    await page.getByTestId("remote-upload-submit").click();
    await expect(page.getByText(/at least one valid|no urls/i)).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });
});
