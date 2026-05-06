/**
 * @file src/services/content/history-service.ts
 * @description
 * Unified History Service handling revisions and version state management.
 */

import { contentSystem } from "@src/content/index.server";
import { dbAdapter as dbAdapterInstance } from "@src/databases/db";
import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { pubSub } from "../background/pub-sub";
import { logger } from "@utils/logger";

export class HistoryService {
  // === Version State Management ===

  /**
   * Gets the current version for a tenant.
   */
  static async getVersion(tenantId?: string | null): Promise<number> {
    if (!dbAdapterInstance) return 0;
    const result = await dbAdapterInstance.monitoring.cache.getVersion(tenantId as any);
    return result.success ? result.data : 0;
  }

  /**
   * Atomically increments the version and broadcasts the change.
   */
  static async bumpVersion(tenantId?: string | null): Promise<number> {
    if (!dbAdapterInstance) return 0;
    const result = await dbAdapterInstance.monitoring.cache.incrementVersion(tenantId as any);

    if (result.success) {
      const newVersion = result.data;
      pubSub.publish("contentStructureUpdated", {
        version: newVersion,
        timestamp: new Date().toISOString(),
        affectedCollections: ["*"], // System-wide for now
        changeType: "update",
      });
      logger.debug(
        `[HistoryService] Bumped version to ${newVersion} for tenant: ${tenantId || "global"}`,
      );
      return newVersion;
    }
    logger.error(
      `[HistoryService] Failed to bump version for tenant: ${tenantId}`,
      result.success === false ? result.error : "Unknown error",
    );
    return 0;
  }

  // === Revision Management ===

  /**
   * Shared logic for retrieving revisions
   */
  static async getRevisions({
    collectionId,
    entryId,
    tenantId,
    dbAdapter,
    page = 1,
    limit = 10,
  }: {
    collectionId: string;
    entryId: string;
    tenantId: string;
    dbAdapter: IDBAdapter;
    page?: number;
    limit?: number;
  }) {
    const schema = await contentSystem.getCollectionById(collectionId, tenantId);
    if (!schema) {
      return { success: false, error: { message: "Collection not found" } };
    }

    // --- MULTI-TENANCY SECURITY CHECK ---
    if (getPrivateSettingSync("MULTI_TENANT")) {
      const collectionName = `collection_${schema._id}`;
      const entryResult = await dbAdapter.crud.findMany(collectionName, {
        _id: entryId,
        tenantId,
      } as Record<string, unknown>);
      if (!(entryResult.success && entryResult.data) || entryResult.data.length === 0) {
        return { success: false, error: { message: "Entry not found" } };
      }
    }

    const revisionResult = await dbAdapter.content.revisions.getHistory(
      entryId as unknown as DatabaseId,
      {
        page,
        pageSize: limit,
      },
    );

    return revisionResult;
  }
}
