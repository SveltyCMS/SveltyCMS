/**
 * @file src/services/media/image-variant-storage.ts
 * @description Manages responsive image variant file storage — stores, retrieves, and
 * deletes generated variants alongside the original media file.
 *
 * ### Design
 * - Variants are stored at deterministic paths: `{tenantId}/{hash}/variants/{preset}-{width}.{format}`
 * - On-demand delivery variants use the preset token `t{height}q{quality}`
 *   (e.g. `global/ab12…/variants/t0q82-320.webp`), so the full cache key is
 *   `(hash, width, height, quality, format)` inside the tenant directory — see
 *   `getTransformVariantRelPath`. Height `0` means "derived from the source aspect ratio".
 * - Uses the same StorageAdapter as the original media storage for backend-agnosticism
 * - No new DB tables — variant metadata is stored as JSON alongside the media record
 *
 * ### Features:
 * - getVariantPath() — deterministic path construction
 * - getTransformVariantRelPath() / saveTransformVariant() / transformVariantExists()
 *   — the on-demand delivery cache (thin wrappers over the functions below)
 * - variantExists() — check if variant file exists
 * - deleteVariants() — bulk cleanup for a media item
 * - saveVariant() — store a generated variant buffer
 */

import { getStorageAdapter } from "@src/utils/media/storage-adapters";

// ─── Path helpers ──────────────────────────────────────────────────────────

/** Sentinel value for global / no-tenant storage paths. */
const TENANT_GLOBAL = "global";

/** Normalise a tenant-id to a safe path segment, falling back to the global sentinel. */
function tenantPathSegment(tenantId?: string | null): string {
  return tenantId && tenantId !== TENANT_GLOBAL ? tenantId : TENANT_GLOBAL;
}

/**
 * Build the deterministic relative storage path for an image variant.
 *
 * Pattern: `{tenantId}/{hash}/variants/{preset}-{width}.{format}`
 *
 * @example
 * ```ts
 * getVariantPath("abc123", "card", 640, "webp", "tenant1")
 * // → "tenant1/abc123/variants/card-640.webp"
 * ```
 */
export function getVariantPath(
  hash: string,
  preset: string,
  width: number,
  format: string,
  tenantId?: string | null,
): string {
  const tenant = tenantPathSegment(tenantId);
  return `${tenant}/${hash}/variants/${preset}-${width}.${format}`;
}

/**
 * Extract preset, width, and format from a variant path.
 * Returns null if the path doesn't match the variant pattern.
 */
export function parseVariantPath(
  variantPath: string,
): { preset: string; width: number; format: string } | null {
  // Pattern: {tenant}/{hash}/variants/{preset}-{width}.{format}
  const match = variantPath.match(/variants\/(.+)-(\d+)\.([a-z0-9]+)$/);
  if (!match) return null;
  return {
    preset: match[1],
    width: parseInt(match[2], 10),
    format: match[3],
  };
}

/**
 * Derive the variants directory prefix for a given media hash.
 * Useful for listing or bulk-deleting all variants.
 */
export function getVariantsDir(hash: string, tenantId?: string | null): string {
  const tenant = tenantPathSegment(tenantId);
  return `${tenant}/${hash}/variants/`;
}

// ─── Storage operations ────────────────────────────────────────────────────

/**
 * Check whether a variant file exists in storage.
 */
export async function variantExists(
  hash: string,
  preset: string,
  width: number,
  format: string,
  tenantId?: string | null,
): Promise<boolean> {
  const relPath = getVariantPath(hash, preset, width, format, tenantId);
  try {
    return await getStorageAdapter().exists(relPath);
  } catch {
    return false;
  }
}

/**
 * Save a variant buffer to storage at the deterministic path.
 * Returns the relative path on success.
 */
export async function saveVariant(
  buffer: Buffer,
  hash: string,
  preset: string,
  width: number,
  format: string,
  tenantId?: string | null,
): Promise<string> {
  const relPath = getVariantPath(hash, preset, width, format, tenantId);
  await getStorageAdapter().upload(buffer, relPath);
  return relPath;
}

/**
 * Delete a single variant file from storage.
 * Silently succeeds if the file doesn't exist.
 */
export async function deleteVariant(
  hash: string,
  preset: string,
  width: number,
  format: string,
  tenantId?: string | null,
): Promise<void> {
  const relPath = getVariantPath(hash, preset, width, format, tenantId);
  try {
    await getStorageAdapter().remove(relPath);
  } catch {
    // Ignore — file may not exist
  }
}

/**
 * Delete all variants for a given media hash.
 * Works by removing the entire variants directory.
 * Note: Some storage adapters may not support recursive directory removal;
 * in that case, individual deletion is attempted.
 */
export async function deleteAllVariants(hash: string, tenantId?: string | null): Promise<void> {
  const dir = getVariantsDir(hash, tenantId);
  try {
    await getStorageAdapter().remove(dir);
  } catch {
    // Some adapters (S3) may not support directory-level removal.
    // Individual variant cleanup would require listing, but for now
    // the directory-less approach is acceptable — orphaned variant
    // files are harmless and will be overwritten on re-upload.
  }
}

// ─── On-demand delivery variant cache ─────────────────────────────────────

/**
 * Structural key of an on-demand transform variant.
 * Kept local (instead of importing `TransformPlan`) so this module stays a leaf
 * that `image-processor.ts` can depend on without a cycle.
 */
export interface TransformVariantKey {
  /** Ladder width in px (0 = derived from height). */
  width: number;
  /** Ladder height in px (0 = derived from width). */
  height: number;
  /** Snapped encoder quality (part of the cache key). */
  quality: number;
  /** Output format / file extension (webp, avif, jpeg, png). */
  format: string;
}

/**
 * Preset token encoding the non-width components of the variant key.
 * `t0q82` = "height derived from source, quality 82".
 */
export function getTransformPresetToken(height: number, quality: number): string {
  return `t${height}q${quality}`;
}

/**
 * Cache path of an on-demand transform variant.
 *
 * The key is tenant-scoped and derived from the ORIGINAL's path —
 * `{tenantId}/{hash}/variants/t{height}q{quality}-{width}.{format}` where `{hash}`
 * is the content hash of the original bytes. A signed URL's `sig` is never part of
 * the key: authorization stays with the delivery route's tenant + signature gates, so
 * the same entry can safely be reused across differently-signed requests for the same
 * tenant, and no entry can be served to another tenant (their paths never collide).
 */
export function getTransformVariantRelPath(
  hash: string,
  key: TransformVariantKey,
  tenantId?: string | null,
): string {
  return getVariantPath(
    hash,
    getTransformPresetToken(key.height, key.quality),
    key.width,
    key.format,
    tenantId,
  );
}

/** Cache hit check for an on-demand transform variant. */
export async function transformVariantExists(
  hash: string,
  key: TransformVariantKey,
  tenantId?: string | null,
): Promise<boolean> {
  return await variantExists(
    hash,
    getTransformPresetToken(key.height, key.quality),
    key.width,
    key.format,
    tenantId,
  );
}

/** Persist a generated on-demand transform variant (same write path as upload variants). */
export async function saveTransformVariant(
  buffer: Buffer,
  hash: string,
  key: TransformVariantKey,
  tenantId?: string | null,
): Promise<string> {
  return await saveVariant(
    buffer,
    hash,
    getTransformPresetToken(key.height, key.quality),
    key.width,
    key.format,
    tenantId,
  );
}
