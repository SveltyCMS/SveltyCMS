/**
 * @file src/utils/media/media-lifecycle.server.ts
 * @description Reference-aware media blob lifecycle: version pruning, orphan
 * cleanup, and derivative-processing status reconciliation.
 *
 * ### Design
 * - **DB is the source of truth.** Storage adapters cannot list a prefix on every
 *   backend, so candidates are always derived from records (active `hash` plus
 *   `metadata.versions[].hash`) — never from a filesystem/object-store walk.
 * - **Reference-aware deletion.** A hash is released only when no media row still
 *   points at it, either as its active original or through a retained version.
 *   Variant directories and original blobs are content-addressed, so a released
 *   hash can never be served from a stale cache entry.
 * - **Retention is explicit.** `cleanupMediaVersions` keeps the newest
 *   `keepVersions` entries per asset (default 10). Pruned entries are the only
 *   release candidates; a version that shares a hash with a retained entry is
 *   never released.
 * - **Status is derived, then persisted.** `syncMediaProcessingStatus` derives
 *   `processing | ready | failed` from the record's actual derivatives, repairs
 *   legacy rows that predate the field, and optionally re-queues missing work.
 *
 * Features:
 * - `isHashReferenced()` — reference probe shared by delete + cleanup
 * - `cleanupMediaVersions()` — retention pruning + orphan blob release
 * - `syncMediaProcessingStatus()` — status reconciliation (optionally re-queue)
 */

import { logger } from "@src/utils/logger";
import { deleteAllVariants } from "@src/services/media/image-variant-storage";
import type {
  BaseEntity,
  CmsMediaMetadata,
  DatabaseId,
  EntityUpdate,
  IDBAdapter,
  QueryFilter,
} from "@src/databases/db-interface";
import { buildOriginalRelPath } from "./media-utils";
import { normalizeProcessingStatus, type MediaProcessingStatusValue } from "./media-models";
import { getStorageAdapter } from "./storage-adapters";
import { scheduleVariantJob } from "./variant-job-scheduler.server";

const SCAN_PAGE_SIZE = 500;
/** Upper bound on rows per cleanup/sync pass — keeps an admin command bounded. */
const SCAN_MAX_ROWS = 50_000;
export const MEDIA_VERSION_RETENTION_DEFAULT = 10;

/** Minimal row shape both lifecycle commands need. */
interface MediaLifecycleRow extends BaseEntity {
  _id: DatabaseId;
  filename?: string;
  hash?: string;
  metadata?: {
    imageVariants?: unknown[];
    processingError?: string | null;
    processingStatus?: unknown;
    versions?: MediaLifecycleVersion[];
    [key: string]: unknown;
  };
  mimeType?: string;
  path?: string;
  size?: number;
  thumbnails?: Record<string, unknown>;
}

interface MediaLifecycleVersion {
  version: number;
  action?: string;
  createdAt?: string;
  filename?: string;
  hash?: string;
  imageVariants?: unknown[];
  mimeType?: string;
  path?: string;
  size?: number;
  thumbnails?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Reference helpers ────────────────────────────────────────────────────

function versionList(metadata: MediaLifecycleRow["metadata"]): MediaLifecycleVersion[] {
  const raw = metadata?.versions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is MediaLifecycleVersion =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as MediaLifecycleVersion).version === "number",
  );
}

/** Load every media row for a tenant, paged so a large library stays bounded. */
async function scanMediaRows(
  db: IDBAdapter,
  tenantId?: DatabaseId | null,
): Promise<MediaLifecycleRow[]> {
  const rows: MediaLifecycleRow[] = [];
  const options = { tenantId: tenantId ?? undefined } as {
    tenantId?: DatabaseId;
    limit: number;
    offset: number;
  };

  for (let offset = 0; offset < SCAN_MAX_ROWS; offset += SCAN_PAGE_SIZE) {
    const res = await db.crud.findMany<MediaLifecycleRow>(
      "media",
      {} as QueryFilter<MediaLifecycleRow>,
      {
        ...options,
        limit: SCAN_PAGE_SIZE,
        offset,
        fields: ["_id", "filename", "hash", "mimeType", "metadata", "path", "size", "thumbnails"],
      },
    );
    if (!res.success || !res.data?.length) break;
    rows.push(...res.data);
    if (res.data.length < SCAN_PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Collect every content hash still reachable from a tenant's media records —
 * active originals plus retained version entries.
 *
 * Callers that release several hashes at once (asset deletion, cleanup) should
 * build this once instead of re-scanning the library per hash.
 */
export async function collectReferencedHashes(
  db: IDBAdapter,
  tenantId?: DatabaseId | null,
  excludeId?: DatabaseId,
): Promise<Set<string>> {
  const rows = await scanMediaRows(db, tenantId);
  const live = new Set<string>();
  for (const row of rows) {
    if (excludeId != null && String(row._id) === String(excludeId)) continue;
    if (row.hash) live.add(row.hash);
    for (const version of versionList(row.metadata)) {
      if (version.hash) live.add(version.hash);
    }
  }
  return live;
}

/**
 * True when a content hash is still reachable from any media record — as an
 * active original or from a retained version entry.
 *
 * `excludeId` lets a caller that is deleting one row ignore that row itself.
 */
export async function isHashReferenced(
  db: IDBAdapter,
  hash: string,
  tenantId?: DatabaseId | null,
  excludeId?: DatabaseId,
): Promise<boolean> {
  if (!hash) return false;
  return (await collectReferencedHashes(db, tenantId, excludeId)).has(hash);
}

/** Hashes still reachable from the supplied (post-prune) rows. */
function collectLiveHashes(rows: Array<{ hash?: string; versions: MediaLifecycleVersion[] }>) {
  const live = new Set<string>();
  for (const row of rows) {
    if (row.hash) live.add(row.hash);
    for (const version of row.versions) {
      if (version.hash) live.add(version.hash);
    }
  }
  return live;
}

// ─── Version pruning / blob cleanup ───────────────────────────────────────

export interface MediaCleanupOptions {
  tenantId?: DatabaseId | null;
  /** Newest entries retained per asset. 0 prunes every inactive version. */
  keepVersions?: number;
  /** Report what would happen without touching the DB or storage. */
  dryRun?: boolean;
  /** Scope the pass to one asset (admin "clean this asset" action). */
  mediaId?: string;
}

export interface MediaCleanupResult {
  dryRun: boolean;
  scanned: number;
  versionsPruned: number;
  /** Content hashes with no remaining reference whose blobs were released. */
  hashesReleased: string[];
  variantSetsDeleted: number;
  originalsDeleted: number;
  keepVersions: number;
}

function clampRetention(value: number | undefined): number {
  if (!Number.isFinite(value)) return MEDIA_VERSION_RETENTION_DEFAULT;
  return Math.min(Math.max(0, Math.floor(value as number)), 1_000);
}

/**
 * Prune old version entries and release blobs that no record references any
 * more. The active original and every retained version are always preserved.
 */
export async function cleanupMediaVersions(
  db: IDBAdapter,
  options: MediaCleanupOptions = {},
): Promise<MediaCleanupResult> {
  const tenantId = options.tenantId ?? null;
  const keepVersions = clampRetention(options.keepVersions);
  const dryRun = options.dryRun === true;

  const rows = options.mediaId
    ? await (async () => {
        const res = await db.crud.findOne<MediaLifecycleRow>(
          "media",
          { _id: options.mediaId as DatabaseId } as QueryFilter<MediaLifecycleRow>,
          { tenantId: tenantId ?? undefined },
        );
        return res.success && res.data ? [res.data] : [];
      })()
    : await scanMediaRows(db, tenantId);

  const planned: Array<{
    id: DatabaseId;
    row: MediaLifecycleRow;
    retained: MediaLifecycleVersion[];
    dropped: MediaLifecycleVersion[];
  }> = [];

  for (const row of rows) {
    const versions = versionList(row.metadata).sort((a, b) => a.version - b.version);
    if (versions.length <= keepVersions) continue;

    const retained = versions.slice(Math.max(0, versions.length - keepVersions));
    // Pruning an entry is independent of releasing its bytes: an entry that
    // shares a hash with a retained version is still redundant metadata, but the
    // hash stays live and its blobs must survive.
    const dropped = versions.slice(0, Math.max(0, versions.length - keepVersions));

    if (dropped.length === 0) continue;
    planned.push({ id: row._id, row, retained, dropped });
  }

  const liveHashes = collectLiveHashes(
    rows.map((row) => {
      const change = planned.find((entry) => String(entry.id) === String(row._id));
      return { hash: row.hash, versions: change ? change.retained : versionList(row.metadata) };
    }),
  );

  const releaseCandidates = new Map<string, { hash: string; filename?: string; path?: string }>();
  for (const entry of planned) {
    for (const version of entry.dropped) {
      if (!version.hash || liveHashes.has(version.hash)) continue;
      if (!releaseCandidates.has(version.hash)) {
        releaseCandidates.set(version.hash, {
          hash: version.hash,
          filename: version.filename,
          path: version.path,
        });
      }
    }
  }

  const result: MediaCleanupResult = {
    dryRun,
    scanned: rows.length,
    versionsPruned: planned.reduce((sum, entry) => sum + entry.dropped.length, 0),
    hashesReleased: [...releaseCandidates.keys()],
    variantSetsDeleted: 0,
    originalsDeleted: 0,
    keepVersions,
  };

  if (dryRun) return result;

  for (const entry of planned) {
    const metadata = {
      ...entry.row.metadata,
      versions: entry.retained,
    } as MediaLifecycleRow["metadata"];
    const update = await db.crud.update(
      "media",
      entry.id,
      { metadata } as unknown as EntityUpdate<MediaLifecycleRow>,
      { tenantId: tenantId ?? undefined },
    );
    if (!update.success) {
      logger.warn("[MediaLifecycle] Version prune update failed", {
        mediaId: String(entry.id),
        error: update.message,
      });
      continue;
    }
    // Release only blobs that were successfully pruned from every row.
    for (const version of entry.dropped) {
      if (version.hash && releaseCandidates.has(version.hash)) {
        await releaseHash(version.hash, tenantId, version, result);
        releaseCandidates.delete(version.hash);
      }
    }
  }

  // Candidates can survive when their owning update failed — release nothing
  // that a still-persisted version entry points at.
  for (const candidate of releaseCandidates.values()) {
    const stillReferenced = await isHashReferenced(db, candidate.hash, tenantId);
    if (stillReferenced) {
      result.hashesReleased = result.hashesReleased.filter((hash) => hash !== candidate.hash);
      continue;
    }
    await releaseHash(candidate.hash, tenantId, candidate, result);
  }

  return result;
}

async function releaseHash(
  hash: string,
  tenantId: DatabaseId | null,
  version: { filename?: string; path?: string },
  result: MediaCleanupResult,
): Promise<void> {
  try {
    await deleteAllVariants(hash, tenantId?.toString());
    result.variantSetsDeleted++;
  } catch (err: unknown) {
    logger.warn("[MediaLifecycle] Variant cleanup failed", {
      hash: hash.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const paths = new Set<string>();
  if (version.path) paths.add(version.path.replace(/^\/files\//, "").replace(/^\/+/, ""));
  if (version.filename) paths.add(buildOriginalRelPath(hash, version.filename, tenantId));

  for (const relPath of paths) {
    if (!relPath) continue;
    try {
      await getStorageAdapter().remove(relPath);
      result.originalsDeleted++;
    } catch {
      // Missing object / unsupported backend — `remove()` is best-effort.
    }
  }
}

// ─── Processing status reconciliation ─────────────────────────────────────

export interface MediaStatusSyncOptions {
  tenantId?: DatabaseId | null;
  mediaId?: string;
  /** Persist repaired statuses (default true). */
  persist?: boolean;
  /** Re-queue derivative generation for images stuck in processing/failed. */
  requeue?: boolean;
}

export interface MediaStatusSyncResult {
  scanned: number;
  ready: number;
  processing: number;
  failed: number;
  /** Rows whose persisted status changed. */
  updated: number;
  /** Rows whose derivatives were re-queued. */
  queued: number;
}

/** True for SVG-free raster images — the only media kind with derivative ladders. */
export function isRasterImage(mimeType: string | undefined, filename: string | undefined): boolean {
  if (!mimeType?.startsWith("image/")) return false;
  if (mimeType.includes("svg")) return false;
  return !filename?.toLowerCase().endsWith(".svg");
}

/** Derive a truthful status from the record's own derivative evidence. */
export function deriveMediaProcessingStatus(
  row: Pick<MediaLifecycleRow, "filename" | "metadata" | "mimeType" | "thumbnails">,
): MediaProcessingStatusValue {
  const declared = normalizeProcessingStatus(row.metadata?.processingStatus);
  if (!isRasterImage(row.mimeType, row.filename)) return "ready";

  const variants = Array.isArray(row.metadata?.imageVariants) ? row.metadata!.imageVariants! : [];
  const hasThumbnails = !!row.thumbnails && Object.values(row.thumbnails).some(Boolean);

  if (declared === "failed") return "failed";
  if (variants.length > 0 || hasThumbnails) return "ready";
  return declared === "processing" ? "processing" : "processing";
}

/**
 * Reconcile `metadata.processingStatus` with the derivates that actually exist.
 * Optionally re-queues missing variant generation for raster images.
 */
export async function syncMediaProcessingStatus(
  db: IDBAdapter,
  options: MediaStatusSyncOptions = {},
): Promise<MediaStatusSyncResult> {
  const tenantId = options.tenantId ?? null;
  const persist = options.persist !== false;
  const rows = options.mediaId
    ? await (async () => {
        const res = await db.crud.findOne<MediaLifecycleRow>(
          "media",
          { _id: options.mediaId as DatabaseId } as QueryFilter<MediaLifecycleRow>,
          { tenantId: tenantId ?? undefined },
        );
        return res.success && res.data ? [res.data] : [];
      })()
    : await scanMediaRows(db, tenantId);

  const result: MediaStatusSyncResult = {
    scanned: rows.length,
    ready: 0,
    processing: 0,
    failed: 0,
    updated: 0,
    queued: 0,
  };

  for (const row of rows) {
    const status = deriveMediaProcessingStatus(row);
    result[status]++;

    const previous = normalizeProcessingStatus(row.metadata?.processingStatus);
    const shouldRequeue =
      options.requeue === true &&
      status !== "ready" &&
      isRasterImage(row.mimeType, row.filename) &&
      !!row.hash &&
      !!row.path;

    if (persist && (status !== previous || shouldRequeue)) {
      // Patch the two keys this reconciler owns. Re-writing the whole blob from
      // `row` would delete anything a concurrent writer (share link, variant
      // job, editor) added after this row was read.
      const patch: Partial<CmsMediaMetadata> = {
        processingStatus: shouldRequeue ? "processing" : status,
      };
      if (status !== "failed") patch.processingError = null;
      const update = await db.media.files.updateMetadata(row._id, patch, {
        tenantId: tenantId ?? undefined,
      });
      if (update.success) {
        result.updated++;
      } else {
        logger.warn("[MediaLifecycle] Status update failed", {
          mediaId: String(row._id),
          error: update.message,
        });
      }
    }

    if (shouldRequeue && row.hash && row.path) {
      result.queued++;
      const recordId = row._id;
      scheduleVariantJob({
        hash: row.hash,
        relPath: row.path,
        tenantId,
        onVariants: async (variants) => {
          // Partial patch — see the note above: never replace the whole blob
          // from a snapshot taken before other writers ran.
          const patch: Partial<CmsMediaMetadata> = {
            processingStatus: variants.length > 0 ? "ready" : "failed",
            ...(variants.length > 0
              ? {
                  imageVariants: variants.map((variant) => ({
                    preset: variant.preset,
                    width: variant.width,
                    height: variant.height,
                    format: variant.format,
                    quality: variant.quality,
                    path: variant.path,
                    size: variant.size,
                  })),
                  processingError: null,
                }
              : { processingError: "No variants generated" }),
          };
          await db.media.files.updateMetadata(recordId, patch, {
            tenantId: tenantId ?? undefined,
          });
        },
      });
    }
  }

  return result;
}
