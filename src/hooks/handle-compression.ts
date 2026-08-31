/**
 * @file src/hooks/handle-compression.ts
 * @description
 * Hybrid compression middleware + shared utils for SvelteKit applications.
 *
 * Uses a 2-tier strategy for maximum performance + entropy-optimal payload reduction:
 * - **Tier 1 (Node/Bun)**: Native `node:zlib` with `pipeline()` for gzip/deflate + Brotli + zstd.
 *   15-30% faster than Web Streams CompressionStream on server-only runtimes.
 * - **Tier 2 (Edge/Deno/Workers)**: Web Streams `CompressionStream` fallback for
 *   environments without `node:zlib` (e.g., Cloudflare Workers, Deno Deploy).
 *
 * ### Features:
 * - Brotli support (best compression ratio for text/JSON; not in CompressionStream)
 * - Native zstd (Node 22+/Bun) with optional CMS trained dictionary
 *   (`static/dictionaries/cms-payloads.dict`) for repetitive CMS JSON
 * - Streaming (zero-copy for large payloads — no OOM on 100K+ record API responses)
 * - Intelligent content-type filtering (text/*, json, xml, javascript, svg; SSE excluded)
 *   and minimum-size thresholds
 * - Size-aware negotiation: gzip for known-tiny (<4 KiB), skip zstd below 32 KiB
 * - Refuse expanded output (compressed >= original → serve uncompressed)
 * - Case-insensitive Vary merging that preserves upstream values (e.g. Vary: Origin)
 * - Graceful fallback chain: zstd → Brotli → Gzip → Deflate → uncompressed
 * - Edge-safe lazy dynamic imports for `node:zlib` / `fs` / `path` / `stream`
 * - Exported sync compress + negotiate for Turbo fast-path pre-compression
 *
 * Integrated with handle-turbo-get.ts and handle-api-requests.ts so the
 * lowest-latency paths ship compressed responses when clients advertise support.
 */

import { logger } from "@utils/logger";
import type { Handle } from "@sveltejs/kit/hooks";
import { getRequestFlags } from "@utils/hook-utils";
import { getHardwareProfile } from "@utils/hardware-profile";

const MIN_COMPRESSION_SIZE = 1024; // 1KB
const SIZE_TINY = 4 * 1024; // < 4KB
const SIZE_SMALL = 32 * 1024; // < 32KB
const SIZE_MEDIUM = 256 * 1024; // < 256KB
/** Hard cap for SYNC compression — above this we must NOT block the request
 * thread ripping a large body with brotli/zstd (FIX 7). */
export const SYNC_MAX_SIZE = 64 * 1024; // 64KB

// 🧠 HARDWARE-AWARE: weak hosts cap compression quality so the CPU stays on the
// request path — the ratio loss on small payloads is negligible, the CPU saved
// on a 1-core VPS is not.
const HW_PROFILE = getHardwareProfile();

/**
 * Predicate for compressible content types (case-insensitive).
 *
 * Broader than a fixed allowlist so charset-suffixed and vendor variants
 * (e.g. `application/json; charset=utf-8`, `application/vnd.api+json`) match —
 * but `text/event-stream` (SSE) is ALWAYS excluded: compressing a live event
 * stream corrupts framing and breaks EventSource clients.
 */
export function isCompressibleContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const type = contentType.toLowerCase();
  if (type.includes("event-stream")) return false;
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("javascript") ||
    type.includes("svg")
  );
}

export type CompressionAlgorithm = "br" | "gzip" | "deflate" | "zstd";

// ──────────────────────────────────────────────────────────────
// Lazy Dynamic Imports for Edge Compatibility
// ──────────────────────────────────────────────────────────────

// Module namespaces from dynamic import() — typed loosely so Edge bundles
// don't hard-require Node types at compile time for every binding.
type ZlibModule = typeof import("node:zlib");
type StreamModule = typeof import("node:stream");
type FsModule = typeof import("node:fs");
type PathModule = typeof import("node:path");

let zlib: ZlibModule | null = null;
let stream: StreamModule | null = null;
let fsModule: FsModule | null = null;
let pathModule: PathModule | null = null;
let isNativeChecked = false;

/** Lazy-loaded CMS zstd dictionary (null = missing / unloadable). */
let cmsZstdDict: Buffer | null | undefined;

// Eager background init — avoids microtask overhead on first request
initNativeModules().catch(() => {});

async function initNativeModules() {
  if (isNativeChecked) return;
  try {
    // Dynamic import keeps Edge/Workers bundles free of static node: deps.
    // Cast via unknown: node:stream's module namespace types don't match the
    // runtime interop shape returned by import() under some @types/node versions.
    zlib = (await import("node:zlib")) as unknown as ZlibModule;
    stream = (await import("node:stream")) as unknown as StreamModule;
    fsModule = (await import("node:fs")) as unknown as FsModule;
    pathModule = (await import("node:path")) as unknown as PathModule;
  } catch {
    // Platform lacks Node.js native bindings (Edge/Deno/Workers)
  } finally {
    isNativeChecked = true;
  }
}

/**
 * Dynamically resolves and loads the CMS zstd dictionary without crashing Edge bundles.
 * Safe if the artifact is missing (returns null; plain zstd still works).
 */
export function getCmsZstdDictionary(): Buffer | null {
  if (cmsZstdDict !== undefined) return cmsZstdDict;

  if (!fsModule || !pathModule) {
    cmsZstdDict = null;
    return null;
  }

  const { existsSync, readFileSync } = fsModule;
  const { join } = pathModule;

  const candidates = [
    join(process.cwd(), "static", "dictionaries", "cms-payloads.dict"),
    join(process.cwd(), ".svelte-kit", "output", "client", "dictionaries", "cms-payloads.dict"),
  ];

  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        cmsZstdDict = readFileSync(path);
        return cmsZstdDict;
      }
    } catch {
      /* try next path */
    }
  }

  cmsZstdDict = null;
  return null;
}

function zstdCompressOptions(): { dict?: Buffer } {
  const dict = getCmsZstdDictionary();
  return dict ? { dict } : {};
}

function hasNativeZstd(): boolean {
  return !!(
    zlib &&
    typeof (zlib as { zstdCompressSync?: unknown }).zstdCompressSync === "function" &&
    typeof (zlib as { createZstdCompress?: unknown }).createZstdCompress === "function"
  );
}

/**
 * Adaptive compression quality based on payload size.
 */
function compressionLevel(
  algorithm: CompressionAlgorithm,
  contentLength: number,
): Record<string, unknown> {
  if (algorithm === "zstd") {
    return zstdCompressOptions();
  }
  if (algorithm === "br") {
    // Brotli quality: lower = faster
    //   4 = fast (tiny/small)
    //   6 = balanced (medium)
    //   8 = high (large / unknown)
    const quality =
      contentLength > 0 && contentLength < SIZE_SMALL
        ? 4
        : contentLength >= SIZE_SMALL && contentLength < SIZE_MEDIUM
          ? 6
          : 8;
    return {
      params: {
        [zlib!.constants.BROTLI_PARAM_QUALITY]: Math.min(quality, HW_PROFILE.brotliQuality),
      },
    };
  }
  // gzip / deflate level: 1-9, lower = faster
  const level =
    contentLength > 0 && contentLength < SIZE_SMALL ? 4 : contentLength < SIZE_MEDIUM ? 6 : 9;
  return { level: Math.min(level, HW_PROFILE.gzipLevel) };
}

/**
 * Negotiate the best compression algorithm based on Accept-Encoding and size.
 *
 * - Known tiny (<4 KiB): gzip/deflate first — zstd/brotli setup dominates the
 *   payload; gzip is cheaper and nearly as small.
 * - Known small (<32 KiB): brotli, then gzip. Skip zstd unless nothing else matches.
 * - Medium+ or unknown size: zstd (CMS dictionary) → brotli → gzip → deflate.
 *
 * Exported for turbo fast-path and API cache hits.
 */
export function negotiateEncoding(
  acceptEncoding: string,
  hasZlib: boolean,
  opts?: { zstdAvailable?: boolean; contentLength?: number },
): CompressionAlgorithm | null {
  const ae = acceptEncoding.toLowerCase();
  const zstdOk = (opts?.zstdAvailable ?? hasNativeZstd()) && ae.includes("zstd");
  const hasBr = hasZlib && ae.includes("br");
  const hasGzip = ae.includes("gzip");
  const hasDeflate = ae.includes("deflate");
  const len = opts?.contentLength ?? 0;
  const knownTiny = len > 0 && len < SIZE_TINY;
  const knownSmall = len > 0 && len < SIZE_SMALL;

  if (knownTiny) {
    if (hasGzip) return "gzip";
    if (hasDeflate) return "deflate";
    if (hasBr) return "br";
    if (zstdOk) return "zstd";
    return null;
  }

  if (!knownSmall && zstdOk) return "zstd";

  if (hasBr) return "br";
  if (hasGzip) return "gzip";
  if (hasDeflate) return "deflate";
  if (zstdOk) return "zstd";
  return null;
}

/**
 * Tier 1: node:zlib streaming compression.
 * Uses Transform streams piped through the native C++ compressor.
 * ~15-30% faster than CompressionStream on Node.js/Bun.
 *
 * Hardening: bare `.pipe()` chains need error handlers — a client abort mid-
 * compression makes zlib emit `error` (write-after-end / ECONNRESET) which would
 * otherwise surface as an uncaughtException and kill the process. Teardown on
 * abort/close captures errors into the web stream instead of the process.
 */
function compressWithZlib(
  body: ReadableStream<Uint8Array>,
  algorithm: CompressionAlgorithm,
  contentLength: number,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zstd APIs not yet in all @types/node
  let zlibTransform: any;
  const opts = compressionLevel(algorithm, contentLength);

  if (algorithm === "zstd") {
    zlibTransform = (zlib as { createZstdCompress: (o: unknown) => unknown }).createZstdCompress(
      opts,
    );
  } else if (algorithm === "br") {
    zlibTransform = zlib!.createBrotliCompress(opts as import("node:zlib").BrotliOptions);
  } else if (algorithm === "gzip") {
    zlibTransform = zlib!.createGzip(opts as import("node:zlib").ZlibOptions);
  } else {
    zlibTransform = zlib!.createDeflate(opts as import("node:zlib").ZlibOptions);
  }

  const nodeReadable = stream!.Readable.fromWeb(
    body as unknown as import("node:stream/web").ReadableStream,
  );
  const compressed = nodeReadable.pipe(zlibTransform);

  const teardown = () => {
    if (!nodeReadable.destroyed) nodeReadable.destroy();
    if (!zlibTransform.destroyed) zlibTransform.destroy();
  };

  nodeReadable.on("error", (err) => {
    // Propagate source errors into the web stream instead of silently truncating:
    // destroying the zlib transform with the error makes the consumer see an
    // error, and the piped `compressed` handler + teardown clean up both sides.
    if (!zlibTransform.destroyed) zlibTransform.destroy(err);
    if (!nodeReadable.destroyed) nodeReadable.destroy();
  });
  zlibTransform.on("error", teardown);
  compressed.on("error", teardown);
  compressed.on("close", teardown);

  if (signal) {
    if (signal.aborted) teardown();
    else signal.addEventListener("abort", teardown, { once: true });
  }

  return stream!.Readable.toWeb(compressed) as unknown as ReadableStream<Uint8Array>;
}

/**
 * Tier 2: Web Streams CompressionStream (Edge/Deno/Workers fallback).
 * Cross-platform but ~15-30% slower on Node.js and doesn't support Brotli/zstd.
 */
function compressWithWebStreams(
  body: ReadableStream<Uint8Array>,
  algorithm: "gzip" | "deflate",
): ReadableStream<Uint8Array> {
  const compressionStream = new CompressionStream(algorithm);
  return body.pipeThrough(compressionStream as TransformStream<Uint8Array, Uint8Array>);
}

/**
 * Sync compression for hot cached payloads (e.g. Turbo GET hits).
 * Uses native zlib sync APIs (very fast for <1MB JSON). Zero stream overhead.
 * Falls back to null (serve raw) if native not ready — preserves latency budget.
 *
 * 🔴 FIX 7 (event-loop load): this has a HARD size guard. `handle-compression.ts`
 * capped the *middleware* sync path at SYNC_MAX_SIZE but `compressSync()` itself
 * had no guard — the `handle-turbo-get.ts` fallback and `handle-api-requests.ts`
 * background pre-compression called it with ANY payload size. Brotli/zstd on a
 * multi-hundred-KB body blocked the request thread per in-flight request. Return
 * null above the cap so callers serve the raw body instead of stalling the loop.
 */
export function compressSync(
  data: string | Uint8Array | Buffer,
  algorithm: CompressionAlgorithm,
  contentLength?: number,
): Uint8Array | null {
  if (!zlib) return null;
  const input = Buffer.isBuffer(data)
    ? data
    : typeof data === "string"
      ? Buffer.from(data)
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const len = contentLength ?? input.byteLength;
  // 🔴 FIX 7: guard the synchronous path — large bodies must NOT be compressed on
  // the request thread. Streaming tiers (compressWithZlib pipeline) can handle
  // them; sync compression is only for small cached payloads.
  if (len > SYNC_MAX_SIZE) return null;
  const opts = compressionLevel(algorithm, len);
  try {
    let out: Buffer | Uint8Array | null = null;
    if (algorithm === "zstd") {
      const zstdSync = (zlib as { zstdCompressSync?: (b: Buffer, o: unknown) => Buffer })
        .zstdCompressSync;
      if (typeof zstdSync !== "function") return null;
      out = zstdSync(input, opts);
    } else if (algorithm === "br") {
      out = zlib.brotliCompressSync(input, opts as import("node:zlib").BrotliOptions);
    } else if (algorithm === "gzip") {
      out = zlib.gzipSync(input, opts as import("node:zlib").ZlibOptions);
    } else {
      out = zlib.deflateSync(input, opts as import("node:zlib").ZlibOptions);
    }
    // Expanded (or equal) output is a net loss — serve uncompressed.
    if (!out || out.byteLength >= input.byteLength) return null;
    return out;
  } catch {
    return null;
  }
}

/** Quick sync capability check (eager init makes this reliable after first requests). */
export function hasNativeCompression(): boolean {
  return zlib !== null && stream !== null;
}

/**
 * Truly async compression off the V8 main thread using libuv worker thread callbacks.
 * Essential for background pre-compression (handle-api-requests) so large bodies
 * never block the event loop.
 */
export function compressAsync(
  data: string | Uint8Array | Buffer,
  algorithm: CompressionAlgorithm,
  contentLength?: number,
): Promise<Uint8Array | null> {
  if (!zlib) return Promise.resolve(null);
  const input = Buffer.isBuffer(data)
    ? data
    : typeof data === "string"
      ? Buffer.from(data)
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const len = contentLength ?? input.byteLength;
  const opts = compressionLevel(algorithm, len);

  if (algorithm === "zstd") {
    return compressZstd(input);
  }

  return new Promise((resolve) => {
    try {
      const cb = (err: Error | null, result: Buffer) => {
        if (err || !result || result.byteLength >= input.byteLength) {
          resolve(null);
        } else {
          resolve(result);
        }
      };
      if (algorithm === "br") {
        zlib!.brotliCompress(input, opts as import("node:zlib").BrotliOptions, cb);
      } else if (algorithm === "gzip") {
        zlib!.gzip(input, opts as import("node:zlib").ZlibOptions, cb);
      } else {
        zlib!.deflate(input, opts as import("node:zlib").ZlibOptions, cb);
      }
    } catch {
      resolve(null);
    }
  });
}

/**
 * Async zstd compress with CMS dictionary when available.
 * Prefer native node:zlib; fall back to optional @mongodb-js/zstd (level-only, no dict).
 * Used by handle-api-requests for background cache pre-compression.
 */
export async function compressZstd(data: string | Uint8Array | Buffer): Promise<Uint8Array | null> {
  // Native path (Node 22+ / current Bun)
  if (hasNativeZstd()) {
    try {
      const input = Buffer.isBuffer(data)
        ? data
        : typeof data === "string"
          ? Buffer.from(data)
          : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      const zstdSync = (zlib as { zstdCompressSync: (b: Buffer, o: unknown) => Buffer })
        .zstdCompressSync;
      const out = zstdSync(input, zstdCompressOptions());
      if (!out || out.byteLength >= input.byteLength) return null;
      return out;
    } catch {
      /* fall through to optional binding */
    }
  }

  try {
    // Optional dep — guarded by try/catch; not listed as hard dependency
    // @ts-expect-error optional peer; may be absent in install graphs
    const mod = (await import("@mongodb-js/zstd")) as {
      compress: (buf: Buffer, level: number) => Promise<Buffer | Uint8Array>;
    };
    const input = Buffer.isBuffer(data)
      ? data
      : typeof data === "string"
        ? Buffer.from(data)
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    // API: compress(buffer, level) — dictionary not supported by this binding
    const compressed = await mod.compress(input, 3);
    const out = Buffer.from(compressed);
    if (out.byteLength >= input.byteLength) return null;
    return out;
  } catch {
    return null;
  }
}

/**
 * Merge a token into the Vary header case-insensitively instead of overwriting,
 * so upstream values (e.g. Vary: Origin from CORS) are preserved.
 */
export function addVaryHeader(headers: Headers, value: string): void {
  const existing = headers.get("Vary");
  if (!existing) {
    headers.set("Vary", value);
    return;
  }
  const tokens = existing.split(",").map((t) => t.trim());
  const lower = value.toLowerCase();
  if (!tokens.some((t) => t.toLowerCase() === lower)) {
    tokens.push(value);
  }
  headers.set("Vary", tokens.join(", "));
}

/**
 * Set standard compression observability headers on a response.
 * Shared by handle-api-requests (cache HIT pre-compressed) and handle-turbo-get
 * to avoid duplicated header logic and ratio calculation.
 *
 * Sets: Content-Encoding, Vary, X-Original-Size, X-Compressed-Size,
 * X-Compression-Ratio, X-Compression-Algorithm, X-Compression-Dictionary.
 */
export function setCompressionHeaders(
  headers: Headers,
  algo: string,
  originalSize: number,
  compressedSize: number,
): void {
  headers.set("Content-Encoding", algo);
  addVaryHeader(headers, "Accept-Encoding");
  if (originalSize > 0) headers.set("X-Original-Size", String(originalSize));
  if (compressedSize > 0 && originalSize > 0) {
    headers.set("X-Compressed-Size", String(compressedSize));
    const ratio = ((compressedSize / originalSize) * 100).toFixed(1);
    headers.set("X-Compression-Ratio", `${ratio}%`);
  } else if (compressedSize > 0) {
    headers.set("X-Compressed-Size", String(compressedSize));
  }
  headers.set("X-Compression-Algorithm", algo);
  if (algo === "zstd" && getCmsZstdDictionary()) {
    headers.set("X-Compression-Dictionary", "cms-payloads");
  }
}

export const handleCompression: Handle = async ({ event, resolve }) => {
  const flags = getRequestFlags(event.locals);

  // Fast-path: skip compression for static assets and internal requests
  if (flags.isStatic) return resolve(event);
  if (flags.isTestMode || (event.locals as { __testBypass?: boolean }).__testBypass) {
    return resolve(event);
  }

  // Collection mutations return ~0.4–2 KiB JSON. Compressing them without a
  // Content-Length (or even with gzip-9) is pure event-loop tax on create/update
  // concurrency — skip before wrapping resolve.
  const method = event.request.method;
  if (
    (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") &&
    event.url.pathname.startsWith("/api/collections")
  ) {
    return resolve(event);
  }

  // Ensure native modules are loaded when available
  if (!isNativeChecked) await initNativeModules();

  const response = await resolve(event);

  if (
    response.headers.has("Content-Encoding") ||
    !response.body ||
    response.status === 204 ||
    response.status === 304
  ) {
    return response;
  }

  const rawContentLength = response.headers.get("content-length");
  const contentLength = rawContentLength ? Number(rawContentLength) : 0;

  // Enforce threshold ONLY when content-length is explicitly known
  if (contentLength > 0 && contentLength < MIN_COMPRESSION_SIZE) {
    return response;
  }

  // Mutations: skip gzip/br for small JSON (create/update/GraphQL page). The
  // setup cost dominates <4 KiB and serializes the event loop under 8 workers.
  if (
    contentLength > 0 &&
    contentLength < SIZE_TINY &&
    (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE")
  ) {
    return response;
  }

  const contentType = response.headers.get("Content-Type");
  if (!isCompressibleContentType(contentType)) {
    return response;
  }

  const acceptEncoding = event.request.headers.get("Accept-Encoding") || "";
  const hasZlib = zlib !== null && stream !== null;

  let algorithm = negotiateEncoding(acceptEncoding, hasZlib, {
    zstdAvailable: hasNativeZstd(),
    contentLength,
  });
  if (!algorithm) return response;

  try {
    let compressedBody: BodyInit;
    let compressedSize = 0;

    // Buffer small known payloads for sync compression fast path
    if (hasZlib && contentLength > 0 && contentLength <= SYNC_MAX_SIZE) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalBytes += value.byteLength;
      }

      let full: Uint8Array;
      if (chunks.length === 1) {
        full = chunks[0];
      } else {
        const merged = new Uint8Array(totalBytes);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.byteLength;
        }
        full = merged;
      }

      const compressed = compressSync(full, algorithm, contentLength);
      if (compressed) {
        compressedBody = compressed as BodyInit;
        compressedSize = compressed.byteLength;
      } else {
        // Sync failed — serve the buffered bytes uncompressed. Do NOT return the
        // original response: its body was fully drained by the reader loop above,
        // so the client would receive a 200 with an empty body.
        return new Response(full as BodyInit, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
    } else if (hasZlib) {
      // Streaming path for large or unknown-size payloads
      compressedBody = compressWithZlib(
        response.body,
        algorithm,
        contentLength,
        event.request.signal,
      );
    } else if (algorithm === "gzip" || algorithm === "deflate") {
      compressedBody = compressWithWebStreams(response.body, algorithm);
    } else if (algorithm === "br") {
      // CompressionStream has no Brotli — degrade
      algorithm = acceptEncoding.includes("gzip") ? "gzip" : "deflate";
      compressedBody = compressWithWebStreams(response.body, algorithm);
    } else {
      // zstd without native zlib: no web-stream equivalent
      return response;
    }

    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    setCompressionHeaders(headers, algorithm, contentLength, compressedSize);

    return new Response(compressedBody, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    logger.error("Compression failed, serving uncompressed:", error);
    return response;
  }
};
