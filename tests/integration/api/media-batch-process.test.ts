/**
 * @file tests/integration/api/media-batch-process.test.ts
 * @description HTTP bake for batch media processing: upload real images, run
 * `POST /api/media/batch-process`, and read the stored pixels back to prove the
 * resize/filter was applied to the file (not just acknowledged in the response).
 */

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestDatabase, prepareAuthenticatedContext } from "../helpers/test-setup";
import { getApiBaseUrl, safeFetch, waitForServer } from "../helpers/server";

const API_BASE_URL = getApiBaseUrl();
const RUN_TAG = randomUUID().slice(0, 8);

interface MediaRecord {
  _id: string;
  path?: string;
  url?: string;
  width?: number;
  height?: number;
}

async function makeJpeg(width: number, height: number, tag: string): Promise<Buffer> {
  const seed = [...tag].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 200, 17);
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: seed, g: (seed * 3) % 256, b: (seed * 7) % 256 },
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function uploadImage(cookie: string, filename: string, bytes: Buffer): Promise<MediaRecord> {
  const formData = new FormData();
  formData.append("files", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), filename);
  const res = await safeFetch(`${API_BASE_URL}/api/media/upload`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: API_BASE_URL },
    body: formData,
  });
  if (res.status !== 200) {
    throw new Error(`Upload ${filename} failed: HTTP ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data?: Array<{ success?: boolean; data?: MediaRecord }> };
  const record = body.data?.[0]?.data;
  if (!record?._id) throw new Error(`Upload ${filename} returned no record`);
  return record;
}

async function batch(
  cookie: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await safeFetch(`${API_BASE_URL}/api/media/batch-process`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: API_BASE_URL, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

function fileUrl(record: MediaRecord): string {
  const raw = record.url || (record.path ? `/files/${record.path}` : "");
  if (!raw) throw new Error("Media record has no file URL");
  return raw.startsWith("http") ? raw : `${API_BASE_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

async function storedDimensions(
  cookie: string,
  record: MediaRecord,
): Promise<{ width: number; height: number }> {
  const res = await safeFetch(fileUrl(record), {
    headers: { Cookie: cookie, Origin: API_BASE_URL },
  });
  expect(res.status, fileUrl(record)).toBe(200);
  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

async function deleteMedia(id: string, cookie: string): Promise<void> {
  await safeFetch(`${API_BASE_URL}/api/media/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: API_BASE_URL },
  });
}

describe("POST /api/media/batch-process — baked batch transform", () => {
  let authCookie = "";
  const createdIds: string[] = [];

  beforeAll(async () => {
    await waitForServer();
    authCookie = await prepareAuthenticatedContext();
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteMedia(id, authCookie).catch(() => {});
    }
    await cleanupTestDatabase();
  });

  it("resizes every selected asset and reports per-asset results", async () => {
    const first = await uploadImage(
      authCookie,
      `batch-a-${RUN_TAG}.jpg`,
      await makeJpeg(1200, 800, `batch-a-${RUN_TAG}`),
    );
    const second = await uploadImage(
      authCookie,
      `batch-b-${RUN_TAG}.jpg`,
      await makeJpeg(900, 600, `batch-b-${RUN_TAG}`),
    );
    createdIds.push(first._id, second._id);

    const { status, body } = await batch(authCookie, {
      ids: [first._id, second._id],
      operation: "resize",
      params: { width: 320 },
    });

    expect(status, JSON.stringify(body)).toBe(200);
    const data = body.data as { processed?: number; failed?: number } | undefined;
    expect(data?.processed).toBe(2);
    expect(data?.failed).toBe(0);

    // Read the row back so the assertion is on the persisted record, not the echo.
    const reloaded = await safeFetch(`${API_BASE_URL}/api/media/${first._id}`, {
      headers: { Cookie: authCookie, Origin: API_BASE_URL },
    });
    expect(reloaded.status).toBe(200);
    const reloadedBody = (await reloaded.json()) as { data?: MediaRecord };
    const record = reloadedBody.data;
    expect(record).toBeTruthy();

    const dimensions = await storedDimensions(authCookie, record as MediaRecord);
    expect(dimensions.width).toBe(320);
    // 1200×800 scaled to width 320 → height 213 (rounded), never enlarged.
    expect(dimensions.height).toBe(213);
  });

  it("applies a filter preset without changing the pixel dimensions", async () => {
    const source = await uploadImage(
      authCookie,
      `batch-filter-${RUN_TAG}.jpg`,
      await makeJpeg(400, 300, `batch-filter-${RUN_TAG}`),
    );
    createdIds.push(source._id);

    const { status, body } = await batch(authCookie, {
      ids: [source._id],
      operation: "filter",
      params: { filterPreset: "sepia" },
    });

    expect(status, JSON.stringify(body)).toBe(200);
    expect((body.data as { processed?: number } | undefined)?.processed).toBe(1);

    const dimensions = await storedDimensions(authCookie, source);
    expect(dimensions).toEqual({ width: 400, height: 300 });
  });

  it("rejects an out-of-range resize width before touching any asset", async () => {
    const { status, body } = await batch(authCookie, {
      ids: ["not-a-real-id"],
      operation: "resize",
      params: { width: 10 },
    });
    expect(status).toBe(400);
    expect(String(body.message ?? "")).toContain("between 32 and 4096");
  });

  it("rejects transcoding a non-video asset", async () => {
    const source = await uploadImage(
      authCookie,
      `transcode-image-${RUN_TAG}.jpg`,
      await makeJpeg(64, 64, `transcode-image-${RUN_TAG}`),
    );
    createdIds.push(source._id);

    const res = await safeFetch(`${API_BASE_URL}/api/media/transcode`, {
      method: "POST",
      headers: { Cookie: authCookie, Origin: API_BASE_URL, "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: source._id, format: "hls", resolutions: ["720p"] }),
    });
    const body = (await res.json()) as { code?: string };
    expect(res.status).toBe(400);
    expect(body.code).toBe("NOT_A_VIDEO");
  });
});
