/**
 * @file tests/integration/routes/share-password.test.ts
 * @description Password-protected public share links, end to end.
 *
 * The landing page (`/share/[token]`) must flag password links, a wrong password
 * must never return bytes, and the correct password must stream the asset. The
 * link is created through the real admin endpoint, so the server hashes the
 * password with its own pepper — the test never fabricates a hash.
 *
 * ### Features:
 * - real upload (PNG) → real `POST /api/media/share/{id}` link creation
 * - page load asserted through SvelteKit's `__data.json` (devalue refs decoded)
 * - wrong password rejected without returning the asset; correct password streams it
 */

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTestDatabase,
  getApiBaseUrl,
  prepareAuthenticatedContext,
  safeFetch,
  waitForServer,
} from "../helpers/server";

const API = getApiBaseUrl();
const RUN_TAG = randomUUID().slice(0, 8);
const SHARE_PASSWORD = "correct-horse-battery";
const WRONG_PASSWORD = "wrong-horse";

interface UploadEnvelope {
  data?: Array<{ data?: { _id?: string }; message?: string; success?: boolean }>;
}

interface ShareCreateEnvelope {
  data?: { expiresAt?: string; token?: string };
  message?: string;
  success?: boolean;
}

interface DataJsonNode {
  data?: unknown[];
  type?: string;
}

interface DataJsonBody {
  nodes?: DataJsonNode[];
  type?: string;
}

interface DownloadEnvelope {
  data?: { passwordRequired?: boolean };
  message?: string;
  success?: boolean;
}

async function makePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 24, g: 96, b: 168 },
    },
  })
    .png()
    .toBuffer();
}

async function uploadPng(cookie: string): Promise<string> {
  const filename = `share-password-${RUN_TAG}.png`;
  const bytes = await makePng();
  const formData = new FormData();
  formData.append("files", new Blob([new Uint8Array(bytes)], { type: "image/png" }), filename);

  const res = await safeFetch(`${API}/api/media/upload`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: API },
    body: formData,
  });
  expect(res.status, `upload failed: ${await res.clone().text()}`).toBe(200);

  const body = (await res.json()) as UploadEnvelope;
  const mediaId = body.data?.[0]?.data?._id;
  if (!mediaId) throw new Error(`upload returned no media id: ${JSON.stringify(body)}`);
  return String(mediaId);
}

async function createPasswordLink(cookie: string, mediaId: string): Promise<string> {
  const res = await safeFetch(`${API}/api/media/share/${encodeURIComponent(mediaId)}`, {
    method: "POST",
    headers: { Cookie: cookie, Origin: API, "Content-Type": "application/json" },
    body: JSON.stringify({ password: SHARE_PASSWORD, expiryHours: 1 }),
  });
  const body = (await res.json().catch(() => ({}))) as ShareCreateEnvelope;
  expect(res.status, `share creation failed: ${JSON.stringify(body)}`).toBe(200);
  const token = body.data?.token;
  if (!token) throw new Error(`share creation returned no token: ${JSON.stringify(body)}`);
  return token;
}

/**
 * Resolve the page-load node out of SvelteKit's devalue-encoded `__data.json`.
 * Values are stored once in the node's `data` array; props hold numeric refs.
 */
function decodePageData(body: DataJsonBody): { data: unknown[]; props: Record<string, unknown> } {
  // Multiple nodes are streamed (root layout + page); pick the page node by a
  // key only the share load returns.
  const node = (body.nodes ?? []).find((candidate) => {
    const props = Array.isArray(candidate.data) ? candidate.data[0] : undefined;
    return (
      candidate.type === "data" &&
      !!props &&
      typeof props === "object" &&
      "passwordRequired" in (props as Record<string, unknown>)
    );
  });
  const data = node?.data;
  const props = data?.[0];
  if (!data || !props || typeof props !== "object") {
    throw new Error(
      `No share page-data node in __data.json: ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
  return { data, props: props as Record<string, unknown> };
}

function resolveRef(data: unknown[], value: unknown): unknown {
  return typeof value === "number" ? data[value] : value;
}

describe("Password-protected share links", () => {
  let cookie = "";
  let mediaId = "";
  let token = "";

  beforeAll(async () => {
    await waitForServer();
    cookie = await prepareAuthenticatedContext();
    expect(cookie.length).toBeGreaterThan(0);

    // Share-link hashing reads `JWT_SECRET_KEY` through the settings cache, and a
    // fresh harness process only warms that cache on a page load. Do it
    // explicitly so this suite does not depend on another suite running first.
    await safeFetch(`${API}/dashboard/__data.json?x-sveltekit-invalidated=111`, {
      headers: { Accept: "application/json", Cookie: cookie },
    });

    mediaId = await uploadPng(cookie);
    token = await createPasswordLink(cookie, mediaId);
  }, 120_000);

  afterAll(async () => {
    if (mediaId) {
      await safeFetch(`${API}/api/media/${encodeURIComponent(mediaId)}`, {
        method: "DELETE",
        headers: { Cookie: cookie, Origin: API },
      }).catch(() => undefined);
    }
    await cleanupTestDatabase().catch(() => undefined);
  });

  it("page load reports passwordRequired for the landing page", async () => {
    const query = new URLSearchParams({
      id: mediaId,
      "x-sveltekit-invalidated": "111",
    });
    const res = await safeFetch(
      `${API}/share/${encodeURIComponent(token)}/__data.json?${query.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    const text = await res.text();
    expect(res.status, text.slice(0, 300)).toBe(200);

    const body = JSON.parse(text) as DataJsonBody;
    expect(body.type).toBe("data");

    const page = decodePageData(body);
    expect(resolveRef(page.data, page.props.passwordRequired)).toBe(true);
    expect(resolveRef(page.data, page.props.token)).toBe(token);
    expect(resolveRef(page.data, page.props.mediaId)).toBe(mediaId);
  });

  it("rejects a wrong password without returning the asset", async () => {
    const query = new URLSearchParams({ id: mediaId, token, password: WRONG_PASSWORD });
    const res = await safeFetch(`${API}/api/media/share?${query.toString()}`, {
      headers: { Origin: API },
    });
    const text = await res.text();

    // The hard invariant: a wrong password never yields file bytes.
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(res.headers.get("content-type") ?? "").not.toContain("image/png");

    // Current handler: 404 `password_required`. A fixed handler may instead
    // answer 200 with `{ data: { passwordRequired: true } }` — accept either.
    if (res.status === 200) {
      const body = JSON.parse(text) as DownloadEnvelope;
      expect(body.data?.passwordRequired).toBe(true);
    } else {
      expect(res.status).toBe(404);
      expect(text).toContain("password_required");
    }
  });

  it("streams the asset for the correct password", async () => {
    const query = new URLSearchParams({ id: mediaId, token, password: SHARE_PASSWORD });
    const res = await safeFetch(`${API}/api/media/share?${query.toString()}`, {
      headers: { Origin: API },
    });
    const bytes = await res.arrayBuffer();

    expect(res.status, new TextDecoder().decode(bytes.slice(0, 300))).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("image/png");
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
