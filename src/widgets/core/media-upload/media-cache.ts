/**
 * @file src/widgets/core/media-upload/media-cache.ts
 * @description Per-page cache for resolved media documents.
 *
 * The Media widget and its read-only display pillar both hydrate assets from
 * `/api/media/:id`. An entry list can render dozens of cells for the same file,
 * so the document is fetched once and shared for the lifetime of the page.
 */

import type { MediaFile } from "./types";

export const mediaCache = new Map<string, MediaFile>();
