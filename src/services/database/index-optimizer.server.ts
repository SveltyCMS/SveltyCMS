/**
 * @file src/services/database/index-optimizer.server.ts
 * @description
 * Background service for automatic database index optimization.
 * Scans all collections and ensures optimal indexing based on field configurations.
 *
 * Features:
 * - Automatic detection of unindexed fields (unique, searchable, indexed).
 * - Background index building to avoid blocking API requests.
 * - Database-agnostic execution via IDBAdapter.
 */

import { logger } from "@utils/logger";
import type { IDBAdapter } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";

export class IndexOptimizer {
  constructor(private readonly dbAdapter: IDBAdapter) {}

  /**
   * Run a full optimization pass across all collections.
   */
  async optimizeAll(): Promise<void> {
    const start = performance.now();
    try {
      if (!this.dbAdapter.collection.createIndexes) {
        logger.debug(
          `[IndexOptimizer] Skipping: ${this.dbAdapter.constructor.name} does not support dynamic indexing`,
        );
        return;
      }

      // Get all current schemas (uses L2 cache if available)
      // Dynamic import to avoid static server-module leak into client bundle
      const { scanCompiledCollections } = await import("@src/content/content-service.server");
      const schemas = await scanCompiledCollections();
      logger.info(
        `[IndexOptimizer] Starting optimization pass for ${schemas.length} collections...`,
      );

      // Control Database Concurrency (Chunking)
      const CHUNK_SIZE = 5;
      let successCount = 0;

      for (let i = 0; i < schemas.length; i += CHUNK_SIZE) {
        const chunk = schemas.slice(i, i + CHUNK_SIZE);
        const results = await Promise.allSettled(
          chunk.map(async (schema: Schema) => {
            if (!schema._id) throw new Error("Missing schema ID");

            // 🛡️ Safety check: Ensure DB is still connected before each operation
            if (this.dbAdapter.isConnected && !this.dbAdapter.isConnected()) {
              throw new Error(`Database connection closed during optimization of ${schema.name}`);
            }

            const res = await this.dbAdapter.collection.createIndexes!(schema._id, schema);
            if (!res.success) {
              throw new Error(`Failed to optimize ${schema.name}: ${res.message}`);
            }
          }),
        );

        successCount += results.filter((r) => r.status === "fulfilled").length;

        // Log failures in this chunk
        results.forEach((r) => {
          if (r.status === "rejected") {
            logger.warn(`[IndexOptimizer] ${r.reason}`);
          }
        });
      }

      const duration = performance.now() - start;
      logger.info(
        `[IndexOptimizer] Pass completed: ${successCount}/${schemas.length} collections optimized in ${duration.toFixed(2)}ms`,
      );
    } catch (error) {
      logger.error("[IndexOptimizer] Critical failure:", error);
    }
  }
}

// Factory for easier access
export let indexOptimizer: IndexOptimizer | null = null;

export function initializeIndexOptimizer(adapter: IDBAdapter) {
  indexOptimizer = new IndexOptimizer(adapter);
}
