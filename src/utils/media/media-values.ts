/**
 * @file src/utils/media/media-values.ts
 * @description Runtime value maps, type guards & normalisers for CMS media assets.
 *
 * Split out of `media-models.ts` so client components can import the handful of
 * runtime helpers without dragging the whole type module into the client graph.
 *
 * Features:
 * - `as const` maps double as the runtime valid-value list (no duplicated arrays)
 * - `MediaType` / `MediaAccess` / `MediaProcessingStatus` value + type pairs
 * - Type guards (`isMediaImage`, `isStoredMedia`) and MIME → media-type mapping
 * - Derivative-format normalisation with a fail-safe default
 *
 * The edge back to `media-models.ts` is `import type` only, so it is erased at
 * build time and the runtime dependency stays one-way: `media-models → media-values`.
 */

import type { DerivativeFormat, MediaImage, MediaItem, StoredMedia } from "./media-models";

/* -------------------------------------------------------------------------- */
/* Value maps — single source of truth for both types AND runtime lists       */
/* -------------------------------------------------------------------------- */

const MediaType = {
  Image: "image",
  Video: "video",
  Audio: "audio",
  Document: "document",
  RemoteVideo: "remoteVideo",
} as const;

export type MediaType = (typeof MediaType)[keyof typeof MediaType];

const MediaAccess = {
  Public: "public",
  Private: "private",
  Protected: "protected",
} as const;

export type MediaAccess = (typeof MediaAccess)[keyof typeof MediaAccess];

/**
 * Derivative pipeline state stored on the media document.
 *
 * `processing` — the original is safe, derived renditions are still being written.
 * `ready`      — every rendition the pipeline produces is available.
 * `failed`     — derivation failed; the original remains servable.
 */
export const MediaProcessingStatus = {
  Processing: "processing",
  Ready: "ready",
  Failed: "failed",
} as const;

export type MediaProcessingStatusValue =
  (typeof MediaProcessingStatus)[keyof typeof MediaProcessingStatus];

/** Normalise a persisted status value; `undefined` means "not recorded yet". */
export function normalizeProcessingStatus(value: unknown): MediaProcessingStatusValue | undefined {
  if (value === MediaProcessingStatus.Processing) return MediaProcessingStatus.Processing;
  if (value === MediaProcessingStatus.Ready) return MediaProcessingStatus.Ready;
  if (value === MediaProcessingStatus.Failed) return MediaProcessingStatus.Failed;
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Derivative output formats                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Default derivative format — JPEG, the cheapest encode of the set, so the ladder
 * cost stays dominated by the resize rather than the encoder.
 */
const DEFAULT_DERIVATIVE_FORMAT: DerivativeFormat = "jpeg";

/**
 * Normalise an operator-configured derivative format. Fail-safe by design: a
 * non-string or an unrecognised value keeps `DEFAULT_DERIVATIVE_FORMAT` instead of
 * guessing a format the install may not be able to write. `jpg` is the historical
 * spelling of `jpeg` and means the same encoder.
 */
export function normalizeDerivativeFormat(value: unknown): DerivativeFormat {
  if (typeof value !== "string") return DEFAULT_DERIVATIVE_FORMAT;
  switch (value.trim().toLowerCase()) {
    case "webp":
      return "webp";
    case "avif":
      return "avif";
    case "original":
      return "original";
    case "jpg":
    case "jpeg":
      return "jpeg";
    default:
      return DEFAULT_DERIVATIVE_FORMAT;
  }
}

/* -------------------------------------------------------------------------- */
/* Type guards & runtime helpers                                              */
/* -------------------------------------------------------------------------- */

export const isMediaImage = (item: MediaItem): item is MediaImage => item.type === MediaType.Image;

export const isStoredMedia = (item: MediaItem): item is StoredMedia =>
  item.type !== MediaType.RemoteVideo;

const TOP_LEVEL_MIMES = new Set<string>([MediaType.Image, MediaType.Video, MediaType.Audio]);

export function mediaTypeFromMime(mimeType: string): MediaType {
  const top = mimeType.split("/", 1)[0]?.toLowerCase() ?? "";
  return TOP_LEVEL_MIMES.has(top) ? (top as MediaType) : MediaType.Document;
}

/* -------------------------------------------------------------------------- */
/* Public alias                                                               */
/* -------------------------------------------------------------------------- */

export { MediaType as MediaTypeEnum };
