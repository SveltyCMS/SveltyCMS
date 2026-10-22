/**
 * @file tests/e2e/routes/mediagallery/remote-ingestion.spec.ts
 * @description Remote-URL ingestion: real HTTP peer + SSRF rejection.
 *
 * The production SSRF guard blocks loopback by design, so a deterministic
 * success-path test needs a real local peer whose exact origin the server may
 * reach. The test starts an in-process PNG fixture, registers its origin through
 * the fail-closed `/api/testing` action (which delegates to the test-only
 * `allowTestEgressOrigin()`), and then drives the real remote-upload UI.
 *
 * | Case                                  | Contract                                  |
 * | ------------------------------------- | ----------------------------------------- |
 * | reachable URL                         | bytes fetched, stored row appears in gallery |
 * | cloud-metadata URL (`169.254.169.254`) | rejected; UI reports an error, no row appears |
 * | `POST /api/media/remote` (same URL)    | non-2xx                                  |
 */

import http from "node:http";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { allowTestEgressOrigin } from "../../helpers/api";
import { waitForHydration } from "../../helpers/auth";
import { deleteMediaRow, openUploadMediaPage } from "../../helpers/media";

const REMOTE_FILENAME = "remote-proof.png";
const BLOCKED_URL = "http://169.254.169.254/latest/meta-data/";

let fixtureServer: http.Server | null = null;
let fixtureOrigin = "";
let fixtureBytes: Buffer | null = null;

test.beforeAll(async () => {
  fixtureBytes = await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: { r: 12, g: 96, b: 180 },
    },
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

test.describe("Media — remote URL ingestion", () => {
  test("ingests a reachable URL and stores the fetched asset", async ({ page }) => {
    await openUploadMediaPage(page);

    // Register the exact origin this test owns. The action throws outside
    // TEST_MODE/PLAYWRIGHT_TEST and the guard widens for that origin only.
    await allowTestEgressOrigin(page, fixtureOrigin);

    await page.getByTestId("upload-tab-remote").click();
    await expect(page.getByTestId("remote-upload-panel")).toBeVisible();

    await page.getByTestId("remote-urls-input").fill(`${fixtureOrigin}/${REMOTE_FILENAME}`);

    const remoteResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/_app/remote/") ||
        res.url().includes("uploadRemoteUrls") ||
        res.url().includes("/api/media"),
      { timeout: 60_000 },
    );
    await page.getByTestId("remote-upload-submit").click();
    const response = await remoteResponse;
    expect(response.ok(), `remote query ${response.status()} ${response.url()}`).toBe(true);

    await expect(page.getByText(/Remote URLs submitted/i)).toBeVisible({ timeout: 60_000 });

    // The stored row must be visible through the gallery list, not just a toast.
    await page.goto("/mediagallery", { waitUntil: "domcontentloaded" });
    await waitForHydration(page);
    const search = page.getByRole("searchbox", { name: /search media assets/i });
    await search.fill(REMOTE_FILENAME);

    const card = page.getByTestId("media-item").filter({ hasText: REMOTE_FILENAME }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    const id = await card.getAttribute("data-media-id");
    expect(id, "remote asset must expose a data-media-id").toBeTruthy();
    await deleteMediaRow(page, id!);
  });

  test("rejects a cloud-metadata URL without storing anything", async ({ page }) => {
    await openUploadMediaPage(page);
    await page.getByTestId("upload-tab-remote").click();

    await page.getByTestId("remote-urls-input").fill(BLOCKED_URL);
    await page.getByTestId("remote-upload-submit").click();

    // The UI must report the failure (it previously showed success because the
    // server answered `success: true` even when every URL was rejected).
    await expect(
      page.getByText(/Error uploading URLs|Blocked|Could not fetch any/i).first(),
    ).toBeVisible({ timeout: 30_000 });

    // The REST ingestion endpoint is the same guard: it must not answer 2xx.
    const rest = await page.request.post("/api/media/remote", { data: { url: BLOCKED_URL } });
    expect(rest.ok(), `blocked remote POST returned ${rest.status()}`).toBe(false);
  });
});
