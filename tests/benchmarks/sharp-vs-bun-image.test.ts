/**
 * @file tests/benchmarks/sharp-vs-bun-image.test.ts
 * @description Head-to-head image pipeline benchmark: sharp (libvips) vs Bun.Image
 * (bun:image native pipeline, Bun ≥ 1.4).
 * @summary Measures the exact same CMS variant work (decode → auto-orient → resize → encode)
 * through both engines, reports output-size divergence, and audits the capability gap for the
 * operations the SveltyCMS media pipeline actually needs (composite/watermark, raw RGBA masks,
 * region extract, blur, linear, arbitrary rotation, AVIF on Linux, SVG, animated GIF).
 */

import { performance } from "node:perf_hooks";
import {
  test,
  printTruthTable,
  printSummaryTable,
  exportResult,
  exportMetric,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

// ─── Runtime gate ───────────────────────────────────────────────────────────

// Bun.Image ships with Bun ≥ 1.4. Under `bun test` this is always available;
// under Node/vitest it does not exist and there is nothing to compare.
const bunImageCtor =
  typeof Bun !== "undefined" && typeof Bun.Image === "function" ? Bun.Image : null;

// ─── Fixtures ───────────────────────────────────────────────────────────────

/** Deterministic PRNG so the fixture bytes are reproducible across runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let photoJpeg: Buffer = Buffer.alloc(0);
let photoPng: Buffer = Buffer.alloc(0);
let photoPngLarge: Buffer = Buffer.alloc(0);
let sharpFactory: any = null;

async function getSharp(): Promise<any> {
  if (!sharpFactory) {
    const mod = await import("sharp");
    sharpFactory = mod.default || mod;
  }
  return sharpFactory;
}

/**
 * 2400×1800 photo-like JPEG (noise + vertical gradient, quality 90) and a
 * 640×480 PNG derivative — the same kind of input the media pipeline sees.
 */
async function prepareFixtures(): Promise<void> {
  const sharp = await getSharp();
  const w = 2400;
  const h = 1800;
  const rnd = mulberry32(0x5eedc0de);
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const gradient = (y / h) * 255;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const noise = rnd() * 255;
      raw[i] = noise * 0.6 + gradient * 0.4;
      raw[i + 1] = noise * 0.4 + gradient * 0.6;
      raw[i + 2] = noise;
    }
  }
  photoJpeg = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
  photoPng = await sharp(photoJpeg).resize(640, 480, { fit: "fill" }).png().toBuffer();
  // A PNG source with no shrink-on-load: every variant pays a full decode today.
  photoPngLarge = await sharp(photoJpeg).resize(1920, 1440, { fit: "fill" }).png().toBuffer();
}

// ─── Timing ─────────────────────────────────────────────────────────────────

function forceGarbageCollection(): void {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

interface Timing {
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  rps: number;
}

/**
 * Warm-up then measured loop. No budget assertions here — this benchmark only
 * reports numbers, so the JIT warm-up is sized to image-op cost, not 1k loops.
 */
async function measure(
  fn: () => Promise<unknown>,
  opts: { warmup?: number; iterations?: number } = {},
): Promise<Timing> {
  const warmup = opts.warmup ?? 20;
  const iterations = opts.iterations ?? 50;
  for (let i = 0; i < warmup; i++) await fn();
  forceGarbageCollection();
  await stabilize(50);
  const samples = Array.from<number>({ length: iterations });
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    samples[i] = performance.now() - t0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const avgMs = samples.reduce((s, v) => s + v, 0) / iterations;
  return {
    avgMs,
    p95Ms: sorted[Math.min(iterations - 1, Math.floor(iterations * 0.95))]!,
    minMs: sorted[0]!,
    maxMs: sorted[iterations - 1]!,
    rps: 1000 / avgMs,
  };
}

// ─── Pipeline parity: the exact work SveltyCMS does today ───────────────────

const LIMIT_INPUT_PIXELS = 268_402_689; // sharp default (0x3FFF × 0x3FFF)

/** CMS `generateVariant` parity: rotate (EXIF) → resize inside → webp q82. */
function sharpThumb(buf: Buffer): Promise<Buffer> {
  return getSharp().then((sharp) =>
    sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .rotate()
      .resize(320, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer(),
  );
}

/** Same thumbnail with a cheaper WebP effort level (the CMS default is 4). */
function sharpThumbEffort(effort: number) {
  return (buf: Buffer): Promise<Buffer> =>
    getSharp().then((sharp) =>
      sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
        .rotate()
        .resize(320, null, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82, effort })
        .toBuffer(),
    );
}

/** Same work through Bun.Image (autoOrient is the default constructor option). */
function bunThumb(buf: Buffer): Promise<Buffer> {
  return new bunImageCtor!(buf)
    .resize(320, 320, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .buffer();
}

/** CMS derivative fan-out parity: 4 variants from one decode-heavy source (turbo jpeg — the shipped `applyEncoder` config). */
async function sharpLadder(buf: Buffer): Promise<Buffer[]> {
  const sharp = await getSharp();
  return Promise.all([
    sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .rotate()
      .resize(320, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer(),
    sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .rotate()
      .resize(640, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer(),
    sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .rotate()
      .resize(960, null, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer(),
    sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .rotate()
      .resize(1920, null, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer(),
  ]);
}

/** Decode-once prototype: one oriented raw decode, then 4 resizes from the raw buffer. */
async function sharpLadderDecodeOnce(buf: Buffer): Promise<Buffer[]> {
  const sharp = await getSharp();
  const { data, info } = await sharp(buf, {
    limitInputPixels: LIMIT_INPUT_PIXELS,
    failOn: "none",
  })
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rawOpts = { raw: { width: info.width, height: info.height, channels: info.channels } };
  return Promise.all([
    sharp(data, rawOpts)
      .resize(320, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer(),
    sharp(data, rawOpts)
      .resize(640, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer(),
    sharp(data, rawOpts)
      .resize(960, null, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer(),
    sharp(data, rawOpts)
      .resize(1920, null, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer(),
  ]);
}

/** Re-decode ladder for PNG sources (each variant pays a full PNG decode). */
async function sharpPngLadder(buf: Buffer): Promise<Buffer[]> {
  const sharp = await getSharp();
  return Promise.all([
    sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .resize(320, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer(),
    sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .resize(640, null, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })
      .toBuffer(),
    sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .resize(960, null, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer(),
    sharp(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
      .resize(1920, null, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer(),
  ]);
}

async function bunLadder(buf: Buffer): Promise<Buffer[]> {
  const make = (w: number, fmt: "webp" | "jpeg") =>
    new bunImageCtor!(buf)
      .resize(w, w, { fit: "inside", withoutEnlargement: true })
      [fmt]({ quality: 82 })
      .buffer();
  return Promise.all([make(320, "webp"), make(640, "webp"), make(960, "jpeg"), make(1920, "jpeg")]);
}

// ─── Scenario list ──────────────────────────────────────────────────────────

interface Scenario {
  key: string;
  name: string;
  shortLabel: string;
  sharpFn?: (buf: Buffer) => Promise<unknown>;
  bunFn?: (buf: Buffer) => Promise<unknown>;
  iterations?: number;
  warmup?: number;
}

const SCENARIOS: Scenario[] = [
  {
    key: "metadata_header",
    name: "Metadata (header-only)",
    shortLabel: "Metadata",
    sharpFn: async (buf) => (await getSharp())(buf).metadata(),
    bunFn: (buf) => new bunImageCtor!(buf).metadata(),
    warmup: 100,
    iterations: 300,
  },
  {
    key: "thumbnail_320_webp",
    name: "Thumbnail 320 webp q82",
    shortLabel: "Thumb 320",
    sharpFn: sharpThumb,
    bunFn: bunThumb,
    warmup: 25,
    iterations: 50,
  },
  {
    key: "variant_ladder_x4",
    name: "Variant ladder x4 (fan-out)",
    shortLabel: "Ladder x4",
    sharpFn: sharpLadder,
    bunFn: bunLadder,
    warmup: 5,
    iterations: 10,
  },
  {
    key: "ladder_jpeg_decode_once",
    name: "Ladder x4 decode-once (jpeg)",
    shortLabel: "Ladder 1×decode",
    sharpFn: sharpLadderDecodeOnce,
    warmup: 5,
    iterations: 10,
  },
  {
    key: "ladder_png_redecode",
    name: "Ladder x4 re-decode (png)",
    shortLabel: "PNG ladder",
    sharpFn: () => sharpPngLadder(photoPngLarge),
    warmup: 5,
    iterations: 10,
  },
  {
    key: "ladder_png_decode_once",
    name: "Ladder x4 decode-once (png)",
    shortLabel: "PNG ladder 1×",
    sharpFn: () => sharpLadderDecodeOnce(photoPngLarge),
    warmup: 5,
    iterations: 10,
  },
  {
    key: "webp_thumb_effort0",
    name: "Thumb 320 webp effort 0",
    shortLabel: "WebP effort 0",
    sharpFn: sharpThumbEffort(0),
    warmup: 25,
    iterations: 50,
  },
  {
    key: "webp_thumb_effort1",
    name: "Thumb 320 webp effort 1",
    shortLabel: "WebP effort 1",
    sharpFn: sharpThumbEffort(1),
    warmup: 25,
    iterations: 50,
  },
  {
    key: "jpeg_1920",
    name: "JPEG 1920 (mozjpeg vs turbo)",
    shortLabel: "JPEG 1920",
    sharpFn: async (buf) =>
      (await getSharp())(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
        .rotate()
        .resize(1920, null, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer(),
    bunFn: (buf) =>
      new bunImageCtor!(buf)
        .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .buffer(),
    warmup: 5,
    iterations: 12,
  },
  {
    // The one-line lever the 2026-09-25 evaluation found: sharp's own
    // libjpeg-turbo path (mozjpeg: false) — same engine, no codec swap.
    key: "jpeg_1920_sharp_turbo",
    name: "JPEG 1920 (sharp, mozjpeg OFF)",
    shortLabel: "JPEG 1920 turbo",
    sharpFn: async (buf) =>
      (await getSharp())(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
        .rotate()
        .resize(1920, null, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer(),
    warmup: 5,
    iterations: 15,
  },
  {
    key: "png_800",
    name: "PNG 800",
    shortLabel: "PNG 800",
    sharpFn: async (buf) =>
      (await getSharp())(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
        .rotate()
        .resize(800, null, { fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 6 })
        .toBuffer(),
    bunFn: (buf) =>
      new bunImageCtor!(buf)
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 6 })
        .buffer(),
    warmup: 10,
    iterations: 30,
  },
  {
    key: "avif_640",
    name: "AVIF 640 (Linux = bun ✗)",
    shortLabel: "AVIF 640",
    sharpFn: async (buf) =>
      (await getSharp())(buf, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
        .rotate()
        .resize(640, null, { fit: "inside", withoutEnlargement: true })
        .avif({ quality: 50, effort: 4 })
        .toBuffer(),
    // Bun.Image AVIF encode requires an OS AV1 encoder (macOS M3+ / Windows
    // AV1 extension); on Linux servers it rejects — that IS the measurement.
    bunFn: (buf) =>
      new bunImageCtor!(buf).resize(640, 640, { fit: "inside" }).avif({ quality: 50 }).buffer(),
    warmup: 4,
    iterations: 10,
  },
  {
    key: "parallel_x8_thumb",
    name: "Parallel x8 thumbnails",
    shortLabel: "Parallel x8",
    sharpFn: (buf) => Promise.all(Array.from({ length: 8 }, () => sharpThumb(buf))),
    bunFn: (buf) => Promise.all(Array.from({ length: 8 }, () => bunThumb(buf))),
    warmup: 4,
    iterations: 10,
  },
  {
    // Bun-only: sharp has no built-in ThumbHash (would need the `thumbhash`
    // npm package, not currently a dependency).
    key: "placeholder_lqip",
    name: "Placeholder LQIP (ThumbHash)",
    shortLabel: "LQIP",
    bunFn: (buf) => new bunImageCtor!(buf).placeholder(),
    warmup: 25,
    iterations: 50,
  },
];

// ─── Run ────────────────────────────────────────────────────────────────────

test("Sharp vs Bun.Image image pipeline", async () => {
  if (!bunImageCtor) {
    // Not a silent soft-skip: the environment cannot run half of the comparison.
    console.warn(
      "\n⚠️  Bun.Image is unavailable in this runtime (requires Bun ≥ 1.4). " +
        "Run this benchmark with `bun test tests/benchmarks/sharp-vs-bun-image.test.ts`.\n",
    );
    await exportMetric("media.engine.sharp_vs_bun.bun_image_unavailable", 1, "flag");
    return;
  }

  console.log(`🚀 Starting Sharp vs Bun.Image pipeline benchmark (Bun ${Bun.version})...\n`);
  await prepareFixtures();
  console.log(
    `   Fixtures: JPEG ${photoJpeg.length.toLocaleString()} B (2400×1800) · PNG ${photoPng.length.toLocaleString()} B (640×480)\n`,
  );

  const results: any[] = [];
  const summary: Array<{ key: string; val: number | string; unit: string }> = [
    { key: "Bun Version", val: Bun.version, unit: "" },
    { key: "Bun.Image Backend", val: Bun.Image.backend, unit: "" },
    { key: "Source JPEG", val: `${(photoJpeg.length / 1024).toFixed(1)} KiB`, unit: "2400×1800" },
  ];

  const coldFirst = async (fn: (buf: Buffer) => Promise<unknown>): Promise<number> => {
    const t0 = performance.now();
    await fn(photoJpeg);
    return performance.now() - t0;
  };

  for (const scenario of SCENARIOS) {
    forceGarbageCollection();

    if (scenario.sharpFn) {
      const cold = await coldFirst(scenario.sharpFn);
      forceGarbageCollection();
      const t = await measure(() => scenario.sharpFn!(photoJpeg), scenario);
      results.push({
        name: `Sharp ${scenario.name}`,
        layer: "Sharp",
        shortLabel: `Sharp ${scenario.shortLabel}`,
        avgMs: t.avgMs,
        p95Ms: t.p95Ms,
        rps: t.rps,
        coldFirstMs: cold,
      });
    }

    if (scenario.bunFn) {
      try {
        const cold = await coldFirst(scenario.bunFn);
        forceGarbageCollection();
        const t = await measure(() => scenario.bunFn!(photoJpeg), scenario);
        results.push({
          name: `Bun.Image ${scenario.name}`,
          layer: "Bun.Image",
          shortLabel: `Bun.Image ${scenario.shortLabel}`,
          avgMs: t.avgMs,
          p95Ms: t.p95Ms,
          rps: t.rps,
          coldFirstMs: cold,
        });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        // Windows WIC raises ENCODE_FAILED (not FORMAT_UNSUPPORTED) when the
        // AV1 Video Extension is missing — same "no OS encoder" condition.
        const isUnsupported =
          code === "ERR_IMAGE_FORMAT_UNSUPPORTED" ||
          (code === "ERR_IMAGE_ENCODE_FAILED" && scenario.key === "avif_640");
        if (isUnsupported) {
          // The OS backend cannot encode this format (e.g. AVIF without an OS
          // AV1 encoder) — the sharp side is still measured; Bun.Image reports
          // "unsupported" and the capability matrix documents the gap.
          summary.push({
            key: `${scenario.shortLabel} (Bun.Image)`,
            val: "unsupported on this platform",
            unit: code,
          });
          continue;
        }
        throw err;
      }
    }
    forceGarbageCollection();
  }

  // ── Output-size divergence: same pixels, different encoders ──
  const sharp = await getSharp();
  const sharpWebp = await sharpThumb(photoJpeg);
  const bunWebp = await bunThumb(photoJpeg);
  const webpEffort0 = await sharpThumbEffort(0)(photoJpeg);
  const webpEffort1 = await sharpThumbEffort(1)(photoJpeg);
  const sharpJpeg = await sharp(photoJpeg, { limitInputPixels: LIMIT_INPUT_PIXELS, failOn: "none" })
    .rotate()
    .resize(1920, null, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const sharpJpegTurbo = await sharp(photoJpeg, {
    limitInputPixels: LIMIT_INPUT_PIXELS,
    failOn: "none",
  })
    .rotate()
    .resize(1920, null, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const bunJpeg = await new bunImageCtor!(photoJpeg)
    .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .buffer();

  // ── Correctness cross-check: dimensions must agree ──
  const sharpDims = await sharp(bunWebp).metadata();
  const bunDims = await new bunImageCtor!(sharpWebp).metadata();
  const dimsAgree = sharpDims.width === 320 && bunDims.width === 320;
  console.log(
    `   Cross-check: sharp→320×${sharpDims.height} · bun→320×${bunDims.height} — ` +
      (dimsAgree ? "dimensions agree ✓" : "DIMENSION MISMATCH ✗"),
  );

  summary.push(
    { key: "Thumb 320 webp bytes — Sharp", val: sharpWebp.length, unit: "B" },
    { key: "Thumb 320 webp bytes — effort 1", val: webpEffort1.length, unit: "B" },
    { key: "Thumb 320 webp bytes — effort 0", val: webpEffort0.length, unit: "B" },
    { key: "Thumb 320 webp bytes — Bun.Image", val: bunWebp.length, unit: "B" },
    {
      key: "Thumb 320 webp size delta (effort 1)",
      val: `${(((webpEffort1.length - sharpWebp.length) / sharpWebp.length) * 100).toFixed(1)}%`,
      unit: "vs effort 4",
    },
    {
      key: "Thumb 320 webp size delta (effort 0)",
      val: `${(((webpEffort0.length - sharpWebp.length) / sharpWebp.length) * 100).toFixed(1)}%`,
      unit: "vs effort 4",
    },
    {
      key: "Thumb 320 webp size delta",
      val: `${(((bunWebp.length - sharpWebp.length) / sharpWebp.length) * 100).toFixed(1)}%`,
      unit: "bun vs sharp",
    },
    { key: "JPEG 1920 bytes — Sharp (mozjpeg)", val: sharpJpeg.length, unit: "B" },
    { key: "JPEG 1920 bytes — Sharp (turbo)", val: sharpJpegTurbo.length, unit: "B" },
    { key: "JPEG 1920 bytes — Bun.Image", val: bunJpeg.length, unit: "B" },
    {
      key: "JPEG 1920 size delta (turbo vs mozjpeg)",
      val: `${(((sharpJpegTurbo.length - sharpJpeg.length) / sharpJpeg.length) * 100).toFixed(1)}%`,
      unit: "same engine, one line",
    },
    {
      key: "JPEG 1920 size delta",
      val: `${(((bunJpeg.length - sharpJpeg.length) / sharpJpeg.length) * 100).toFixed(1)}%`,
      unit: "bun vs sharp",
    },
  );

  // ── Capability gap: operations the SveltyCMS media pipeline needs ──
  const capabilities: Array<{ key: string; val: number | string; unit: string }> = [
    { key: "extract (region crop)", val: "Sharp ✓ / Bun.Image ✗", unit: "image editor" },
    {
      key: "composite / watermark (blend over)",
      val: "Sharp ✓ / Bun.Image ✗",
      unit: "manipulateMedia",
    },
    { key: "raw RGBA input (circle mask)", val: "Sharp ✓ / Bun.Image ✗", unit: "manipulateMedia" },
    { key: "blur (region redaction)", val: "Sharp ✓ / Bun.Image ✗", unit: "manipulateMedia" },
    { key: "linear (contrast)", val: "Sharp ✓ / Bun.Image ✗", unit: "manipulateMedia" },
    { key: "grayscale", val: "Sharp ✓ / Bun.Image ~ (saturation 0)", unit: "manipulateMedia" },
    {
      key: "rotate arbitrary angle",
      val: "Sharp ✓ / Bun.Image ✗ (90° steps)",
      unit: "manipulateMedia",
    },
    { key: 'resize fit "contain"', val: "Sharp ✓ / Bun.Image ✗", unit: "watermark sizing" },
    { key: "ensureAlpha", val: "Sharp ✓ / Bun.Image ✗", unit: "watermark" },
    { key: "AVIF encode on Linux server", val: "Sharp ✓ / Bun.Image ✗", unit: "variants" },
    {
      key: "animated GIF/WebP handling",
      val: "Sharp ✓ / Bun.Image ✗ (first frame)",
      unit: "media",
    },
    { key: "SVG input / output", val: "Sharp ✓ / Bun.Image ✗", unit: "media" },
    { key: "EXIF auto-orient", val: "Sharp ✓ / Bun.Image ✓", unit: "shared" },
    { key: "progressive JPEG", val: "Sharp ✓ / Bun.Image ✓", unit: "shared" },
    { key: "palette PNG", val: "Sharp ✓ / Bun.Image ✓", unit: "shared" },
    {
      key: "LQIP placeholder (ThumbHash)",
      val: "Sharp ✗ (needs thumbhash pkg) / Bun.Image ✓ built-in",
      unit: "LQIP",
    },
  ];

  printTruthTable({
    title: "SVELTYCMS — SHARP vs BUN.IMAGE PIPELINE",
    shortLabel: "Sharp-vs-BunImage",
    subtitle: "Identical CMS variant work · decode → auto-orient → resize → encode",
    results,
  });

  printSummaryTable(summary, "Sharp vs Bun.Image Summary");
  printSummaryTable(capabilities, "Capability Gap (CMS media pipeline needs)");

  // ── Metrics export ──
  for (const r of results) {
    await exportResult(r);
    const engine = r.layer === "Sharp" ? "sharp" : "bun_image";
    await exportMetric(
      `media.engine.sharp_vs_bun.${r.shortLabel.replace(/\s+/g, "_").toLowerCase()}.${engine}_ms`,
      r.avgMs,
      "ms",
    );
  }
  for (const scenario of SCENARIOS) {
    const sharpRow = results.find((r) => r.name === `Sharp ${scenario.name}`);
    const bunRow = results.find((r) => r.name === `Bun.Image ${scenario.name}`);
    if (sharpRow && bunRow) {
      const deltaPct = ((bunRow.avgMs - sharpRow.avgMs) / sharpRow.avgMs) * 100;
      await exportMetric(`media.engine.sharp_vs_bun.${scenario.key}.delta_pct`, deltaPct, "%");
    }
  }

  console.log(
    "\n💡 Note: this compares only the shared operation surface. Composite/watermark, raw masks," +
      "\n   region extract, blur, arbitrary rotation and Linux AVIF encode have no Bun.Image" +
      "\n   equivalent — sharp stays required for the image editor baking pipeline.\n",
  );
}, 600_000);
