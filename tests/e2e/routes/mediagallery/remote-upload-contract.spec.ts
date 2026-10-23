/**
 * @file tests/e2e/routes/mediagallery/remote-upload-contract.spec.ts
 * @description Remote-upload panel contract: native field + no markup residue (audit F08).
 *
 * The panel used to render a stray `>` as visible button text and a raw
 * `<textarea class="textarea">` with its own dark fill instead of the shared
 * native `Textarea`. This spec pins the repaired markup and proves the route's
 * upload behaviour still runs through the primitive:
 *
 * | Contract                    | Expectation                                        |
 * | --------------------------- | -------------------------------------------------- |
 * | submit button               | accessible name is exactly "Upload URLs"           |
 * | URL field                   | native Textarea, admin input token, no legacy class |
 * | validation                  | invalid input still warns (bind:value wired)       |
 * | real upload                 | reachable fixture URL stores an asset              |
 */

import http from "node:http";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { allowTestEgressOrigin } from "../../helpers/api";
import { waitForHydration } from "../../helpers/auth";
import { deleteMediaRow, openUploadMediaPage } from "../../helpers/media";

const ACTION_TIMEOUT = 30_000;
const REMOTE_FILENAME = "remote-contract.png";

let fixtureServer: http.Server | null = null;
let fixtureOrigin = "";
let fixtureBytes: Buffer | null = null;

test.beforeAll(async () => {
  // Distinct pixel payload so the content-hash dedupe cannot reuse another spec's row.
  fixtureBytes = await sharp({
    create: { width: 18, height: 18, channels: 3, background: { r: 214, g: 36, b: 92 } },
  })
    .png()
    .toBuffer();

  fixtureServer = http.createServer((request, response) => {
    if (request.url?.startsWith(`/${REMOTE_FILENAME}`) && fixtureBytes) {
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(fixtureBytes.length),
      });
      response.end(fixtureBytes);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  await new Promise<void>((resolve, reject) => {
    fixtureServer!.once("error", reject);
    fixtureServer!.listen(0, "127.0.0.1", () => resolve());
  });

  const address = fixtureServer.address();
  if (!address || typeof address === "string") throw new Error("fixture server has no port");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!fixtureServer) return;
  await new Promise<void>((resolve) => fixtureServer!.close(() => resolve()));
});

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("Media — remote upload panel", () => {
  test("uses the native field, drops the stray markup and still uploads", async ({ page }) => {
    await openUploadMediaPage(page);
    await page.getByTestId("upload-tab-remote").click();
    await expect(page.getByTestId("remote-upload-panel")).toBeVisible();

    // F08a: the button's children are exactly its label — no leading ">".
    const submit = page.getByTestId("remote-upload-submit");
    await expect(submit).toHaveText("Upload URLs");
    await expect(page.getByRole("button", { name: "Upload URLs", exact: true })).toBeVisible();

    // F08b: native Textarea — keeps the route's id/label wiring and the shared token.
    const field = page.getByTestId("remote-urls-input");
    await expect(field).toHaveAttribute("id", "remote-urls");
    await expect(field).toHaveAccessibleName(/remote media urls/i);
    // The visible route label still points at the field.
    await expect(page.locator('label[for="remote-urls"]')).toContainText(/remote/i);
    const fieldClasses = (await field.getAttribute("class")) ?? "";
    expect(fieldClasses, "legacy `.textarea` class must not return").not.toMatch(
      /(^|\s)textarea(\s|$)/,
    );
    const backgroundIsAdminInput = await field.evaluate((element) => {
      // Custom properties inherit, so the element reports the token it renders with.
      const token = getComputedStyle(element).getPropertyValue("--admin-bg-input").trim();
      const probe = document.createElement("div");
      probe.style.backgroundColor = token;
      // Same subtree as the field so the token resolves in the same scope.
      (element.parentElement ?? document.body).appendChild(probe);
      const tokenBackground = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { actual: getComputedStyle(element).backgroundColor, expected: tokenBackground };
    });
    expect(backgroundIsAdminInput.actual).toBe(backgroundIsAdminInput.expected);

    // Binding still reaches the parser: an invalid line must warn, not upload.
    await field.fill("not-a-url");
    await submit.click();
    await expect(page.getByText(/Enter at least one valid http\(s\) URL/i)).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    // Route-specific behaviour: a reachable URL is fetched and stored.
    await allowTestEgressOrigin(page, fixtureOrigin);
    await field.fill(`${fixtureOrigin}/${REMOTE_FILENAME}`);
    await submit.click();
    await expect(page.getByText(/Remote URLs submitted/i)).toBeVisible({ timeout: 60_000 });

    // Cleanup through the gallery list so later specs see an unchanged folder.
    await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    await page.getByRole("searchbox", { name: /search media assets/i }).fill(REMOTE_FILENAME);
    const card = page.getByTestId("media-item").filter({ hasText: REMOTE_FILENAME }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const storedId = await card.getAttribute("data-media-id");
    expect(storedId, "the remote asset must be stored under its filename").toBeTruthy();
    await deleteMediaRow(page, storedId!);
  });
});
