/**
 * @file src/services/config-service.ts
 * @description Service layer for handling all configuration synchronization logic.
 * Scans files, queries DB, compares states, validates dependencies, and handles import/export.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { dbAdapter } from "@src/databases/db";
import { createChecksum } from "@utils/security";
import { logger } from "@utils/logger";

interface ConfigEntity {
  entity: Record<string, unknown>;
  hash: string;
  name: string;
  type: string;
  uuid: string;
}

export interface ConfigSyncStatus {
  changes: {
    new: ConfigEntity[];
    updated: ConfigEntity[];
    deleted: ConfigEntity[];
  };
  status: "in_sync" | "changes_detected";
  unmetRequirements: Array<{ key: string; value?: unknown }>;
}

/**
 * Configuration Synchronization Service
 */
export class ConfigService {
  constructor() {}

  /** Returns current sync status between filesystem and database. */
  public async getStatus(tenantId?: string): Promise<ConfigSyncStatus> {
    logger.debug(`Fetching configuration sync status for tenant: ${tenantId || "global"}...`);
    const [source, active] = await Promise.all([
      this.getSourceState(tenantId),
      this.getActiveState(tenantId),
    ]);

    const changes = this.compareStates(source, active);
    const unmetRequirements = await this.checkForUnmetRequirements(source, tenantId);

    return {
      status:
        changes.new.length > 0 || changes.updated.length > 0 || changes.deleted.length > 0
          ? "changes_detected"
          : "in_sync",
      changes,
      unmetRequirements,
    };
  }

  /**
   * Exports all configuration entities from DB to a timestamped folder.
   */
  public async performExport({
    uuids,
    tenantId,
  }: {
    uuids?: string[];
    tenantId?: string;
  } = {}): Promise<{ dirPath: string }> {
    logger.info(`Exporting configuration for tenant: ${tenantId || "global"}...`);
    const exportDir = path.resolve(
      process.cwd(),
      "config/backup",
      `export_${tenantId || "global"}_${Date.now()}`,
    );
    await fs.mkdir(exportDir, { recursive: true });

    // Fetch active state for this specific tenant
    const activeState = await this.getActiveState(tenantId);
    const entities = {
      collections: Array.from(activeState.values()).filter((e) => e.type === "collection"),
    };

    // Write each entity type
    await Promise.all(
      Object.entries(entities).map(async ([key, list]) => {
        const filtered = uuids?.length
          ? (list as Array<{ uuid: string }>).filter((i) => uuids.includes(i.uuid))
          : (list as unknown[]);
        const filePath = path.join(exportDir, `${key}.json`);
        await fs.writeFile(filePath, JSON.stringify(filtered, null, 2));
      }),
    );

    logger.info(`Configuration exported to ${exportDir}`);
    return { dirPath: exportDir };
  }

  /** Imports configuration entities from filesystem into the database. */
  public async performImport(
    options: {
      tenantId?: string;
      changes?: {
        new: ConfigEntity[];
        updated: ConfigEntity[];
        deleted: ConfigEntity[];
      };
    } = {},
  ) {
    const { tenantId } = options;
    logger.info(`Performing configuration import for tenant: ${tenantId || "global"}...`);
    let changes = options.changes;

    if (!changes) {
      const status = await this.getStatus(tenantId);
      changes = status.changes;
    }

    if (!dbAdapter) {
      throw new Error("Database adapter not available.");
    }

    // 1. Handle New & Updated Entities
    const toUpsert = [...changes.new, ...changes.updated];
    for (const item of toUpsert) {
      if (item.type === "collection") {
        try {
          // ✨ ISOLATION: Explicitly pass tenantId to upsert
          await dbAdapter.crud.upsert(
            "collections",
            { name: item.name, ...(tenantId && { tenantId }) } as Record<string, unknown>,
            { ...item.entity, ...(tenantId && { tenantId }) } as any,
            tenantId as any,
          );
          logger.info(`Imported collection: ${item.name} for tenant ${tenantId || "global"}`);
        } catch (err) {
          logger.error(`Failed to import collection ${item.name}:`, err);
        }
      }
    }

    // 2. Handle Deleted Entities
    for (const item of changes.deleted) {
      if (item.type === "collection") {
        try {
          // ✨ ISOLATION: Explicitly pass tenantId to delete
          await dbAdapter.crud.delete(
            "collections",
            item.uuid as import("@src/databases/db-interface").DatabaseId,
            tenantId as any,
          );
          logger.info(`Deleted collection: ${item.name} for tenant ${tenantId || "global"}`);
        } catch (err) {
          logger.error(`Failed to delete collection ${item.name}:`, err);
        }
      }
    }

    logger.info("Configuration import completed.");
  }

  private async getSourceState(tenantId?: string): Promise<Map<string, ConfigEntity>> {
    const state = new Map<string, ConfigEntity>();
    const { contentSystem } = await import("@src/content/index.server");
    await contentSystem.initialize(tenantId);

    // 1. Scan Collections (scoped by tenantId)
    const collections = await contentSystem.getCollections(tenantId);
    for (const collection of collections) {
      if (!(collection._id && collection.name)) {
        continue;
      }
      const hash = await createChecksum(collection);
      state.set(collection._id, {
        uuid: collection._id,
        type: "collection",
        name: collection.name,
        hash,
        entity: collection as unknown as Record<string, unknown>,
      });
    }

    return state;
  }

  private async getActiveState(tenantId?: string): Promise<Map<string, ConfigEntity>> {
    if (!dbAdapter) {
      throw new Error("Database adapter not available.");
    }
    const state = new Map<string, ConfigEntity>();

    try {
      // ✨ ISOLATION: Explicitly pass tenantId to findMany options
      const collectionsResult = await dbAdapter.crud.findMany(
        "collections",
        {},
        {
          tenantId: (tenantId as any) || undefined,
        },
      );

      if (collectionsResult.success && Array.isArray(collectionsResult.data)) {
        for (const collection of collectionsResult.data as unknown as Record<string, unknown>[]) {
          const id = String(collection._id || "");
          const name = String(collection.name || "");
          if (!(id && name)) {
            continue;
          }
          const hash = await createChecksum(collection);
          state.set(id, {
            uuid: id,
            type: "collection",
            name,
            hash,
            entity: collection,
          });
        }
      }
    } catch (err) {
      logger.error(`Failed to fetch active state from DB for tenant ${tenantId}:`, err);
    }

    return state;
  }

  /** Compares filesystem and DB states → returns new, updated, deleted. */
  private compareStates(source: Map<string, ConfigEntity>, active: Map<string, ConfigEntity>) {
    const result = { new: [], updated: [], deleted: [] } as {
      new: ConfigEntity[];
      updated: ConfigEntity[];
      deleted: ConfigEntity[];
    };

    for (const [uuid, s] of source.entries()) {
      const a = active.get(uuid);
      if (!a) {
        result.new.push(s);
      } else if (s.hash !== a.hash) {
        result.updated.push(s);
      }
    }
    for (const [uuid, a] of active.entries()) {
      if (!source.has(uuid)) {
        result.deleted.push(a);
      }
    }
    return result;
  }

  /** Checks for missing system settings required by config entities. */
  private async checkForUnmetRequirements(
    source: Map<string, ConfigEntity>,
    tenantId?: string,
  ): Promise<Array<{ key: string; value?: unknown }>> {
    if (!dbAdapter?.system.preferences) {
      throw new Error("System preferences adapter unavailable.");
    }

    const unmet: Array<{ key: string; value?: unknown }> = [];
    for (const { entity } of source.values()) {
      if (!Array.isArray(entity._requiredSettings)) {
        continue;
      }

      for (const req of entity._requiredSettings) {
        // ✨ ISOLATION: Pass tenantId as userId
        const result = await dbAdapter.system.preferences.get(req.key, "system", tenantId as any);
        if (!(result.success && result.data)) {
          unmet.push(req);
        }
      }
    }

    // Deduplicate by key
    return [...new Map(unmet.map((i) => [i.key, i])).values()];
  }
}

export const configService = new ConfigService();
