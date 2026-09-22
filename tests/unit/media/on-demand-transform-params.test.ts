/**
 * @file tests/unit/media/on-demand-transform-params.test.ts
 * @description Unit tests for the on-demand transform parameter helpers used by the
 * `/files/**?w=&h=&q=&fmt=` delivery path (`src/services/media/image-processor.ts`).
 *
 * Covers the security-critical surface without touching the route or Sharp:
 * - dimension clamping to the fixed ladder (no arbitrary resolutions, no disk fill)
 * - quality band + snapping
 * - SVG / GIF / non-encodable format exclusion
 * - `Accept` negotiation (`q=` ordering, wildcards, fallback to the source format)
 * - animated raster detection (WebP `VP8X` animation flag / `ANIM` chunk, AVIF `avis`)
 */

import { describe, expect, it } from "vitest";
import {
  MAX_OUTPUT_DIMENSION,
  TRANSFORM_DEFAULT_QUALITY,
  TRANSFORM_DIMENSION_STEPS,
  TRANSFORM_QUALITY_STEPS,
  TRANSFORM_SOURCE_MIME,
  isAnimatedRaster,
  negotiateTransformFormat,
  parseTransformParams,
  transformFormatToMime,
  type TransformFormat,
} from "@src/services/media/image-processor";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query.replace(/^\?/, ""));
}

// ─── Ladder contracts ───────────────────────────────────────────────────────

describe("transform ladder constants", () => {
  it("keeps dimension steps ascending and below MAX_OUTPUT_DIMENSION", () => {
    expect(TRANSFORM_DIMENSION_STEPS.length).toBeGreaterThan(3);
    const sorted = [...TRANSFORM_DIMENSION_STEPS].sort((a, b) => a - b);
    expect([...TRANSFORM_DIMENSION_STEPS]).toEqual(sorted);
    expect(Math.max(...TRANSFORM_DIMENSION_STEPS)).toBeLessThanOrEqual(MAX_OUTPUT_DIMENSION);
    expect(Math.min(...TRANSFORM_DIMENSION_STEPS)).toBeGreaterThanOrEqual(16);
  });

  it("keeps quality steps inside the 50–90 band", () => {
    expect(TRANSFORM_QUALITY_STEPS.length).toBeGreaterThan(1);
    expect([...TRANSFORM_QUALITY_STEPS].sort((a, b) => a - b)).toEqual([
      ...TRANSFORM_QUALITY_STEPS,
    ]);
    for (const q of TRANSFORM_QUALITY_STEPS) {
      expect(q).toBeGreaterThanOrEqual(50);
      expect(q).toBeLessThanOrEqual(90);
    }
    expect(TRANSFORM_QUALITY_STEPS).toContain(TRANSFORM_DEFAULT_QUALITY);
  });

  it("only allows encodable raster sources", () => {
    expect([...TRANSFORM_SOURCE_MIME].sort()).toEqual([
      "image/avif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});

// ─── (a) clamping / rejection of out-of-range dimensions ────────────────────

describe("parseTransformParams — dimension clamping", () => {
  it("snaps a width down to the nearest ladder step", () => {
    const plan = parseTransformParams(params("?w=300"), null, "image/jpeg");
    expect(plan).not.toBeNull();
    expect(plan!.width).toBe(240);
    expect(plan!.height).toBe(0);
    expect(plan!.quality).toBe(TRANSFORM_DEFAULT_QUALITY);
  });

  it("keeps an exact ladder step untouched", () => {
    expect(parseTransformParams(params("?w=320"), null, "image/jpeg")!.width).toBe(320);
  });

  it("clamps absurd widths down to the largest step instead of rejecting them", () => {
    const largest = TRANSFORM_DIMENSION_STEPS[TRANSFORM_DIMENSION_STEPS.length - 1]!;
    expect(parseTransformParams(params("?w=99999"), null, "image/jpeg")!.width).toBe(largest);
    expect(parseTransformParams(params(`?w=${largest}`), null, "image/jpeg")!.width).toBe(largest);
  });

  it("treats a box as a bounding box (w + h)", () => {
    const plan = parseTransformParams(params("?w=320&h=200"), null, "image/jpeg");
    expect(plan!.width).toBe(320);
    expect(plan!.height).toBe(192); // 200 snapped down
  });

  it("accepts a height-only request", () => {
    const plan = parseTransformParams(params("?h=240"), null, "image/jpeg");
    expect(plan!.width).toBe(0);
    expect(plan!.height).toBe(240);
  });

  it("rejects dimensions below the smallest allowed box", () => {
    expect(parseTransformParams(params("?w=8"), null, "image/jpeg")).toBeNull();
    expect(parseTransformParams(params("?w=4&h=2"), null, "image/jpeg")).toBeNull();
  });

  it("rejects zero, negative, non-numeric and absent dimensions", () => {
    expect(parseTransformParams(params("?w=0"), null, "image/jpeg")).toBeNull();
    expect(parseTransformParams(params("?w=-320"), null, "image/jpeg")).toBeNull();
    expect(parseTransformParams(params("?w=abc"), null, "image/jpeg")).toBeNull();
    expect(parseTransformParams(params("?w=320px"), null, "image/jpeg")!.width).toBe(320);
    expect(parseTransformParams(params(""), null, "image/jpeg")).toBeNull();
    expect(parseTransformParams(params("?q=80&fmt=webp"), null, "image/jpeg")).toBeNull();
  });
});

describe("parseTransformParams — quality snapping", () => {
  it("snaps quality to the nearest step inside the band", () => {
    expect(parseTransformParams(params("?w=64&q=79"), null, "image/jpeg")!.quality).toBe(80);
    expect(parseTransformParams(params("?w=64&q=1000"), null, "image/jpeg")!.quality).toBe(90);
    expect(parseTransformParams(params("?w=64&q=1"), null, "image/jpeg")!.quality).toBe(50);
    expect(parseTransformParams(params("?w=64&q=abc"), null, "image/jpeg")!.quality).toBe(
      TRANSFORM_DEFAULT_QUALITY,
    );
    expect(parseTransformParams(params("?w=64&q=82"), null, "image/jpeg")!.quality).toBe(82);
  });
});

// ─── (b) SVG / animated-GIF / non-encodable-format exclusion ────────────────

describe("parseTransformParams — source and format exclusion", () => {
  it("never transforms SVG (sanitised buffer path stays intact)", () => {
    expect(parseTransformParams(params("?w=320&fmt=webp"), null, "image/svg+xml")).toBeNull();
    expect(parseTransformParams(params("?w=320"), "image/webp", "image/svg+xml")).toBeNull();
  });

  it("never transforms GIF sources (animated or not)", () => {
    expect(parseTransformParams(params("?w=320"), null, "image/gif")).toBeNull();
  });

  it("never transforms non-raster or non-encodable sources", () => {
    for (const mime of [
      "image/tiff",
      "image/bmp",
      "image/heic",
      "application/pdf",
      "video/mp4",
      "application/octet-stream",
      "",
    ]) {
      expect(parseTransformParams(params("?w=320&fmt=webp"), null, mime)).toBeNull();
    }
  });

  it("rejects an explicit format that cannot be encoded", () => {
    for (const fmt of ["svg", "image/svg+xml", "gif", "tiff", "bmp", "webp;evil", "text/html"]) {
      expect(parseTransformParams(params(`?w=320&fmt=${fmt}`), null, "image/jpeg")).toBeNull();
    }
  });

  it("accepts the documented explicit formats (fmt/format, jpg alias, mime form)", () => {
    const cases: Array<[string, TransformFormat]> = [
      ["?w=320&fmt=webp", "webp"],
      ["?w=320&fmt=avif", "avif"],
      ["?w=320&fmt=jpg", "jpeg"],
      ["?w=320&format=png", "png"],
      ["?w=320&fmt=image/webp", "webp"],
      ["?w=320&fmt=WEBP", "webp"],
    ];
    for (const [query, expected] of cases) {
      const plan = parseTransformParams(params(query), null, "image/jpeg");
      expect(plan, query).not.toBeNull();
      expect(plan!.format, query).toBe(expected);
      expect(plan!.explicitFormat, query).toBe(true);
    }
  });

  it("lets an explicit format win over the Accept header", () => {
    const plan = parseTransformParams(
      params("?w=320&fmt=png"),
      "image/webp,image/avif",
      "image/jpeg",
    );
    expect(plan!.format).toBe("png");
  });
});

// ─── (c) Accept negotiation ─────────────────────────────────────────────────

describe("negotiateTransformFormat", () => {
  it("falls back to the source format without an Accept header", () => {
    expect(negotiateTransformFormat(null, "jpeg")).toBe("jpeg");
    expect(negotiateTransformFormat("", "png")).toBe("png");
  });

  it("picks the first encodable type in q-order", () => {
    expect(negotiateTransformFormat("image/avif,image/webp,*/*;q=0.8", "jpeg")).toBe("avif");
    expect(negotiateTransformFormat("image/webp;q=0.9, image/jpeg;q=0.8", "jpeg")).toBe("webp");
    expect(negotiateTransformFormat("image/jpeg;q=0.9, image/webp;q=0.5", "png")).toBe("jpeg");
    expect(negotiateTransformFormat("image/webp ; q=0.5 , image/avif ; q=0.4", "jpeg")).toBe(
      "webp",
    );
  });

  it("ignores wildcards, q=0 entries and non-encodable types", () => {
    expect(negotiateTransformFormat("*/*", "jpeg")).toBe("jpeg");
    expect(negotiateTransformFormat("image/*", "png")).toBe("png");
    expect(negotiateTransformFormat("image/avif;q=0, image/webp;q=0", "jpeg")).toBe("jpeg");
    expect(negotiateTransformFormat("image/tiff, image/heic", "jpeg")).toBe("jpeg");
    expect(negotiateTransformFormat("text/html;q=0.9", "webp")).toBe("webp");
  });

  it("treats an unparseable q-value as q=1", () => {
    expect(negotiateTransformFormat("image/webp;q=abc", "jpeg")).toBe("webp");
  });

  it("negotiates through parseTransformParams", () => {
    const plan = parseTransformParams(
      params("?w=320&h=180"),
      "image/avif,image/webp,*/*;q=0.8",
      "image/jpeg",
    );
    expect(plan!.format).toBe("avif");
    expect(plan!.explicitFormat).toBe(false);
  });
});

// ─── Animated raster detection ──────────────────────────────────────────────

/** RIFF/WebP header: 4-byte magic, 4-byte size, `WEBP`, chunk id at 12, flags at 20. */
function webpHeader(chunkId: string, flags = 0): Buffer {
  const buf = Buffer.alloc(64);
  buf.write("RIFF", 0, "ascii");
  buf.write("WEBP", 8, "ascii");
  buf.write(chunkId, 12, "ascii");
  buf[20] = flags;
  return buf;
}

/** ISO-BMFF ftyp header with the given major brand. */
function ftypHeader(brand: string): Buffer {
  const buf = Buffer.alloc(64);
  buf.write("ftyp", 4, "ascii");
  buf.write(brand, 8, "ascii");
  return buf;
}

describe("isAnimatedRaster", () => {
  it("detects an animated WebP via the VP8X animation flag", () => {
    expect(isAnimatedRaster(webpHeader("VP8X", 0x02), "image/webp")).toBe(true);
    expect(isAnimatedRaster(webpHeader("VP8X", 0x00), "image/webp")).toBe(false);
  });

  it("detects an animated WebP via an explicit ANIM chunk", () => {
    const buf = webpHeader("VP8X", 0x00);
    buf.write("ANIM", 32, "ascii");
    expect(isAnimatedRaster(buf, "image/webp")).toBe(true);
  });

  it("keeps static WebP transformable", () => {
    expect(isAnimatedRaster(webpHeader("VP8 "), "image/webp")).toBe(false);
  });

  it("distinguishes an AVIF sequence (avis) from a still AVIF", () => {
    expect(isAnimatedRaster(ftypHeader("avis"), "image/avif")).toBe(true);
    expect(isAnimatedRaster(ftypHeader("avif"), "image/avif")).toBe(false);
  });

  it("never reports animation for a JPEG source", () => {
    expect(isAnimatedRaster(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(false);
  });
});

describe("transformFormatToMime", () => {
  it("maps every encodable format to its content type", () => {
    expect(transformFormatToMime("webp")).toBe("image/webp");
    expect(transformFormatToMime("avif")).toBe("image/avif");
    expect(transformFormatToMime("jpeg")).toBe("image/jpeg");
    expect(transformFormatToMime("png")).toBe("image/png");
  });
});
