/**
 * @file tests/integration/api/media-tus.test.ts
 * @description Integration: TUS create → chunked PATCH → finalize → HEAD, plus
 * ownership/abort behaviour against the real preview server.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch } from "../helpers/server";
import { initializeTestEnvironment, prepareAuthenticatedContext } from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();
const TEST_API_SECRET =
  process.env.TEST_API_SECRET ||
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.TEST_API_SECRET ||
  "SVELTYCMS_TEST_SECRET_2026";

// 1×1 transparent PNG — small, valid, and sniffable.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function metadata(fields: Record<string, string>): string {
  return Object.entries(fields)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key} ${Buffer.from(value, "utf8").toString("base64")}`)
    .join(",");
}

describe("Media TUS resumable upload", () => {
  let adminCookie: string;

  beforeAll(async () => {
    await initializeTestEnvironment();
    adminCookie = await prepareAuthenticatedContext();
    expect(adminCookie.length).toBeGreaterThan(0);
  }, 120_000);

  it("creates, resumes, finalizes, and reports the offset", async () => {
    const create = await safeFetch(`${API_BASE_URL}/api/media/tus`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(PNG.length),
        "Upload-Metadata": metadata({
          filename: "tus-probe.png",
          filetype: "image/png",
          folder: "global",
        }),
      },
    });
    expect(create.status).toBe(201);
    const location = create.headers.get("location");
    expect(location).toContain("/api/media/tus/");
    expect(create.headers.get("upload-offset")).toBe("0");

    const split = Math.floor(PNG.length / 2);
    const first = await safeFetch(`${API_BASE_URL}${location}`, {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
        "Content-Type": "application/offset+octet-stream",
      },
      body: new Uint8Array(PNG.subarray(0, split)),
    });
    expect(first.status).toBe(204);
    expect(Number(first.headers.get("upload-offset"))).toBe(split);

    const head = await safeFetch(`${API_BASE_URL}${location}`, {
      method: "HEAD",
      headers: {
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
        "Tus-Resumable": "1.0.0",
      },
    });
    expect(head.status).toBe(200);
    expect(Number(head.headers.get("upload-offset"))).toBe(split);

    const second = await safeFetch(`${API_BASE_URL}${location}`, {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(split),
        "Content-Type": "application/offset+octet-stream",
      },
      body: new Uint8Array(PNG.subarray(split)),
    });
    expect(second.status).toBe(204);
    expect(Number(second.headers.get("upload-offset"))).toBe(PNG.length);

    const mediaId = second.headers.get("x-media-id");
    expect(mediaId).toBeTruthy();

    // The finalized asset is retrievable through the normal media route.
    const manifest = await safeFetch(`${API_BASE_URL}/api/media/${mediaId}`, {
      headers: { Cookie: adminCookie, "x-test-secret": TEST_API_SECRET },
    });
    expect(manifest.status).toBe(200);
    const body = await manifest.json();
    expect(JSON.stringify(body)).toContain("tus-probe.png");

    await safeFetch(`${API_BASE_URL}${location}`, {
      method: "DELETE",
      headers: {
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
        "Tus-Resumable": "1.0.0",
      },
    }).catch(() => {});

    await safeFetch(`${API_BASE_URL}/api/media/${mediaId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie, "x-test-secret": TEST_API_SECRET },
    }).catch(() => {});
  }, 120_000);

  it("advertises the TUS fallback for local storage without leaking credentials", async () => {
    const response = await safeFetch(`${API_BASE_URL}/api/media/upload-instructions`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ filename: "probe.png", mimeType: "image/png", size: 128 }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.strategy).toBe("tus");
    expect(body.data.tus.creationUrl).toBe("/api/media/tus");
    expect(body.data.completeUrl).toBe("/api/media/direct-upload/complete");
    expect(body.data.key).toMatch(/^global\/staging\//);
    expect(JSON.stringify(body)).not.toContain("X-Amz-Signature");
  });

  it("rejects a mismatched offset with 409 and the expected offset", async () => {
    const create = await safeFetch(`${API_BASE_URL}/api/media/tus`, {
      method: "POST",
      headers: {
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(PNG.length),
        "Upload-Metadata": metadata({ filename: "offset-probe.png", filetype: "image/png" }),
      },
    });
    const location = create.headers.get("location")!;

    const bad = await safeFetch(`${API_BASE_URL}${location}`, {
      method: "PATCH",
      headers: {
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "7",
        "Content-Type": "application/offset+octet-stream",
      },
      body: new Uint8Array(PNG.subarray(0, 4)),
    });
    expect(bad.status).toBe(409);
    expect(bad.headers.get("upload-offset")).toBe("0");

    await safeFetch(`${API_BASE_URL}${location}`, {
      method: "DELETE",
      headers: {
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
        "Tus-Resumable": "1.0.0",
      },
    }).catch(() => {});
  });
});
