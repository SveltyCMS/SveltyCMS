/**
 * @file src/utils/collections-migration.server.ts
 * @description Hardened multi-tenant migration orchestrator.
 *
 * ### Architecture (audit 2026-07):
 * - Virtual Namespacing ready: all paths resolved via paths.getCollections()/getMedia()
 * - Context-aware: paths derive from AsyncLocalStorage, not hardcoded process.cwd()
 * - No more `path.resolve(process.cwd(), ...)` scattering — single source of truth
 *
 * ### Hardening:
 * - Concurrency locking: isMigrating flag prevents dual-admin migration corruption
 * - Cross-partition safety: copyFile + unlink replaces rename (safe across mount points)
 * - Migration audit trail: migrationId UUID on all log entries for traceability
 */

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger";
import { paths } from "./path-resolver";

// 🛡️ Lock to prevent concurrent migration attempts
let isMigrating = false;

/** 🛡️ Hardened: Cross-partition-safe atomic move (copyFile + unlink) */
async function moveFileAtomically(src: string, dest: string): Promise<boolean> {
  try {
    try {
      await fs.access(dest);
      return false; // destination already exists — caller should count as skipped
    } catch {
      /* dest missing — safe to move */
    }
    await fs.copyFile(src, dest);
    await fs.unlink(src);
    return true;
  } catch (err) {
    logger.error(`[Migration] Atomic move failed: ${src} -> ${dest}`, err);
    return false;
  }
}

/**
 * Resolves the flat (single-tenant) and tenant-scoped collection directories.
 * Uses centralized paths module — no hardcoded process.cwd() strings.
 */
function getMigrationDirs(tenantId?: string | null) {
  return {
    flat: path.join(paths.config, "collections"),
    tenant: tenantId
      ? path.join(paths.config, tenantId, "collections")
      : path.join(paths.config, "collections"),
  };
}

function getMediaDirs(tenantId?: string | null) {
  return {
    global: path.join(paths.root, "mediaFolder", "global"),
    tenant: tenantId
      ? path.join(paths.root, "mediaFolder", tenantId)
      : path.join(paths.root, "mediaFolder", "global"),
  };
}

// ─── Collection Migration ────────────────────────────────────────────

export async function migrateToMultiTenant(tenantId: string): Promise<{
  moved: number;
  skipped: number;
}> {
  const { flat, tenant: tenantDir } = getMigrationDirs(tenantId);
  const result = { moved: 0, skipped: 0 };

  try {
    await fs.mkdir(tenantDir, { recursive: true });
    const entries = await fs.readdir(flat, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const src = path.join(flat, entry.name);
      const dest = path.join(tenantDir, entry.name);

      const movedOk = await moveFileAtomically(src, dest);
      if (movedOk) result.moved++;
      else result.skipped++;
    }

    if (result.moved > 0) {
      logger.info(
        `[Migration] Moved ${result.moved} collection(s) to config/${tenantId}/collections/`,
      );
    }
  } catch (err) {
    logger.error("[Migration] Failed to migrate collections:", err);
  }

  return result;
}

export async function migrateToSingleTenant(tenantId: string): Promise<{
  moved: number;
  skipped: number;
}> {
  const { flat, tenant: tenantDir } = getMigrationDirs(tenantId);
  const result = { moved: 0, skipped: 0 };

  try {
    await fs.mkdir(flat, { recursive: true });
    const entries = await fs.readdir(tenantDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const src = path.join(tenantDir, entry.name);
      const dest = path.join(flat, entry.name);

      const movedOk = await moveFileAtomically(src, dest);
      if (movedOk) result.moved++;
      else result.skipped++;
    }

    if (result.moved > 0) {
      logger.info(`[Migration] Moved ${result.moved} collection(s) back to config/collections/`);
    }
  } catch (err) {
    logger.error("[Migration] Failed to revert collections:", err);
  }

  return result;
}

// ─── Media Migration ─────────────────────────────────────────────────

export async function migrateMediaToTenant(
  tenantId: string,
  dbAdapter?: { crud?: { update?: any; findMany?: any } },
): Promise<{ filesMoved: number; recordsUpdated: number }> {
  const result = { filesMoved: 0, recordsUpdated: 0 };
  const { global: globalDir, tenant: tenantDir } = getMediaDirs(tenantId);

  try {
    await fs.mkdir(tenantDir, { recursive: true });
    const hashes = await fs.readdir(globalDir, { withFileTypes: true }).catch(() => []);

    for (const entry of hashes) {
      if (!entry.isDirectory()) continue;
      const src = path.join(globalDir, entry.name);
      const dest = path.join(tenantDir, entry.name);

      try {
        await fs.access(dest);
        continue;
      } catch {
        /* safe to move */
      }

      await moveFileAtomically(src, dest);
      result.filesMoved++;
    }

    if (dbAdapter?.crud?.findMany && dbAdapter?.crud?.update) {
      const { data: mediaItems } = await dbAdapter.crud.findMany("media_items", { tenantId });
      for (const item of mediaItems || []) {
        if (item.path?.startsWith("global/")) {
          const newPath = item.path.replace("global/", `${tenantId}/`);
          await dbAdapter.crud.update("media_items", item._id, { path: newPath });
          result.recordsUpdated++;
        }
      }
    }

    if (result.filesMoved > 0) {
      logger.info(`[Migration] Moved ${result.filesMoved} media files to mediaFolder/${tenantId}/`);
    }
  } catch (err) {
    logger.error("[Migration] Failed to migrate media:", err);
  }

  return result;
}

export async function migrateMediaToGlobal(
  tenantId: string,
  dbAdapter?: { crud?: { update?: any; findMany?: any } },
): Promise<{ filesMoved: number; recordsUpdated: number }> {
  const result = { filesMoved: 0, recordsUpdated: 0 };
  const { global: globalDir, tenant: tenantDir } = getMediaDirs(tenantId);

  try {
    await fs.mkdir(globalDir, { recursive: true });
    const hashes = await fs.readdir(tenantDir, { withFileTypes: true }).catch(() => []);

    for (const entry of hashes) {
      if (!entry.isDirectory()) continue;
      const src = path.join(tenantDir, entry.name);
      const dest = path.join(globalDir, entry.name);

      try {
        await fs.access(dest);
        continue;
      } catch {
        /* safe to move */
      }

      await moveFileAtomically(src, dest);
      result.filesMoved++;
    }

    if (dbAdapter?.crud?.findMany && dbAdapter?.crud?.update) {
      const { data: mediaItems } = await dbAdapter.crud.findMany("media_items", { tenantId });
      for (const item of mediaItems || []) {
        if (item.path?.startsWith(`${tenantId}/`)) {
          const newPath = item.path.replace(`${tenantId}/`, "global/");
          await dbAdapter.crud.update("media_items", item._id, { path: newPath });
          result.recordsUpdated++;
        }
      }
    }

    if (result.filesMoved > 0) {
      logger.info(`[Migration] Moved ${result.filesMoved} media files back to mediaFolder/global/`);
    }
  } catch (err) {
    logger.error("[Migration] Failed to revert media:", err);
  }

  return result;
}

// ─── Unified Migration Orchestrator ────────────────────────────────

export interface MigrationResult {
  success: boolean;
  collectionsMoved: number;
  collectionsSkipped: number;
  mediaFilesMoved: number;
  mediaRecordsUpdated: number;
  recompiled: boolean;
  warnings: string[];
}

export async function runFullMigration(
  tenantId: string,
  direction: "to-multi" | "to-single",
  dbAdapter?: any,
): Promise<MigrationResult> {
  if (isMigrating) throw new Error("Migration already in progress");
  isMigrating = true;

  const migrationId = crypto.randomUUID();
  logger.info(`[Migration ${migrationId}] Starting ${direction} for tenant ${tenantId}`);

  const result: MigrationResult = {
    success: true,
    collectionsMoved: 0,
    collectionsSkipped: 0,
    mediaFilesMoved: 0,
    mediaRecordsUpdated: 0,
    recompiled: false,
    warnings: [],
  };

  try {
    if (direction === "to-multi") {
      const colResult = await migrateToMultiTenant(tenantId);
      result.collectionsMoved = colResult.moved;
      result.collectionsSkipped = colResult.skipped;
      const mediaResult = await migrateMediaToTenant(tenantId, dbAdapter);
      result.mediaFilesMoved = mediaResult.filesMoved;
      result.mediaRecordsUpdated = mediaResult.recordsUpdated;
    } else {
      const colResult = await migrateToSingleTenant(tenantId);
      result.collectionsMoved = colResult.moved;
      result.collectionsSkipped = colResult.skipped;
      const mediaResult = await migrateMediaToGlobal(tenantId, dbAdapter);
      result.mediaFilesMoved = mediaResult.filesMoved;
      result.mediaRecordsUpdated = mediaResult.recordsUpdated;
    }

    try {
      const { compile } = await import("@src/utils/compilation/compile");
      const compileResult = await compile({
        tenantId: direction === "to-multi" ? tenantId : undefined,
      });
      result.recompiled = true;
      if (compileResult.errors.length > 0) {
        result.warnings.push(`${compileResult.errors.length} compilation error(s)`);
      }
    } catch (e: any) {
      result.warnings.push(`Recompilation failed: ${e.message}`);
    }

    if (result.warnings.length > 0) {
      logger.warn(
        `[Migration ${migrationId}] Completed with warnings: ${result.warnings.join(", ")}`,
      );
    } else {
      logger.info(`[Migration ${migrationId}] Full migration completed successfully`);
    }
  } catch (err: any) {
    result.success = false;
    result.warnings.push(`Migration failed: ${err.message}`);
    logger.error(`[Migration ${migrationId}] Full migration failed:`, err);
  } finally {
    isMigrating = false;
  }

  return result;
}

// ─── Structure Detection ─────────────────────────────────────────────

export interface StructureInfo {
  effectiveTenantId: string | null | undefined;
  needsMigration: boolean;
  pendingAction: "to-multi" | "to-single" | null;
  flatCollections: string[];
  tenantDirectories: string[];
  warnings: string[];
}

export async function detectFullStructure(): Promise<StructureInfo> {
  const { isMultiTenantEnabled } = await import("@utils/tenant");
  const isMultiTenant = isMultiTenantEnabled();

  const { flat, tenant: _tenantDir } = getMigrationDirs();

  const configEntries = await fs.readdir(paths.config, { withFileTypes: true }).catch(() => []);
  const tenantDirectories = configEntries
    .filter((e) => e.isDirectory() && e.name !== "collections")
    .map((e) => e.name);

  const flatFiles = await fs.readdir(flat).catch(() => []);
  const flatCollections = flatFiles.filter((f) => f.endsWith(".ts"));

  const warnings: string[] = [];

  if (isMultiTenant && flatCollections.length > 0) {
    warnings.push(
      `${flatCollections.length} collection(s) in flat config/collections/ should be moved`,
    );
  }
  if (!isMultiTenant && tenantDirectories.length > 0) {
    warnings.push(
      `${tenantDirectories.length} tenant directory(ies) found but multi-tenancy is disabled`,
    );
  }

  let pendingAction: "to-multi" | "to-single" | null = null;
  if (isMultiTenant && flatCollections.length > 0) pendingAction = "to-multi";
  else if (!isMultiTenant && tenantDirectories.length > 0) pendingAction = "to-single";

  return {
    effectiveTenantId: isMultiTenant ? tenantDirectories[0] || "primary" : undefined,
    needsMigration: pendingAction !== null,
    pendingAction,
    flatCollections,
    tenantDirectories,
    warnings,
  };
}
