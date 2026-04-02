/**
 * @file src/services/content-version-manager.ts
 * @description
 * High-level service for managing content versions atomically.
 * Ensures that all clients (SSE/Polling) are notified of changes.
 */

import { dbAdapter } from "@src/databases/db";
import { pubSub } from "./pub-sub";
import { logger } from "@utils/logger.server";

export class ContentVersionManager {
  /**
   * Gets the current version for a tenant.
   */
  static async getVersion(tenantId?: string | null): Promise<number> {
    if (!dbAdapter) return 0;
    const result = await dbAdapter.monitoring.cache.getVersion(tenantId as any);
    return result.success ? result.data : 0;
  }

  /**
   * Atomically increments the version and broadcasts the change.
   */
  static async bumpVersion(tenantId?: string | null): Promise<number> {
    if (!dbAdapter) return 0;
    const result = await dbAdapter.monitoring.cache.incrementVersion(tenantId as any);

    if (result.success) {
      const newVersion = result.data;

      // Broadcast to internal EventBus
      pubSub.publish("contentStructureUpdated", {
        version: newVersion,
        timestamp: new Date().toISOString(),
        affectedCollections: ["*"], // System-wide for now
        changeType: "update",
      });

      logger.debug(
        `[VersionManager] Bumped version to ${newVersion} for tenant: ${tenantId || "global"}`,
      );
      return newVersion;
    }

    logger.error(
      `[VersionManager] Failed to bump version for tenant: ${tenantId}`,
      result.success === false ? result.error : "Unknown error",
    );
    return 0;
  }
}
