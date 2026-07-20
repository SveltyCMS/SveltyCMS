/**
 * @file src/plugins/storage/plugin-storage-adapter.ts
 * @description Plugin Storage Adapter implementation.
 *
 * Uses the shared `plugin_storage` collection/table via the existing CRUD adapter,
 * providing tenant-isolated, schema-less JSON record storage for plugins.
 *
 * ### Features:
 * - Zero new tables per plugin — works across all 4 database adapters
 * - Tenant isolation via optional tenantId
 * - Generic typed CRUD (create, get, list, delete)
 * - Optional in-memory filter on `data` fields after fetch
 * - Full pagination support via `listRecords`
 */

import type { DatabaseId, IDBAdapter, QueryFilter } from "@src/databases/db-interface";
import type {
  CreateRecordOptions,
  ListRecordsOptions,
  PluginStorageAdapter,
  RecordOperationOptions,
  StorageRecord,
} from "./types";

/** Internal collection/table name used to persist plugin records. */
export const PLUGIN_STORAGE_COLLECTION = "plugin_storage";

/** Cast a plain string to the branded DatabaseId type. */
function toDbId(id?: string): DatabaseId | null | undefined {
  return id as DatabaseId | null | undefined;
}

/**
 * Normalize a DB row: SQLite stores `data` as TEXT JSON; PG/MariaDB may return objects.
 * Always expose `data` as a parsed object to callers.
 *
 * Handles double-encoding when both prepareValues (stringify) and Drizzle
 * `mode: "json"` encode the same field.
 */
export function normalizeStorageRecord<T = any>(row: any): StorageRecord<T> | null {
  if (!row || typeof row !== "object") return null;
  let data: unknown = row.data;
  // Up to two parse passes for double-encoded JSON strings
  for (let i = 0; i < 2 && typeof data === "string"; i++) {
    try {
      data = JSON.parse(data);
    } catch {
      data = {};
      break;
    }
  }
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    data = {};
  }
  return {
    ...row,
    _id: String(row._id ?? row.id ?? ""),
    plugin: String(row.plugin ?? ""),
    collection: String(row.collection ?? ""),
    data: data as T,
  } as StorageRecord<T>;
}

/**
 * Shallow match of filter keys against a record's `data` object
 * (and top-level fields). Supports equality only — keeps adapter portable.
 */
export function matchesPluginStorageFilter(
  record: StorageRecord<any>,
  filter?: Record<string, unknown>,
): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;
  const data = (record.data ?? {}) as Record<string, unknown>;
  for (const [key, expected] of Object.entries(filter)) {
    const actual =
      key in data
        ? data[key]
        : key in (record as object)
          ? (record as unknown as Record<string, unknown>)[key]
          : undefined;
    if (actual !== expected) return false;
  }
  return true;
}

/**
 * PluginStorageAdapterImpl — concrete adapter backed by `plugin_storage`.
 */
export class PluginStorageAdapterImpl implements PluginStorageAdapter {
  constructor(private readonly dbAdapter: IDBAdapter) {}

  async createRecord<T = any>(
    plugin: string,
    collection: string,
    data: T,
    options?: CreateRecordOptions,
  ): Promise<StorageRecord<T>> {
    if (!plugin?.trim() || !collection?.trim()) {
      throw new Error("[PluginStorage] plugin and collection are required");
    }

    const record = {
      plugin: plugin.trim(),
      collection: collection.trim(),
      tenantId: toDbId(options?.tenantId) ?? null,
      data: data as Record<string, unknown>,
    };

    // Prefer direct insert of a plain object; adapters JSON-encode TEXT columns.
    // Pass a clone so callers cannot mutate the stored payload via reference.
    const payloadClone =
      data != null && typeof data === "object"
        ? (JSON.parse(JSON.stringify(data)) as T)
        : (data as T);

    const result = await this.dbAdapter.crud.insert(
      PLUGIN_STORAGE_COLLECTION,
      { ...record, data: payloadClone as Record<string, unknown> },
      {
        tenantId: toDbId(options?.tenantId),
      },
    );

    if (!result.success) {
      throw new Error(`[PluginStorage] Failed to create record: ${result.message}`);
    }

    const normalized = normalizeStorageRecord<T>(result.data) ?? {
      _id: String((result.data as any)?._id ?? ""),
      plugin: plugin.trim(),
      collection: collection.trim(),
      tenantId: options?.tenantId,
      data: payloadClone,
      createdAt: "" as any,
      updatedAt: "" as any,
    };
    // Always prefer a non-empty payload for the caller
    if (
      !normalized.data ||
      typeof normalized.data !== "object" ||
      Object.keys(normalized.data as object).length === 0
    ) {
      normalized.data = payloadClone;
    }
    return normalized;
  }

  async getRecord<T = any>(
    plugin: string,
    collection: string,
    recordId: string,
    options?: RecordOperationOptions,
  ): Promise<StorageRecord<T> | null> {
    if (!recordId) return null;

    const query: QueryFilter<any> = {
      _id: recordId as DatabaseId,
      plugin,
      collection,
    };

    const result = await this.dbAdapter.crud.findOne(PLUGIN_STORAGE_COLLECTION, query, {
      tenantId: toDbId(options?.tenantId),
    });

    if (!result.success || !result.data) {
      return null;
    }

    return normalizeStorageRecord<T>(result.data);
  }

  async listRecords<T = any>(
    plugin: string,
    collection: string,
    options?: ListRecordsOptions,
  ): Promise<{ data: StorageRecord<T>[]; total: number }> {
    const query: QueryFilter<any> = {
      plugin,
      collection,
    };

    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const hasFilter = options?.filter && Object.keys(options.filter).length > 0;

    // When filtering in-memory on JSON `data`, fetch a larger window then slice.
    // For unfiltered lists, use DB pagination for correct totals.
    if (!hasFilter) {
      const countResult = await this.dbAdapter.crud.count(PLUGIN_STORAGE_COLLECTION, query, {
        tenantId: toDbId(options?.tenantId),
      });
      const total = countResult.success ? countResult.data : 0;

      const result = await this.dbAdapter.crud.findMany(PLUGIN_STORAGE_COLLECTION, query, {
        tenantId: toDbId(options?.tenantId),
        limit,
        offset,
        sort: { createdAt: "desc" },
      });

      const rows = (result.success ? result.data : []) as unknown[];
      return {
        data: rows
          .map((r) => normalizeStorageRecord<T>(r))
          .filter((r): r is StorageRecord<T> => r != null),
        total,
      };
    }

    // Filter path: load up to a safety cap, filter, then paginate in memory
    const fetchLimit = Math.min(1000, Math.max(limit + offset, 200));
    const result = await this.dbAdapter.crud.findMany(PLUGIN_STORAGE_COLLECTION, query, {
      tenantId: toDbId(options?.tenantId),
      limit: fetchLimit,
      offset: 0,
      sort: { createdAt: "desc" },
    });

    const all = ((result.success ? result.data : []) as unknown[])
      .map((r) => normalizeStorageRecord<T>(r))
      .filter((r): r is StorageRecord<T> => r != null);
    const filtered = all.filter((r) => matchesPluginStorageFilter(r, options?.filter));
    return {
      data: filtered.slice(offset, offset + limit),
      total: filtered.length,
    };
  }

  async deleteRecord(
    plugin: string,
    collection: string,
    recordId: string,
    options?: RecordOperationOptions,
  ): Promise<boolean> {
    const existing = await this.getRecord(plugin, collection, recordId, options);
    if (!existing) return false;

    const result = await this.dbAdapter.crud.delete(
      PLUGIN_STORAGE_COLLECTION,
      recordId as DatabaseId,
      {
        tenantId: toDbId(options?.tenantId),
        permanent: true,
      },
    );

    return result.success;
  }
}
