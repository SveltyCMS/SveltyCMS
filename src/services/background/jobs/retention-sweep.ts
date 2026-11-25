/**
 * @file src/services/background/jobs/retention-sweep.ts
 * @description Scheduled retention sweeper for expired soft-deleted entries and orphaned media blobs.
 *
 * Reclaims storage without blocking event-loop latency by deleting in bounded batches,
 * respecting multi-tenant isolation, and pruning unreferenced media versions.
 *
 * ### Features:
 * - Soft-delete retention purge (`SOFT_DELETE_RETENTION_DAYS`, default 30 days, `0` disables)
 * - Orphaned media & derivative version cleanup (`MEDIA_VERSION_RETENTION`, default 10, `0` disables)
 * - Bounded batched permanent deletes (`batchSize = 100`) with event-loop yields
 * - Multi-tenant scope iteration via `withSystemScope("scheduler")`
 * - Skipped automatically during benchmark runs (`BENCHMARK=true`)
 */

import { contentSystem } from "@src/content/index.server";
import type { DatabaseId } from "@src/content/types";
import { collectionTableName } from "@src/databases/core/collection-name";
import { getDb, isDbConnected } from "@src/databases/db";
import type { IDBAdapter, QueryFilter } from "@src/databases/db-interface";
import { withSystemScope } from "@src/databases/system-tenant-scope";
import { dateToISODateString } from "@utils/date";
import { logger } from "@utils/logger";
import {
  MEDIA_VERSION_RETENTION_DEFAULT,
  cleanupMediaVersions,
} from "@utils/media/media-lifecycle.server";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import type { JobHandler } from "./job-queue-service";

export const DEFAULT_SOFT_DELETE_RETENTION_DAYS = 30;
export const DEFAULT_SWEEP_BATCH_SIZE = 100;
const MAX_BATCHES_PER_TABLE = 50;

export interface RetentionSweepOptions {
  db?: IDBAdapter;
  softDeleteRetentionDays?: number;
  mediaVersionRetention?: number;
  batchSize?: number;
  maxBatchesPerTable?: number;
  dryRun?: boolean;
  nowMs?: number;
}

export interface RetentionSweepResult {
  skipped: boolean;
  reason?: string;
  tenantsProcessed: number;
  collectionsSwept: number;
  purgedEntries: number;
  purgedMediaItems: number;
  prunedMediaVersions: number;
  deletedMediaBlobs: number;
  errors: string[];
}

/** Parse a non-negative integer retention setting from environment, falling back to `fallback`. */
export function parseRetentionSetting(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

async function resolveTenantScopes(db: IDBAdapter): Promise<(DatabaseId | null)[]> {
  if (!isMultiTenantEnabled()) {
    return [null];
  }
  try {
    const res = await db.system?.tenants?.list({ limit: 1000 });
    if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
      const seen = new Set<string>();
      const scopes: DatabaseId[] = [];
      for (const tenant of res.data) {
        if (!tenant?._id) continue;
        const id = String(tenant._id);
        if (!seen.has(id)) {
          seen.add(id);
          scopes.push(tenant._id);
        }
      }
      if (scopes.length > 0) return scopes;
    }
  } catch (err) {
    logger.debug("[RetentionSweep] Tenant listing fallback to null scope", err);
  }
  return [null];
}

async function purgeExpiredRowsInTable(
  db: IDBAdapter,
  tableName: string,
  cutoffIso: string,
  tenantId: DatabaseId | null,
  batchSize: number,
  maxBatches: number,
  dryRun: boolean,
): Promise<number> {
  let totalPurged = 0;
  const queryOpts = {
    ...(tenantId ? { tenantId } : withSystemScope("scheduler")),
    includeDeleted: true,
    limit: batchSize,
    fields: ["_id"] as never[],
  };
  const deleteOpts = {
    ...(tenantId ? { tenantId } : withSystemScope("scheduler")),
    permanent: true,
  };
  const filter = {
    isDeleted: true,
    deletedAt: { $lte: cutoffIso },
  } as unknown as QueryFilter<Record<string, unknown>>;

  for (let batch = 0; batch < maxBatches; batch++) {
    const found = await db.crud.findMany(tableName, filter, queryOpts);
    if (!found.success || !Array.isArray(found.data) || found.data.length === 0) {
      break;
    }

    const ids: DatabaseId[] = [];
    for (const row of found.data) {
      if (row && typeof row === "object" && "_id" in row && row._id) {
        ids.push(row._id as DatabaseId);
      }
    }
    if (ids.length === 0) break;

    if (dryRun) {
      totalPurged += ids.length;
      break;
    }

    const del = await db.crud.deleteMany(
      tableName,
      { _id: { $in: ids } } as unknown as QueryFilter<Record<string, unknown>>,
      deleteOpts,
    );
    if (!del.success) {
      throw new Error(del.error?.message || `Failed permanent delete on ${tableName}`);
    }
    const deleted =
      typeof del.data?.deletedCount === "number" && del.data.deletedCount >= 0
        ? del.data.deletedCount
        : ids.length;
    totalPurged += deleted;

    if (ids.length < batchSize) break;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  return totalPurged;
}

/**
 * Execute one retention sweep pass across expired soft-deleted rows and orphaned media derivatives.
 */
export async function runRetentionSweep(
  options: RetentionSweepOptions = {},
): Promise<RetentionSweepResult> {
  const result: RetentionSweepResult = {
    skipped: false,
    tenantsProcessed: 0,
    collectionsSwept: 0,
    purgedEntries: 0,
    purgedMediaItems: 0,
    prunedMediaVersions: 0,
    deletedMediaBlobs: 0,
    errors: [],
  };

  if (process.env.BENCHMARK === "true") {
    result.skipped = true;
    result.reason = "benchmark";
    return result;
  }

  const db = options.db ?? getDb();
  if (!db || (!options.db && !isDbConnected())) {
    result.skipped = true;
    result.reason = "db-unavailable";
    return result;
  }

  const softDeleteDays =
    options.softDeleteRetentionDays ??
    parseRetentionSetting(
      process.env.SOFT_DELETE_RETENTION_DAYS,
      DEFAULT_SOFT_DELETE_RETENTION_DAYS,
    );
  const mediaVersionKeep =
    options.mediaVersionRetention ??
    parseRetentionSetting(process.env.MEDIA_VERSION_RETENTION, MEDIA_VERSION_RETENTION_DEFAULT);
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_SWEEP_BATCH_SIZE);
  const maxBatches = Math.max(1, options.maxBatchesPerTable ?? MAX_BATCHES_PER_TABLE);
  const dryRun = options.dryRun === true;
  const nowMs = options.nowMs ?? Date.now();

  if (softDeleteDays === 0 && mediaVersionKeep === 0) {
    result.skipped = true;
    result.reason = "disabled";
    return result;
  }

  const scopes = await resolveTenantScopes(db);
  const cutoffIso =
    softDeleteDays > 0 ? dateToISODateString(new Date(nowMs - softDeleteDays * 86_400_000)) : null;

  for (const tenantId of scopes) {
    result.tenantsProcessed++;

    if (cutoffIso) {
      let collectionTables: string[] = [];
      try {
        const schemas = await contentSystem.getCollections(tenantId ?? undefined);
        collectionTables = schemas
          .filter((s) => Boolean(s?._id))
          .map((s) => collectionTableName(String(s._id)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug(
          `[RetentionSweep] Failed loading collections for tenant=${tenantId ?? "global"}`,
          err,
        );
        result.errors.push(`collections(${tenantId ?? "global"}): ${msg}`);
      }

      for (const table of collectionTables) {
        try {
          result.collectionsSwept++;
          result.purgedEntries += await purgeExpiredRowsInTable(
            db,
            table,
            cutoffIso,
            tenantId,
            batchSize,
            maxBatches,
            dryRun,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.debug(`[RetentionSweep] Failed sweeping table ${table}`, err);
          result.errors.push(`${table}: ${msg}`);
        }
      }

      try {
        result.purgedMediaItems += await purgeExpiredRowsInTable(
          db,
          "media_items",
          cutoffIso,
          tenantId,
          batchSize,
          maxBatches,
          dryRun,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug("[RetentionSweep] Failed sweeping media_items", err);
        result.errors.push(`media_items: ${msg}`);
      }
    }

    if (mediaVersionKeep > 0) {
      try {
        const mediaStats = await cleanupMediaVersions(db, {
          ...(tenantId ? { tenantId } : {}),
          keepVersions: mediaVersionKeep,
          dryRun,
        });
        result.prunedMediaVersions += mediaStats.versionsPruned;
        result.deletedMediaBlobs += mediaStats.originalsDeleted + mediaStats.variantSetsDeleted;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.debug("[RetentionSweep] Media version cleanup failed", err);
        result.errors.push(`media-versions(${tenantId ?? "global"}): ${msg}`);
      }
    }
  }

  return result;
}

/** Background job queue handler for scheduled `retention-sweep` runs. */
export const retentionSweepHandler: JobHandler = async (payload, _job) => {
  const dryRun = Boolean(
    payload && typeof payload === "object" && (payload as { dryRun?: boolean }).dryRun,
  );
  const summary = await runRetentionSweep({ dryRun });
  if (
    summary.purgedEntries > 0 ||
    summary.purgedMediaItems > 0 ||
    summary.prunedMediaVersions > 0 ||
    summary.deletedMediaBlobs > 0
  ) {
    logger.info(
      `[RetentionSweep] Purged ${summary.purgedEntries} entries, ${summary.purgedMediaItems} media rows, ${summary.prunedMediaVersions} media versions, ${summary.deletedMediaBlobs} orphan blobs`,
    );
  }
  if (summary.errors.length > 0) {
    logger.warn(
      `[RetentionSweep] Completed with ${summary.errors.length} partial errors`,
      summary.errors,
    );
  }
};
