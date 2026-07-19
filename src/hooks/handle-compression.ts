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
 * Features:
 * - Brotli support (best compression ratio for text/JSON, not available in CompressionStream)
 * - Native zstd (Node 22+/Bun) with optional CMS trained dictionary
 *   (`static/dictionaries/cms-payloads.dict`) for repetitive CMS JSON
 * - Streaming (zero-copy for large payloads — no OOM on 100K+ record API responses)
 * - Intelligent content-type filtering and minimum-size thresholds
 * - Graceful fallback chain: zstd → Brotli → Gzip → Deflate → uncompressed
 * - Exported sync compress + negotiate for Turbo fast-path pre-compression
 *
 * Integrated with handle-turbo-get.ts so the lowest-latency path now ships compressed
 * responses when clients advertise support.
 */

import type { Handle } from "@sveltejs/kit";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRequestFlags } from "@utils/hook-utils";

const MIN_COMPRESSION_SIZE = 1024; // 1KB

/**
 * Adaptive compression thresholds (bytes).
 * Smaller payloads use lighter compression to avoid overhead dominating.
 */
const SIZE_TINY = 4 * 1024; // < 4KB: fastest compression, ratio irrelevant
const SIZE_SMALL = 32 * 1024; // < 32KB: balanced
const SIZE_MEDIUM = 256 * 1024; // < 256KB: good compression
// >= 256KB: best compression

/**
 * Maximum payload size for sync compression fast-path.
 * Larger payloads use streaming to avoid buffering the entire response.
 */
const SYNC_MAX_SIZE = 64 * 1024; // 64KB

const COMPRESSIBLE_TYPES = [
  "text/html",
  "text/css",
  "text/plain",
  "text/xml",
  "application/json",
  "application/javascript",
  "application/xml",
  "image/svg+xml",
];

export type CompressionAlgorithm = "br" | "gzip" | "deflate" | "zstd";

// ──────────────────────────────────────────────────────────────
// Tier Detection: Try to load node:zlib lazily
// ──────────────────────────────────────────────────────────────

let zlib: any = null;
let stream: any = null;
let isNativeChecked = false;

/** Lazy-loaded CMS zstd dictionary (null = missing / unloadable). */
let cmsZstdDict: Buffer | null | undefined;

// 🚀 Eager background init — avoids microtask overhead on first request
initNativeModules().catch(() => {});

async function initNativeModules() {
  if (isNativeChecked) return;
  try {
    zlib = await import("node:zlib");
    stream = await import("node:stream");
  } catch {
    // Edge/Deno/Workers — fall back to CompressionStream
  } finally {
    isNativeChecked = true;
  }
}

/**
 * Resolve and load the trained CMS zstd dictionary once.
 * Safe if the artifact is missing (returns null; plain zstd still works).
 */
export function getCmsZstdDictionary(): Buffer | null {
  if (cmsZstdDict !== undefined) return cmsZstdDict;

  const candidates = [
    join(process.cwd(), "static", "dictionaries", "cms-payloads.dict"),
    // Relative to this module when running from build output
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "static",
      "dictionaries",
      "cms-payloads.dict",
    ),
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "static",
      "dictionaries",
      "cms-payloads.dict",
    ),
  ];

  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        cmsZstdDict = readFileSync(path);
        return cmsZstdDict;
      }
    } catch {
      /* try next */
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
    typeof (zlib as any).zstdCompressSync === "function" &&
    typeof (zlib as any).createZstdCompress === "function"
  );
}

/**
 * Pick the best compression algorithm for a given payload size.
 * - Tiny payloads: just gzip (fast, universal, negligible ratio difference)
 * - Small payloads: brotli (good ratio, still fast)
 * - Medium/large: zstd with dict (best ratio)
 */
function pickBestAlgorithm(
  acceptEncoding: string,
  contentLength: number,
): CompressionAlgorithm | null {
  const hasBr = zlib !== null && stream !== null && acceptEncoding.includes("br");
  const hasGzip = acceptEncoding.includes("gzip");
  const hasDeflate = acceptEncoding.includes("deflate");
  const zstdOk = hasNativeZstd() && acceptEncoding.includes("zstd");

  // Always prefer zstd when available (best ratio, competitive speed)
  if (zstdOk) return "zstd";

  // Tiny payloads: gzip is fast enough, brotli overhead doesn't pay off
  if (contentLength > 0 && contentLength < SIZE_TINY) {
    if (hasGzip) return "gzip";
    if (hasDeflate) return "deflate";
    if (hasBr) return "br";
    return null;
  }

  // Small payloads: brotli quality 4 is fast with good ratio
  if (contentLength > 0 && contentLength < SIZE_SMALL) {
    if (hasBr) return "br";
    if (hasGzip) return "gzip";
    if (hasDeflate) return "deflate";
    return null;
  }

  // Medium+ payloads: brotli higher quality
  if (hasBr) return "br";
  if (hasGzip) return "gzip";
  if (hasDeflate) return "deflate";
  return null;
}

/**
 * Adaptive compression quality based on payload size.
 */
function compressionLevel(
  algorithm: CompressionAlgorithm,
  contentLength: number,
): Record<string, any> {
  if (algorithm === "zstd") {
    return zstdCompressOptions();
  }
  if (algorithm === "br") {
    // Brotli quality: lower = faster
    //   4 = fast (tiny/small payloads)
    //   6 = balanced (medium)
    //   8 = high (large)
    const quality =
      contentLength > 0 && contentLength < SIZE_SMALL ? 4 : contentLength < SIZE_MEDIUM ? 6 : 8;
    return {
      params: { [zlib!.constants.BROTLI_PARAM_QUALITY]: quality },
    };
  }
  // gzip / deflate level: 1-9, lower = faster
  const level =
    contentLength > 0 && contentLength < SIZE_SMALL ? 4 : contentLength < SIZE_MEDIUM ? 6 : 9;
  return { level };
}

/**
 * Negotiate the best compression algorithm based on Accept-Encoding.
 * Priority: zstd (when available) → Brotli → Gzip → Deflate
 * Exported for use by turbo fast-path and other layers.
 */
export function negotiateEncoding(
  acceptEncoding: string,
  hasZlib: boolean,
  opts?: { zstdAvailable?: boolean },
): CompressionAlgorithm | null {
  const zstdOk = opts?.zstdAvailable ?? hasNativeZstd();
  if (zstdOk && acceptEncoding.includes("zstd")) return "zstd";
  if (hasZlib && acceptEncoding.includes("br")) return "br";
  if (acceptEncoding.includes("gzip")) return "gzip";
  if (acceptEncoding.includes("deflate")) return "deflate";
  return null;
}

/**
 * Tier 1: node:zlib streaming compression.
 * Uses Transform streams piped through the native C++ compressor.
 * ~15-30% faster than CompressionStream on Node.js/Bun.
 */
function compressWithZlib(
  body: ReadableStream<Uint8Array>,
  algorithm: CompressionAlgorithm,
  contentLength: number,
): ReadableStream<Uint8Array> {
  let zlibTransform:
    | import("node:zlib").BrotliCompress
    | import("node:zlib").Gzip
    | import("node:zlib").Deflate
    | import("node:zlib").ZstdCompress;

  const opts = compressionLevel(algorithm, contentLength);

  if (algorithm === "zstd") {
    zlibTransform = (zlib as any).createZstdCompress(opts);
  } else if (algorithm === "br") {
    zlibTransform = zlib!.createBrotliCompress(opts);
  } else if (algorithm === "gzip") {
    zlibTransform = zlib!.createGzip(opts);
  } else {
    zlibTransform = zlib!.createDeflate(opts);
  }

  // Convert Web ReadableStream → Node Readable → zlib Transform → Web ReadableStream
  const nodeReadable = stream!.Readable.fromWeb(body as any);
  const compressed = nodeReadable.pipe(zlibTransform as any);
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
  return body.pipeThrough(compressionStream as any);
}

/**
 * Sync compression for hot cached payloads (e.g. Turbo GET hits).
 * Uses native zlib sync APIs (very fast for <1MB JSON). Zero stream overhead.
 * Falls back to null (serve raw) if native not ready — preserves latency budget.
 */
export function compressSync(
  data: string | Uint8Array | Buffer,
  algorithm: CompressionAlgorithm,
  contentLength?: number,
): Uint8Array | null {
  if (!zlib) return null;
  const input = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
  const len = contentLength ?? input.byteLength;
  const opts = compressionLevel(algorithm, len);
  try {
    if (algorithm === "zstd") {
      if (typeof (zlib as any).zstdCompressSync !== "function") return null;
      return (zlib as any).zstdCompressSync(input, opts);
    }
    if (algorithm === "br") {
      return zlib.brotliCompressSync(input, opts);
    }
    if (algorithm === "gzip") {
      return zlib.gzipSync(input, opts);
    }
    return zlib.deflateSync(input, opts);
  } catch {
    return null;
  }
}

/** Quick sync capability check (eager init makes this reliable after first requests). */
export function hasNativeCompression(): boolean {
  return zlib !== null && stream !== null;
}

/**
 * Async zstd compress with CMS dictionary when available.
 * Prefer native node:zlib; fall back to optional @mongodb-js/zstd (level-only, no dict).
 */
export async function compressZstd(data: string | Uint8Array | Buffer): Promise<Uint8Array | null> {
  // Native path (Node 22+ / current Bun)
  if (hasNativeZstd()) {
    try {
      const input = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
      return (zlib as any).zstdCompressSync(input, zstdCompressOptions());
    } catch {
      /* fall through to optional binding */
    }
  }

  try {
    // @ts-ignore — optional dep, guarded by try/catch
    const mod = await import("@mongodb-js/zstd");
    const input = Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data as any);
    // API: compress(buffer, level) — dictionary not supported by this binding
    const compressed = await mod.compress(input, 3);
    return Buffer.from(compressed);
  } catch {
    return null;
  }
}

/**
 * Set standard compression observability headers on a response.
 * Shared by handle-api-requests (cache HIT pre-compressed) and handle-turbo-get
 * to avoid duplicated ~15 lines of header logic and ratio calculation.
 *
 * Sets: Content-Encoding, Vary, X-Original-Size, X-Compressed-Size,
 * X-Compression-Ratio, X-Compression-Algorithm.
 */
export function setCompressionHeaders(
  headers: Headers,
  algo: string,
  originalSize: number,
  compressedSize: number,
): void {
  headers.set("Content-Encoding", algo);
  headers.set("Vary", "Accept-Encoding");
  headers.set("X-Original-Size", String(originalSize));
  headers.set("X-Compressed-Size", String(compressedSize));
  const ratio = ((compressedSize / originalSize) * 100).toFixed(1);
  headers.set("X-Compression-Ratio", `${ratio}%`);
  headers.set("X-Compression-Algorithm", algo);
  if (algo === "zstd" && getCmsZstdDictionary()) {
    headers.set("X-Compression-Dictionary", "cms-payloads");
  }
}

export const handleCompression: Handle = async ({ event, resolve }) => {
  const flags = getRequestFlags(event.locals as any);

  // 🚀 FAST-PATH: Skip compression for static assets and internal requests
  if (flags.isStatic) return resolve(event);

  if (flags.isTestMode || (event.locals as any).__testBypass) return resolve(event);

  // Ensure native modules are loaded if available
  // initNativeModules runs eagerly at module scope — no need to await here
  const response = await resolve(event);

  if (
    response.headers.has("Content-Encoding") ||
    !response.body ||
    response.status === 204 ||
    response.status === 304
  ) {
    return response;
  }

  if (
    event.url.pathname.includes("/__data.json") ||
    (response.headers.has("content-length") &&
      Number(response.headers.get("content-length")) < MIN_COMPRESSION_SIZE)
  ) {
    return response;
  }

  const contentType = response.headers.get("Content-Type");
  if (!(contentType && COMPRESSIBLE_TYPES.some((t) => contentType?.includes(t)))) {
    return response;
  }

  const acceptEncoding = event.request.headers.get("Accept-Encoding") || "";
  const hasZlib = zlib !== null && stream !== null;
  const rawContentLength = response.headers.get("content-length");
  const contentLength = rawContentLength ? Number(rawContentLength) : 0;

  // Smart algorithm selection: pick based on payload size and client support
  let algorithm = pickBestAlgorithm(acceptEncoding, contentLength);

  if (!algorithm) {
    return response;
  }

  // zstd without native support: negotiate down
  if (algorithm === "zstd" && !hasNativeZstd()) {
    algorithm = negotiateEncoding(acceptEncoding, hasZlib);
    if (!algorithm) return response;
  }

  try {
    let compressedBody: BodyInit;
    let compressedSize: number;

    // Sync fast-path: buffer + compress synchronously for small payloads
    // Avoids stream overhead (~15-30% faster for <64KB payloads)
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

      // Concatenate chunks (avoids multiple Buffer allocations for common small payloads)
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
        // Sync failed — serve uncompressed rather than double-streaming
        return response;
      }
    } else if (hasZlib) {
      // Streaming path for large or unknown-size payloads
      compressedBody = compressWithZlib(response.body, algorithm, contentLength);
      compressedSize = 0; // unknown — omit X-Compressed-Size
    } else if (algorithm === "gzip" || algorithm === "deflate") {
      compressedBody = compressWithWebStreams(response.body, algorithm);
      compressedSize = 0;
    } else if (algorithm === "br") {
      // CompressionStream has no Brotli — degrade
      algorithm = acceptEncoding.includes("gzip") ? "gzip" : "deflate";
      compressedBody = compressWithWebStreams(response.body, algorithm);
      compressedSize = 0;
    } else {
      // zstd without native zlib: no web-stream equivalent
      return response;
    }

    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    headers.set("Content-Encoding", algorithm);
    headers.set("Vary", "Accept-Encoding");

    const origLen = response.headers.get("content-length");
    if (origLen) headers.set("X-Original-Size", origLen);
    headers.set("X-Compression-Algorithm", algorithm);
    if (compressedSize > 0) {
      headers.set("X-Compressed-Size", String(compressedSize));
      const ratio = ((compressedSize / (contentLength || 1)) * 100).toFixed(1);
      headers.set("X-Compression-Ratio", `${ratio}%`);
    }
    if (algorithm === "zstd" && getCmsZstdDictionary()) {
      headers.set("X-Compression-Dictionary", "cms-payloads");
    }

    return new Response(compressedBody, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    console.error("Compression failed, serving uncompressed:", error);
    return response;
  }
};
