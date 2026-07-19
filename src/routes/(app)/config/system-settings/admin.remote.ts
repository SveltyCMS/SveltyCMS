/**
 * @file src/routes/(app)/config/system-settings/admin.remote.ts
 * @description Admin utility remote functions — cache repair, system operations.
 */

import { command, getRequestEvent } from "$app/server";

export const repairContentCache = command(
  "unchecked",
  async (_payload?: {}): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> => {
    const event = getRequestEvent();
    const { contentService } = await import("@src/content/engine.server");
    const { logger } = await import("@utils/logger");

    if (!event.locals.isAdmin) {
      return {
        success: false,
        error: "Only administrators can repair the content cache.",
      };
    }

    logger.info(`Repair Cache triggered by user: ${event.locals.user?._id}`);

    try {
      await contentService.fullReload();
      return {
        success: true,
        message: "Content structure cache rebuilt and synchronized successfully.",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Content Cache Repair failed: ${msg}`);
      return { success: false, error: `Repair failed: ${msg}` };
    }
  },
);

export const runTenantMigration = command(
  "unchecked",
  async (payload: {
    direction: "to-multi" | "to-single";
    tenantId?: string;
  }): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    details?: {
      collectionsMoved: number;
      collectionsSkipped: number;
      mediaFilesMoved: number;
      mediaRecordsUpdated: number;
      warnings: string[];
    };
  }> => {
    const event = getRequestEvent();
    if (!event.locals.isAdmin) {
      return { success: false, error: "Only administrators can run tenant migration." };
    }

    const { logger } = await import("@utils/logger");
    logger.info(`Tenant migration triggered by user: ${event.locals.user?._id}`);

    try {
      const { runFullMigration } = await import("@utils/collections-migration.server");
      const { updatePrivateConfigMode } = await import("@src/routes/setup/write-private-config");
      const tenantId = payload.tenantId || "primary";

      // Toggle the MULTI_TENANT flag in config/private.ts
      await updatePrivateConfigMode({
        multiTenant: payload.direction === "to-multi",
      });
      logger.info(
        `[Migration] Set MULTI_TENANT=${payload.direction === "to-multi"} in config/private.ts`,
      );

      const result = await runFullMigration(tenantId, payload.direction);

      if (!result.success) {
        return {
          success: false,
          error: result.warnings.join("; ") || "Migration failed",
        };
      }

      const parts: string[] = [];
      if (result.collectionsMoved > 0) parts.push(`${result.collectionsMoved} collection(s) moved`);
      if (result.mediaFilesMoved > 0) parts.push(`${result.mediaFilesMoved} media file(s) moved`);
      if (result.mediaRecordsUpdated > 0)
        parts.push(`${result.mediaRecordsUpdated} DB record(s) updated`);
      if (result.recompiled) parts.push("recompiled");

      const message =
        parts.length > 0
          ? `Migration complete: ${parts.join(", ")}. Restart the server for all changes to take effect.`
          : "Migration complete — nothing needed to move.";

      return {
        success: true,
        message,
        details: {
          collectionsMoved: result.collectionsMoved,
          collectionsSkipped: result.collectionsSkipped,
          mediaFilesMoved: result.mediaFilesMoved,
          mediaRecordsUpdated: result.mediaRecordsUpdated,
          warnings: result.warnings,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Tenant migration failed: ${msg}`);
      return { success: false, error: `Migration failed: ${msg}` };
    }
  },
);

export const detectTenantStructure = command(
  "unchecked",
  async (_payload?: {}): Promise<{
    success: boolean;
    isMultiTenant?: boolean;
    needsMigration?: boolean;
    pendingAction?: "to-multi" | "to-single" | null;
    flatCollections?: string[];
    tenantDirectories?: string[];
    warnings?: string[];
    error?: string;
  }> => {
    const event = getRequestEvent();
    if (!event.locals.isAdmin) {
      return {
        success: false,
        error: "Only administrators can inspect tenant structure.",
      };
    }

    try {
      const { detectFullStructure } = await import("@utils/collections-migration.server");
      const { isMultiTenantEnabled } = await import("@utils/tenant");
      const info = await detectFullStructure();
      const isMultiTenant = isMultiTenantEnabled();
      return {
        success: true,
        isMultiTenant,
        needsMigration: info.needsMigration,
        pendingAction: info.pendingAction,
        flatCollections: info.flatCollections,
        tenantDirectories: info.tenantDirectories,
        warnings: info.warnings,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  },
);
