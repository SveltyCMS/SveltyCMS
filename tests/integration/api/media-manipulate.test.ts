/**
 * @file tests/integration/api/media-manipulate.test.ts
 * @description HTTP bake for the image editor: upload a real image, POST /api/media/manipulate,
 * and read the stored file back. Auth and empty-body cases stay in media.test.ts.
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
  hash?: string;
  metadata?: { focalPoint?: { x: number; y: number }; width?: number; height?: number };
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
    .jpeg({ quality: 80 })
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
  const body = (await res.json()) as {
    data?: Array<{ success?: boolean; data?: MediaRecord }>;
  };
  const record = body.data?.[0]?.data;
  if (!record?._id) throw new Error(`Upload ${filename} returned no record`);
  return record;
}

function fileUrl(record: MediaRecord): string {
  const raw = record.url || (record.path ? `/files/${record.path}` : "");
  if (!raw) throw new Error("Media record has no file URL");
  return raw.startsWith("http") ? raw : `${API_BASE_URL}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

async function manipulate(
  cookie: string,
  id: string,
  manipulations: Record<string, unknown>,
): Promise<MediaRecord> {
  const res = await safeFetch(`${API_BASE_URL}/api/media/manipulate/${id}`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      Origin: API_BASE_URL,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ manipulations }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  const body = (await res.json()) as { success?: boolean; data?: MediaRecord };
  expect(body.success).toBe(true);
  if (!body.data?._id) throw new Error("Manipulate returned no media record");
  return body.data;
}

async function readPixels(
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
  const res = await safeFetch(`${API_BASE_URL}/api/media/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: API_BASE_URL },
  });
  expect(res.status, `DELETE /api/media/${id}`).toBe(200);
}

describe("POST /api/media/manipulate — baked image", () => {
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

  it("rotates the file and stores a fractional focal point as a percent", async () => {
    const source = await uploadImage(
      authCookie,
      `edit-rotate-${RUN_TAG}.jpg`,
      await makeJpeg(80, 40, `rotate-${RUN_TAG}`),
    );
    createdIds.push(source._id);

    const saved = await manipulate(authCookie, source._id, {
      rotation: 90,
      saveBehavior: "overwrite",
      focalPoint: { x: 0.25, y: 0.5 },
    });
    expect(saved.metadata?.focalPoint).toEqual({ x: 25, y: 50 });

    const loaded = await safeFetch(`${API_BASE_URL}/api/media/${source._id}`, {
      headers: { Cookie: authCookie, Origin: API_BASE_URL },
    });
    expect(loaded.status).toBe(200);
    const body = (await loaded.json()) as { data?: MediaRecord };
    expect(body.data?.metadata?.focalPoint).toEqual({ x: 25, y: 50 });
    expect(await readPixels(authCookie, saved)).toEqual({ width: 40, height: 80 });
  });

  it("crops the stored file and keeps an integer focal percent", async () => {
    const source = await uploadImage(
      authCookie,
      `edit-crop-${RUN_TAG}.jpg`,
      await makeJpeg(80, 40, `crop-${RUN_TAG}`),
    );
    createdIds.push(source._id);

    const saved = await manipulate(authCookie, source._id, {
      saveBehavior: "overwrite",
      crop: { x: 8, y: 4, width: 32, height: 16, shape: "rect" },
      focalPoint: { x: 1, y: 1 },
    });
    expect(saved.metadata?.focalPoint).toEqual({ x: 1, y: 1 });
    expect(await readPixels(authCookie, saved)).toEqual({ width: 32, height: 16 });
  });
});
