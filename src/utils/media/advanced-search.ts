/**
 * @file src/utils/media/advanced-search.ts
 * @description Advanced client-side media search with filtering & suggestions
 */

import { isMediaImage, isStoredMedia, type MediaImage, type MediaItem } from "./media-models";

export interface SearchCriteria {
  aspectRatio?: "landscape" | "portrait" | "square";
  camera?: string;
  dominantColor?: string;
  // Text
  filename?: string;
  fileTypes?: string[]; // MIME types

  // Metadata
  hasEXIF?: boolean;
  hashMatch?: string;
  location?: string;
  maxHeight?: number;
  maxSize?: number;
  maxWidth?: number;
  minHeight?: number;

  // File
  minSize?: number; // bytes

  // Dimensions (images)
  minWidth?: number;

  // Duplicates
  showDuplicatesOnly?: boolean;
  tags?: string[];

  // Dates
  uploadedAfter?: Date;
  uploadedBefore?: Date;
}

export interface SearchResult {
  files: MediaItem[];
  /** Per-file matched-criteria list. One entry per file in `files`, in the same order. */
  matched: string[][];
  total: number;
}

/** Advanced search with detailed matched criteria */
export function advancedSearch(files: MediaItem[], criteria: SearchCriteria): SearchResult {
  const result: MediaItem[] = [];
  const matched: string[][] = [];

  // O(N) pre-calculation for duplicates
  const hashCounts = new Map<string, number>();
  if (criteria.showDuplicatesOnly) {
    for (const f of files) {
      if (isStoredMedia(f) && f.hash) {
        hashCounts.set(f.hash, (hashCounts.get(f.hash) ?? 0) + 1);
      }
    }
  }

  for (const file of files) {
    let ok = true;
    const fileMatched: string[] = [];

    if (criteria.filename) {
      ok &&= file.filename.toLowerCase().includes(criteria.filename.toLowerCase());
      if (ok) fileMatched.push(`Filename: "${criteria.filename}"`);
    }

    if (criteria.tags?.length) {
      const fileTags = (file.metadata?.tags as string[] | undefined) ?? [];
      ok &&= criteria.tags.every((t) =>
        fileTags.some((ft) => ft.toLowerCase() === t.toLowerCase()),
      );
      if (ok) fileMatched.push(`Tags: ${criteria.tags.join(", ")}`);
    }

    // Image-specific — use the proper type guard
    if (isMediaImage(file)) {
      const img = file as MediaImage;

      if (criteria.minWidth !== undefined) {
        ok &&= img.width >= criteria.minWidth;
      }
      if (criteria.maxWidth !== undefined) {
        ok &&= img.width <= criteria.maxWidth;
      }
      if (criteria.minHeight !== undefined) {
        ok &&= img.height >= criteria.minHeight;
      }
      if (criteria.maxHeight !== undefined) {
        ok &&= img.height <= criteria.maxHeight;
      }

      if (criteria.aspectRatio && img.width && img.height) {
        const ratio = img.width / img.height;
        const isLandscape = ratio > 1.1;
        const isPortrait = ratio < 0.9;
        const isSquare = ratio >= 0.9 && ratio <= 1.1;

        ok &&=
          criteria.aspectRatio === "landscape"
            ? isLandscape
            : criteria.aspectRatio === "portrait"
              ? isPortrait
              : isSquare;

        if (ok) fileMatched.push(`Aspect: ${criteria.aspectRatio}`);
      }
    }

    // Size checks require stored media (has `size` field)
    if (isStoredMedia(file)) {
      if (criteria.minSize !== undefined) {
        ok &&= file.size >= criteria.minSize;
      }
      if (criteria.maxSize !== undefined) {
        ok &&= file.size <= criteria.maxSize;
      }
    }

    // MIME type check also uses `mimeType` from stored media
    if (criteria.fileTypes?.length) {
      ok &&= isStoredMedia(file) && criteria.fileTypes.includes(file.mimeType);
    }

    if (criteria.uploadedAfter) {
      ok &&= new Date(file.createdAt) >= criteria.uploadedAfter;
    }
    if (criteria.uploadedBefore) {
      ok &&= new Date(file.createdAt) <= criteria.uploadedBefore;
    }

    if (criteria.hasEXIF !== undefined) {
      ok &&= !!file.metadata?.exif === criteria.hasEXIF;
    }

    if (criteria.camera) {
      const exif = file.metadata?.exif as { Make?: string; Model?: string } | undefined;
      const cam = `${exif?.Make ?? ""} ${exif?.Model ?? ""}`.trim().toLowerCase();
      ok &&= cam.includes(criteria.camera.toLowerCase());
    }

    if (criteria.location) {
      const exif = file.metadata?.exif as
        | { GPSLatitude?: number; GPSLongitude?: number; location?: string }
        | undefined;
      const loc = (exif?.location ?? "").toLowerCase();
      ok &&= loc.includes(criteria.location.toLowerCase());
    }

    if (criteria.showDuplicatesOnly && isStoredMedia(file)) {
      const count = hashCounts.get(file.hash) ?? 0;
      ok &&= count > 1;
    }

    if (criteria.dominantColor) {
      const metadata = file.metadata as { dominantColor?: string } | undefined;
      ok &&=
        !!metadata?.dominantColor &&
        metadata.dominantColor.toLowerCase().includes(criteria.dominantColor.toLowerCase());
    }

    if (ok) {
      result.push(file);
      matched.push(fileMatched);
    }
  }

  return {
    files: result,
    total: result.length,
    matched,
  };
}

/** Search suggestions from media library */
export function getSuggestions(files: MediaItem[]) {
  const tags = new Set<string>();
  const cameras = new Set<string>();
  const dimensions = new Map<string, number>();

  for (const file of files) {
    const fileTags = file.metadata?.tags as string[] | undefined;
    if (fileTags) {
      for (const t of fileTags) {
        tags.add(t);
      }
    }

    const exif = file.metadata?.exif as { Make?: string; Model?: string } | undefined;
    if (exif) {
      const cam = `${exif.Make ?? ""} ${exif.Model ?? ""}`.trim();
      if (cam) {
        cameras.add(cam);
      }
    }

    if (isMediaImage(file)) {
      const key = `${file.width}x${file.height}`;
      dimensions.set(key, (dimensions.get(key) ?? 0) + 1);
    }
  }

  return {
    tags: Array.from(tags).sort(),
    cameras: Array.from(cameras).sort(),
    commonDimensions: Array.from(dimensions.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([dim]) => dim),
    sizeRanges: [
      { min: 0, max: 100_000, label: "< 100 KB" },
      { min: 100_000, max: 1_000_000, label: "100 KB – 1 MB" },
      { min: 1_000_000, max: 5_000_000, label: "1 – 5 MB" },
      { min: 5_000_000, max: 10_000_000, label: "5 – 10 MB" },
      { min: 10_000_000, max: Number.POSITIVE_INFINITY, label: "> 10 MB" },
    ],
  };
}

/** Alias for backward compatibility */
export const getSearchSuggestions = getSuggestions;
