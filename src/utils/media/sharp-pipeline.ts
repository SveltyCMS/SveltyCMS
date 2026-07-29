/**
 * @file src/utils/media/sharp-pipeline.ts
 * @description Typed facade for the Sharp image processing library.
 *
 * Provides a self-contained type surface for all Sharp operations used
 * across the media service, eliminating the need for `any` casts when
 * lazily importing sharp.
 */

import type sharp from "sharp";
import type {
  Region,
  ResizeOptions,
  RotateOptions,
  Matrix3x3,
  Matrix4x4,
  BlurOptions,
  OverlayOptions,
  PngOptions,
  WebpOptions,
  AvifOptions,
  JpegOptions,
  OutputInfo,
  Metadata,
} from "sharp";

// ---------------------------------------------------------------------------
// Pipeline interface
// ---------------------------------------------------------------------------

export interface SharpPipeline {
  // -- Geometry --
  resize(width?: number | null, height?: number | null, options?: ResizeOptions): SharpPipeline;
  rotate(angle?: number, options?: RotateOptions): SharpPipeline;
  flip(flip?: boolean): SharpPipeline;
  flop(flop?: boolean): SharpPipeline;
  extract(region: Region): SharpPipeline;

  // -- Colour --
  modulate(options?: {
    brightness?: number;
    saturation?: number;
    hue?: number;
    lightness?: number;
  }): SharpPipeline;
  linear(a?: number | number[] | null, b?: number | number[]): SharpPipeline;
  recomb(inputMatrix: Matrix3x3 | Matrix4x4): SharpPipeline;
  grayscale(grayscale?: boolean): SharpPipeline;
  greyscale(greyscale?: boolean): SharpPipeline;

  // -- Channel --
  ensureAlpha(alpha?: number): SharpPipeline;

  // -- Filter --
  blur(sigma?: number | boolean | BlurOptions): SharpPipeline;

  // -- Composite --
  composite(images: OverlayOptions[]): SharpPipeline;

  // -- Output format --
  png(options?: PngOptions): SharpPipeline;
  webp(options?: WebpOptions): SharpPipeline;
  avif(options?: AvifOptions): SharpPipeline;
  jpeg(options?: JpegOptions): SharpPipeline;

  // -- Output --
  toBuffer(): Promise<Buffer>;
  toBuffer(options: { resolveWithObject: false }): Promise<Buffer>;
  toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: OutputInfo }>;

  // -- Introspection --
  metadata(): Promise<Metadata>;
  clone(): SharpPipeline;
}

// ---------------------------------------------------------------------------
// Factory + re-exports
// ---------------------------------------------------------------------------

export type SharpFactory = typeof sharp;
export type SharpOverlayOptions = OverlayOptions;
