/**
 * @file src/utils/collections-migration.server.ts
 * @description Migrates collections and media between flat and tenant-namespaced structures.
 *
 * Also handles media file migration (mediaFolder/global/ → mediaFolder/{tenantId}/).
 *
 * Three scenarios:
 * 1. Fresh install → multi-tenant: setup writes directly to correct path
 * 2. Single-tenant → multi-tenant (toggle ON): migrates config + media
 * 3. Multi-tenant → single-tenant (toggle OFF): reverses migration
 */

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger";
import { getCollectionsPath } from "./tenant.server";

// ─── Collection Migration ────────────────────────────────────────────

/**
 * Migrate from flat (single-tenant) to tenant-namespaced directory structure.
 * Moves config/collections/*.ts → config/{tenantId}/collections/*.ts
 */
export async function migrateToMultiTenant(tenantId: string): Promise<{
  moved: number;
  skipped: number;
}> {
  const flatDir = getCollectionsPath(undefined);
  const tenantDir = getCollectionsPath(tenantId);
  const result = { moved: 0, skipped: 0 };

  try {
    await fs.mkdir(tenantDir, { recursive: true });
    const entries = await fs.readdir(flatDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const src = path.join(flatDir, entry.name);
      const dest = path.join(tenantDir, entry.name);

      try {
        await fs.access(dest);
        result.skipped++;
        continue;
      } catch {
        /* safe to move */
      }

      await fs.rename(src, dest);
      result.moved++;
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

/**
 * Migrate from tenant-namespaced back to flat (single-tenant) directory structure.
 */
export async function migrateToSingleTenant(tenantId: string): Promise<{
  moved: number;
  skipped: number;
}> {
  const flatDir = getCollectionsPath(undefined);
  const tenantDir = getCollectionsPath(tenantId);
  const result = { moved: 0, skipped: 0 };

  try {
    await fs.mkdir(flatDir, { recursive: true });
    const entries = await fs.readdir(tenantDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const src = path.join(tenantDir, entry.name);
      const dest = path.join(flatDir, entry.name);

      try {
        await fs.access(dest);
        result.skipped++;
        continue;
      } catch {
        /* safe to move */
      }

      await fs.rename(src, dest);
      result.moved++;
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

/**
 * Migrate media files from flat global/ to tenant-scoped directory.
 * Moves mediaFolder/global/{hash}/... → mediaFolder/{tenantId}/{hash}/...
 * and updates database records to reflect the new paths.
 */
export async function migrateMediaToTenant(
  tenantId: string,
  dbAdapter?: { crud?: { update?: any; findMany?: any } },
): Promise<{
  filesMoved: number;
  recordsUpdated: number;
}> {
  const result = { filesMoved: 0, recordsUpdated: 0 };
  const mediaFolder = path.resolve(process.cwd(), "mediaFolder");
  const globalDir = path.join(mediaFolder, "global");
  const tenantDir = path.join(mediaFolder, tenantId);

  try {
    // 1. Move files on disk
    await fs.mkdir(tenantDir, { recursive: true });
    const hashes = await fs.readdir(globalDir, { withFileTypes: true }).catch(() => []);

    for (const entry of hashes) {
      if (!entry.isDirectory()) continue;
      const src = path.join(globalDir, entry.name);
      const dest = path.join(tenantDir, entry.name);

      try {
        await fs.access(dest);
        continue; // already exists
      } catch {
        /* safe to move */
      }

      await fs.rename(src, dest);
      result.filesMoved++;
    }

    // 2. Update database records to point to new path prefix
    if (dbAdapter?.crud?.findMany && dbAdapter?.crud?.update) {
      const { data: mediaItems } = await dbAdapter.crud.findMany("media_items", {
        tenantId: tenantId,
      });

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

/**
 * Reverse media migration: mediaFolder/{tenantId}/ → mediaFolder/global/
 */
export async function migrateMediaToGlobal(
  tenantId: string,
  dbAdapter?: { crud?: { update?: any; findMany?: any } },
): Promise<{
  filesMoved: number;
  recordsUpdated: number;
}> {
  const result = { filesMoved: 0, recordsUpdated: 0 };
  const mediaFolder = path.resolve(process.cwd(), "mediaFolder");
  const tenantDir = path.join(mediaFolder, tenantId);
  const globalDir = path.join(mediaFolder, "global");

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

      await fs.rename(src, dest);
      result.filesMoved++;
    }

    if (dbAdapter?.crud?.findMany && dbAdapter?.crud?.update) {
      const { data: mediaItems } = await dbAdapter.crud.findMany("media_items", {
        tenantId: tenantId,
      });

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

/**
 * Full migration handler — runs collections + media + recompilation.
 * Designed to be called from the System Settings GUI.
 */
export async function runFullMigration(
  tenantId: string,
  direction: "to-multi" | "to-single",
  dbAdapter?: any,
): Promise<MigrationResult> {
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
      // Collections
      const colResult = await migrateToMultiTenant(tenantId);
      result.collectionsMoved = colResult.moved;
      result.collectionsSkipped = colResult.skipped;

      // Media
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

    // Recompile
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
      logger.warn(`[Migration] Completed with warnings: ${result.warnings.join(", ")}`);
    } else {
      logger.info("[Migration] Full migration completed successfully");
    }
  } catch (err: any) {
    result.success = false;
    result.warnings.push(`Migration failed: ${err.message}`);
    logger.error("[Migration] Full migration failed:", err);
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

/**
 * Full structure detection that also lists files in wrong locations.
 */
export async function detectFullStructure(): Promise<StructureInfo> {
  const { isMultiTenantEnabled } = await import("@utils/tenant");
  const isMultiTenant = isMultiTenantEnabled();

  const configDir = path.join(process.cwd(), "config");
  const flatDir = getCollectionsPath(undefined);

  const configEntries = await fs.readdir(configDir, { withFileTypes: true }).catch(() => []);
  const tenantDirectories = configEntries
    .filter((e) => e.isDirectory() && e.name !== "collections")
    .map((e) => e.name);

  const flatFiles = await fs.readdir(flatDir).catch(() => []);
  const flatCollections = flatFiles.filter((f) => f.endsWith(".ts"));

  const warnings: string[] = [];

  // Check collections in wrong directories
  if (isMultiTenant && flatCollections.length > 0) {
    warnings.push(
      `${flatCollections.length} collection(s) in flat config/collections/ should be moved to config/{tenant}/collections/`,
    );
  }
  if (!isMultiTenant && tenantDirectories.length > 0) {
    warnings.push(
      `${tenantDirectories.length} tenant directory(ies) found but multi-tenancy is disabled`,
    );
  }

  // Determine action
  let pendingAction: "to-multi" | "to-single" | null = null;
  if (isMultiTenant && flatCollections.length > 0) {
    pendingAction = "to-multi";
  } else if (!isMultiTenant && tenantDirectories.length > 0) {
    pendingAction = "to-single";
  }

  return {
    effectiveTenantId: isMultiTenant ? tenantDirectories[0] || "primary" : undefined,
    needsMigration: pendingAction !== null,
    pendingAction,
    flatCollections,
    tenantDirectories,
    warnings,
  };
}
