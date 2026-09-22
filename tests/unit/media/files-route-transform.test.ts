/**
 * @file tests/unit/media/files-route-transform.test.ts
 * @description Route-level unit tests for cached on-demand transforms on the
 * `/files/**` delivery route (`src/routes/files/[...path]/+server.ts`).
 *
 * Runs the real route handler against a real temp media folder (storage adapter +
 * variant store unmodified) with Sharp mocked, so it verifies the contract end to end:
 * - cache hit → served from disk with variant ETag/`Vary`, no encoder work
 * - cache miss → generated once (single-flight), written to the variant path, then served
 * - encoder failure / oversized source / animated source / non-raster source → original
 * - out-of-range or absent params → original (never an arbitrary resolution)
 * - tenant gate still precedes the transform; `Range`/`304` behaviour is unchanged
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { mkdir, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Mock } from "vitest";
import {
  MAX_CONCURRENT_TRANSFORMS,
  MAX_TRANSFORM_SOURCE_BYTES,
  TRANSFORM_DIMENSION_STEPS,
} from "@src/services/media/image-processor";
import { getTransformVariantRelPath } from "@src/services/media/image-variant-storage";
import { getPublicSettingSync } from "@src/services/core/settings-service";

// ─── Media sandbox ──────────────────────────────────────────────────────────

const MEDIA_DIR = path.join(os.tmpdir(), `sveltycms-files-transform-${process.pid}-${Date.now()}`);
const PREVIOUS_MEDIA_FOLDER = process.env.MEDIA_FOLDER;
process.env.MEDIA_FOLDER = MEDIA_DIR;

const TENANT = "global";
const HASH = "a".repeat(64);
const SOURCE_REL = `${TENANT}/${HASH}/original/pic-${HASH}.jpg`;
const SOURCE_BYTES = Buffer.from("original-image-bytes-original-image-bytes", "utf-8");
const GENERATED_BYTES = Buffer.from("generated-variant-bytes", "utf-8");

// ─── Mutable feature flags for the mocked import chain ──────────────────────

let multiTenantEnabled = false;
vi.mock("@utils/tenant-isolation.server", () => ({
  isMultiTenantEnabled: () => multiTenantEnabled,
  withTenant: async (_tenantId: unknown, operation: () => Promise<unknown>) => operation(),
}));

// ─── Sharp mock ─────────────────────────────────────────────────────────────

interface SharpChainMock {
  metadata: Mock;
  toBuffer: Mock;
  rotate: Mock;
  resize: Mock;
  webp: Mock;
  jpeg: Mock;
  avif: Mock;
  png: Mock;
}

function createSharpChain(): SharpChainMock {
  const chain = {
    metadata: vi.fn(async () => ({ width: 1920, height: 1080, format: "jpeg", pages: 1 })),
    toBuffer: vi.fn(async () => Buffer.from(GENERATED_BYTES)),
  } as Partial<SharpChainMock> as SharpChainMock;
  for (const method of ["rotate", "resize", "webp", "jpeg", "avif", "png"] as const) {
    chain[method] = vi.fn(() => chain) as unknown as Mock;
  }
  return chain;
}

/**
 * One chain instance for the whole file: `getSharp()` may cache the resolved module, so a
 * per-test chain cannot be assumed to be the one the route uses. Encoder work is counted on
 * `toBuffer` — the last step of the pipeline — which is exactly what must not repeat.
 */
const sharpChain = createSharpChain();
const sharpFactory = vi.fn(() => sharpChain);
vi.mock("sharp", () => ({ default: sharpFactory }));

/** Number of encoder invocations since the last reset (see `resetSharp`) . */
function encodeCount(): number {
  return (sharpChain.toBuffer as Mock).mock.calls.length;
}

function resetSharp(): void {
  (sharpChain.toBuffer as Mock).mockReset();
  (sharpChain.toBuffer as Mock).mockImplementation(async () => Buffer.from(GENERATED_BYTES));
  for (const method of ["rotate", "resize", "webp", "jpeg", "avif", "png"] as const) {
    (sharpChain[method] as Mock).mockClear();
  }
  sharpFactory.mockClear();
}

// Import AFTER the mocks so the route picks up the mocked Sharp + tenant flag.
import { GET } from "@src/routes/files/[...path]/+server";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Minimal RequestEvent — a real `Request` so `signal`, headers and Range work. */
function fileEvent(
  relativePath: string,
  query = "",
  headers: Record<string, string> = {},
  tenantId: string | null = "t1",
): RequestEvent {
  const url = `http://localhost/files/${relativePath}${query}`;
  return {
    request: new Request(url, { method: "GET", headers }),
    url: new URL(url),
    params: { path: relativePath },
    locals: { tenantId },
  } as unknown as RequestEvent;
}

async function readBody(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

async function variantPathFor(
  width: number,
  format: string,
  height = 0,
  quality = 82,
  tenant = TENANT,
): Promise<string> {
  return path.join(
    MEDIA_DIR,
    getTransformVariantRelPath(HASH, { width, height, quality, format }, tenant),
  );
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Writes a source file inside the sandbox (parent dirs created on demand). */
async function writeSource(relativePath: string, bytes: Buffer): Promise<string> {
  const absolute = path.join(MEDIA_DIR, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
  return absolute;
}

beforeAll(async () => {
  await writeSource(SOURCE_REL, SOURCE_BYTES);
});

beforeEach(() => {
  resetSharp();
});

afterAll(async () => {
  await rm(MEDIA_DIR, { recursive: true, force: true });
  if (PREVIOUS_MEDIA_FOLDER === undefined) delete process.env.MEDIA_FOLDER;
  else process.env.MEDIA_FOLDER = PREVIOUS_MEDIA_FOLDER;
});

// ─── Variant cache layout ───────────────────────────────────────────────────

describe("/files on-demand transform — cache layout", () => {
  it("keys the variant by tenant, source hash, width, height, quality and format", () => {
    const relPath = getTransformVariantRelPath(
      HASH,
      { width: 320, height: 0, quality: 82, format: "webp" },
      "tenant-a",
    );
    expect(relPath).toBe(`tenant-a/${HASH}/variants/t0q82-320.webp`);
    // No signature / query material may ever appear in the key.
    expect(relPath).not.toContain("sig");
    expect(relPath).not.toContain("?");
  });
});

// ─── (d) cache-hit path ─────────────────────────────────────────────────────

describe("/files on-demand transform — cache hit", () => {
  it("serves the stored variant without invoking the encoder", async () => {
    const variantPath = await variantPathFor(320, "jpeg");
    await mkdir(path.dirname(variantPath), { recursive: true });
    await writeFile(variantPath, GENERATED_BYTES);

    const response = await GET(fileEvent(SOURCE_REL, "?w=320"));

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual(GENERATED_BYTES);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-media-transform")).toBe("w320h0q82.jpeg");
    // Format depends on Accept → caches must key on it.
    expect(response.headers.get("vary")).toBe("Accept");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(encodeCount()).toBe(0);
  });

  it("revalidates with the variant ETag (304, still no encoder work)", async () => {
    const variantPath = await variantPathFor(384, "jpeg");
    await mkdir(path.dirname(variantPath), { recursive: true });
    await writeFile(variantPath, GENERATED_BYTES);

    const first = await GET(fileEvent(SOURCE_REL, "?w=384"));
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    await readBody(first);

    const revalidated = await GET(
      fileEvent(SOURCE_REL, "?w=384", { "if-none-match": etag as string }),
    );
    expect(revalidated.status).toBe(304);
    expect(encodeCount()).toBe(0);
  });
});

// ─── Cache miss / single-flight ─────────────────────────────────────────────

describe("/files on-demand transform — generation", () => {
  it("generates once, persists the variant and serves it", async () => {
    const response = await GET(fileEvent(SOURCE_REL, "?w=480&q=80"));

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual(GENERATED_BYTES);
    expect(encodeCount()).toBe(1);

    const variantPath = await variantPathFor(480, "jpeg", 0, 80);
    expect(await fileExists(variantPath)).toBe(true);
    expect(await readFile(variantPath)).toEqual(GENERATED_BYTES);

    // Second request → cache hit, no further encoding.
    const second = await GET(fileEvent(SOURCE_REL, "?w=480&q=80"));
    expect(second.status).toBe(200);
    await readBody(second);
    expect(encodeCount()).toBe(1);
  });

  it("coalesces concurrent cold requests into a single generation", async () => {
    (sharpChain.toBuffer as Mock).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return Buffer.from(GENERATED_BYTES);
    });

    const responses = await Promise.all([
      GET(fileEvent(SOURCE_REL, "?w=640")),
      GET(fileEvent(SOURCE_REL, "?w=640")),
      GET(fileEvent(SOURCE_REL, "?w=640")),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await readBody(response)).toEqual(GENERATED_BYTES);
    }
    expect(encodeCount()).toBe(1);
  });

  it("bounds concurrent generation of distinct variants (queue cap)", async () => {
    // Slow every encode so all requests overlap; distinct widths → distinct variants,
    // so single-flight cannot collapse them and the process-wide cap must apply.
    (sharpChain.toBuffer as Mock).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return Buffer.from(GENERATED_BYTES);
    });

    const widths = TRANSFORM_DIMENSION_STEPS.slice(-12);
    const responses = await Promise.all(
      widths.map((width) => GET(fileEvent(SOURCE_REL, `?w=${width}&q=60`))),
    );

    expect(encodeCount()).toBeLessThanOrEqual(MAX_CONCURRENT_TRANSFORMS);
    for (const response of responses) {
      expect(response.status).toBe(200);
      // Over-cap requests fall back to the original instead of queueing unbounded work.
      await readBody(response);
    }
  });

  it("honours the negotiated Accept format (q-ordered, cached per format)", async () => {
    const response = await GET(
      fileEvent(SOURCE_REL, "?w=768", { accept: "image/webp, image/avif;q=0.5, */*;q=0.1" }),
    );

    expect(response.status).toBe(200);
    await readBody(response);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-media-transform")).toBe("w768h0q82.webp");
    expect(await fileExists(await variantPathFor(768, "webp"))).toBe(true);
  });

  it("writes an explicit fmt variant to its own cache entry", async () => {
    const response = await GET(fileEvent(SOURCE_REL, "?w=960&fmt=avif"));

    expect(response.status).toBe(200);
    await readBody(response);
    expect(response.headers.get("content-type")).toBe("image/avif");
    expect(await fileExists(await variantPathFor(960, "avif"))).toBe(true);
  });
});

// ─── (e) fallback-to-original ───────────────────────────────────────────────

describe("/files on-demand transform — fallbacks", () => {
  it("streams the original when the encoder fails", async () => {
    (sharpChain.toBuffer as Mock).mockRejectedValueOnce(new Error("encoder exploded"));

    const response = await GET(fileEvent(SOURCE_REL, "?w=1280"));

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual(SOURCE_BYTES);
    expect(response.headers.get("x-media-transform")).toBeNull();
    expect(await fileExists(await variantPathFor(1280, "jpeg"))).toBe(false);
    expect(encodeCount()).toBe(1); // one attempt, then the original is served
  });

  it("streams the original for sources above the buffering limit", async () => {
    const bigRel = `${TENANT}/${"b".repeat(64)}/original/big-${"b".repeat(64)}.jpg`;
    const bigPath = await writeSource(bigRel, Buffer.from("x"));
    await truncate(bigPath, MAX_TRANSFORM_SOURCE_BYTES + 1);

    const response = await GET(fileEvent(bigRel, "?w=320"));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-media-transform")).toBeNull();
    expect(response.headers.get("content-length")).toBe(String(MAX_TRANSFORM_SOURCE_BYTES + 1));
    await response.body?.cancel();
    expect(encodeCount()).toBe(0);
  });

  it("never transforms SVG sources (CSP-protected buffer path stays intact)", async () => {
    const svgRel = `${TENANT}/${"c".repeat(64)}/original/logo-${"c".repeat(64)}.svg`;
    const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf-8");
    await writeSource(svgRel, svgBytes);

    const response = await GET(fileEvent(svgRel, "?w=320&fmt=webp"));

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual(svgBytes);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("content-security-policy")).toContain("script-src 'none'");
    expect(encodeCount()).toBe(0);
  });

  it("never transforms GIF sources", async () => {
    const gifRel = `${TENANT}/${"d".repeat(64)}/original/anim-${"d".repeat(64)}.gif`;
    const gifBytes = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(24)]);
    await writeSource(gifRel, gifBytes);

    const response = await GET(fileEvent(gifRel, "?w=320"));

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual(gifBytes);
    expect(encodeCount()).toBe(0);
  });

  it("never transforms animated WebP sources (header sniff)", async () => {
    const webpRel = `${TENANT}/${"e".repeat(64)}/original/anim-${"e".repeat(64)}.webp`;
    const animated = Buffer.alloc(64);
    animated.write("RIFF", 0, "ascii");
    animated.write("WEBP", 8, "ascii");
    animated.write("VP8X", 12, "ascii");
    animated[20] = 0x02; // ANIMATION flag
    await writeSource(webpRel, animated);

    const response = await GET(fileEvent(webpRel, "?w=320", { accept: "image/webp" }));

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual(animated);
    expect(encodeCount()).toBe(0);
  });

  it("only transforms canonical originals (no hash path → no variant)", async () => {
    const looseRel = `${TENANT}/loose-logo.png`;
    await writeSource(looseRel, SOURCE_BYTES);

    const response = await GET(fileEvent(looseRel, "?w=320"));

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual(SOURCE_BYTES);
    expect(response.headers.get("x-media-transform")).toBeNull();
    expect(encodeCount()).toBe(0);
  });

  it("ignores dimensions below the smallest ladder step", async () => {
    const response = await GET(fileEvent(SOURCE_REL, "?w=4&h=2"));

    expect(response.status).toBe(200);
    expect(await readBody(response)).toEqual(SOURCE_BYTES);
    expect(response.headers.get("x-media-transform")).toBeNull();
    expect(encodeCount()).toBe(0);
  });

  it("clamps an oversized request down to the largest ladder step", async () => {
    const response = await GET(fileEvent(SOURCE_REL, "?w=99999"));

    expect(response.status).toBe(200);
    await readBody(response);
    expect(response.headers.get("x-media-transform")).toBe("w3840h0q82.jpeg");
    expect(await fileExists(await variantPathFor(3840, "jpeg"))).toBe(true);
  });

  it("still 404s a missing file when transform params are present", async () => {
    const missing = `${TENANT}/${HASH}/original/missing-${HASH}.jpg`;
    const response = await GET(fileEvent(missing, "?w=320"));

    expect(response.status).toBe(404);
    expect(encodeCount()).toBe(0);
  });
});

// ─── Tenant gate precedence ─────────────────────────────────────────────────

describe("/files on-demand transform — tenant gate", () => {
  it("rejects cross-tenant transform requests before generating anything", async () => {
    multiTenantEnabled = true;
    try {
      const tenantRel = `tenant-a/${HASH}/original/pic-${HASH}.jpg`;
      await writeSource(tenantRel, SOURCE_BYTES);

      const blocked = await GET(fileEvent(tenantRel, "?w=320", {}, "tenant-b"));
      expect(blocked.status).toBe(403);
      expect(encodeCount()).toBe(0);

      const allowed = await GET(fileEvent(tenantRel, "?w=320", {}, "tenant-a"));
      expect(allowed.status).toBe(200);
      await readBody(allowed);
      expect(encodeCount()).toBe(1);
      // The variant lands inside the requesting tenant's directory only.
      expect(await fileExists(await variantPathFor(320, "jpeg", 0, 82, "tenant-a"))).toBe(true);
    } finally {
      multiTenantEnabled = false;
    }
  });
});

// ─── Existing behaviour stays intact ────────────────────────────────────────

describe("/files existing behaviour", () => {
  it("keeps Range/206 semantics for the original", async () => {
    const response = await GET(fileEvent(SOURCE_REL, "", { range: "bytes=0-9" }));

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 0-9/${SOURCE_BYTES.length}`);
    expect((await readBody(response)).length).toBe(10);
    expect(encodeCount()).toBe(0);
  });

  it("keeps 416 for an unsatisfiable range", async () => {
    const response = await GET(fileEvent(SOURCE_REL, "", { range: "bytes=9999-99999" }));
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe(`bytes */${SOURCE_BYTES.length}`);
  });

  it("keeps the weak ETag + immutable caching for the original", async () => {
    const response = await GET(fileEvent(SOURCE_REL));

    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toMatch(/^W\/"\d+-\d+(\.\d+)?"$/);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await readBody(response)).toEqual(SOURCE_BYTES);
  });

  it("keeps 304 for a matching If-None-Match on the original", async () => {
    const first = await GET(fileEvent(SOURCE_REL));
    const etag = first.headers.get("etag") as string;
    await readBody(first);

    const revalidated = await GET(fileEvent(SOURCE_REL, "", { "if-none-match": etag }));
    expect(revalidated.status).toBe(304);
  });
});

// ─── Cloud storage contract ─────────────────────────────────────────────────

describe("/files transform params on cloud storage", () => {
  it("keeps the 302-to-CDN contract (no Node-side transform)", async () => {
    // Untyped handle: the real getter is keyed to the PUBLIC settings union, which does not
    // include MEDIA_STORAGE_TYPE / MEDIA_CLOUD_PUBLIC_URL (they are private settings), so the
    // test mocks it through an explicit structural type instead of the getter's own signature.
    type SettingsMock = { mockImplementation: (impl: (key: string) => string | undefined) => void };
    const settings = getPublicSettingSync as unknown as SettingsMock;
    settings.mockImplementation((key: string) => {
      if (key === "MEDIA_STORAGE_TYPE") return "s3";
      if (key === "MEDIA_CLOUD_PUBLIC_URL") return "https://cdn.example.com";
      return key === "SITE_NAME" ? "SveltyCMS Test" : undefined; // suite default
    });

    try {
      const response = await GET(fileEvent(SOURCE_REL, "?w=320"));

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("https://cdn.example.com");
      expect(response.headers.get("location")).toContain(SOURCE_REL);
      expect(response.headers.get("x-media-transform")).toBeNull();
      expect(encodeCount()).toBe(0);
    } finally {
      // Restore the suite default (tests/unit/setup.ts): SITE_NAME only.
      settings.mockImplementation((key: string) =>
        key === "SITE_NAME" ? "SveltyCMS Test" : undefined,
      );
    }
  });
});
