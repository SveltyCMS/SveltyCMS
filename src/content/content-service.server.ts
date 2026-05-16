/**
 * @file src/content/content-service.ts
 * @description High-performance content reconciliation and schema management.
 */

import { existsSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import path from "node:path";
import { logger } from "@utils/logger";
import { CacheCategory } from "@src/databases/cache/types";
import { dateToISODateString } from "@utils/date";
import { contentStore } from "@src/stores/content-store.svelte";
import type { ContentNode, Schema, DatabaseId } from "./types";
import type { IDBAdapter } from "@src/databases/db-interface";
import { generateCategoryNodesFromPaths } from "./content-utils";
import { eventBus, SystemEvents } from "@utils/event-bus";
import { cacheService } from "@src/databases/cache/cache-service";
import { generateSchemaHash, loadSchemaNative } from "./module-processor.server";

/**
 * 🛡️ SECURITY: Validates that a schema file is within the allowed .compiledCollections directory.
 */
function isSafeCollectionPath(fullPath: string): boolean {
  const resolved = path.resolve(fullPath);
  const allowedBase = path.resolve(process.cwd(), ".compiledCollections");
  return resolved.startsWith(allowedBase) && resolved.endsWith(".js");
}

/**
 * Enriches a schema with deterministic ID and SEO-optimized paths based on its filesystem location.
 */
function enrichSchemaWithMetadata(
  schema: Schema,
  fullPath: string,
  collectionsDir: string,
): Schema {
  const relativePath = path.relative(collectionsDir, fullPath);
  const relativeDir = path.dirname(relativePath);

  const autoId = relativePath
    .replace(/\.(js|ts)$/, "")
    .replace(/[\\/]/g, "_")
    .toLowerCase();
  schema._id ||= autoId;

  const pathSuffix = (schema.slug || schema.name || schema._id).toLowerCase();

  if (relativeDir !== ".") {
    const webRelativeDir = relativeDir.replace(/[\\/]/g, "/").toLowerCase();
    schema.path ||= `/collection/${webRelativeDir}/${pathSuffix}`;
  } else {
    schema.path ||= `/collection/${pathSuffix}`;
  }

  return schema;
}

/**
 * 🚀 Ensures all physical database models (tables/collections) exist.
 */
async function ensurePhysicalModels(schemas: Schema[], dbAdapter: IDBAdapter) {
  // Check if bulk exists
  const collAdapter = dbAdapter.collection as any;
  if (collAdapter.createModelsBulk) {
    await collAdapter.createModelsBulk(schemas);
  } else {
    for (const schema of schemas) {
      try {
        await dbAdapter.collection.createModel(schema);
      } catch (err) {
        logger.error(`[RECONCILE] Failed to create physical model for ${schema._id}: ${err}`);
      }
    }
  }
}

// Internal State
let _isScanning = false;
const _mtimeTree = new Map<string, number>();
const _schemaCache = new Map<string, Schema>();
let _isDirty = true;

/**
 * Flags the content system that a file has changed.
 */
export function markFileDirty(filePath?: string | null) {
  _isDirty = true;
  if (filePath) {
    _mtimeTree.delete(filePath);
    _schemaCache.delete(filePath);
  }
}

let _scanPromise: Promise<Schema[]> | null = null;

/**
 * Scans the .compiledCollections directory for compiled schema files.
 */
export async function scanCompiledCollections(): Promise<Schema[]> {
  if (_isScanning || _scanPromise) return _scanPromise || Array.from(_schemaCache.values());
  if (!_isDirty && _schemaCache.size > 0) return Array.from(_schemaCache.values());

  _scanPromise = (async () => {
    _isScanning = true;
    const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");
    if (!existsSync(collectionsDir)) {
      await fsPromises.mkdir(collectionsDir, { recursive: true });
    }
    const fileList: { fullPath: string; mtime: number }[] = [];

    async function walk(dir: string) {
      try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.info(`[Scanner] readdir ${dir} found ${entries.length} entries`);
        }
        await Promise.all(
          entries.map(async (entry) => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) return walk(fullPath);
            if (!entry.isFile() || !entry.name.endsWith(".js")) return;
            const stats = await fsPromises.stat(fullPath);
            fileList.push({ fullPath, mtime: stats.mtimeMs });
          }),
        );
      } catch (_err) {
        logger.error("[Scanner] Walk failed", { path: dir, error: _err });
      }
    }

    try {
      await walk(collectionsDir);
      const scanList = fileList.filter((f) => _mtimeTree.get(f.fullPath) !== f.mtime);

      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.info(`[Scanner] Total files found: ${fileList.length}`);
        logger.info(`[Scanner] Files needing scan: ${scanList.length}`);
      }

      if (scanList.length === 0 && _schemaCache.size === fileList.length) {
        _isDirty = false;
        return Array.from(_schemaCache.values());
      }

      const cacheKeys = scanList.map((f) => `schema:${f.fullPath}`);
      const cachedEntries = await cacheService.getMany<{
        mtime: number;
        hash: string;
        schema: Schema;
      }>(cacheKeys, null);

      await Promise.all(
        scanList.map(async (file, idx) => {
          const cached = cachedEntries[idx];
          const cacheKey = cacheKeys[idx];

          if (cached && cached.mtime === file.mtime) {
            _schemaCache.set(file.fullPath, cached.schema);
            _mtimeTree.set(file.fullPath, file.mtime);
            return;
          }

          if (!isSafeCollectionPath(file.fullPath)) {
            logger.error("[Scanner] Blocked unsafe schema path", { path: file.fullPath });
            return;
          }

          const moduleData = await loadSchemaNative(file.fullPath);
          const schema = moduleData?.schema;

          if (schema) {
            const hash = generateSchemaHash(schema);
            if (cached && cached.hash === hash) {
              await cacheService.set(
                cacheKey,
                { ...cached, mtime: file.mtime },
                3600,
                null,
                CacheCategory.SCHEMA,
              );
              _schemaCache.set(file.fullPath, cached.schema);
            } else {
              enrichSchemaWithMetadata(schema, file.fullPath, collectionsDir);
              await cacheService.set(
                cacheKey,
                { mtime: file.mtime, hash, schema },
                3600,
                null,
                CacheCategory.SCHEMA,
              );
              _schemaCache.set(file.fullPath, schema);
            }
            _mtimeTree.set(file.fullPath, file.mtime);
          }
        }),
      );

      const currentPaths = new Set(fileList.map((f) => f.fullPath));
      for (const path of _schemaCache.keys()) {
        if (!currentPaths.has(path)) {
          _schemaCache.delete(path);
          _mtimeTree.delete(path);
        }
      }
      _isDirty = false;
    } finally {
      _isScanning = false;
      _scanPromise = null;
    }
    return Array.from(_schemaCache.values());
  })();

  return _scanPromise;
}

/**
 * 🚀 Fast-path for benchmarks.
 */
export async function refreshCollectionsCache(tenantId?: string | null, db?: IDBAdapter) {
  markFileDirty();
  const fileSchemas = await scanCompiledCollections();
  let dbSchemas: Schema[] = [];

  if (db?.collection?.listSchemas) {
    try {
      const res = await db.collection.listSchemas();
      if (res.success && res.data) {
        dbSchemas = res.data;
      }
    } catch (err) {
      logger.error("[RECONCILE] Failed to list schemas from DB:", err);
    }
  }

  // Merge schemas (file-based takes precedence, but DB-only ones are kept)
  const schemaMap = new Map<string, Schema>();

  // 🚀 Standardize IDs to lowercase for case-insensitive system mapping
  for (const s of dbSchemas) {
    if (s._id) {
      const lowerId = s._id.toLowerCase();
      s._id = lowerId; // Standardize original object as well
      schemaMap.set(lowerId, s);
    }
  }

  for (const s of fileSchemas) {
    if (s._id) {
      const lowerId = s._id.toLowerCase();
      s._id = lowerId; // Standardize original object as well
      schemaMap.set(lowerId, s);
    }
  }

  const finalSchemas = Array.from(schemaMap.values());

  const nodes = finalSchemas.map((schema) => ({
    ...schema,
    nodeType: "collection",
    collectionDef: schema,
    tenantId: tenantId || "global",
  }));

  contentStore.sync(nodes as any);

  if (db) {
    if (typeof (db as any).reconcile === "function") await (db as any).reconcile();
    if ((db.collection as any)?.ensureSystemTables)
      await (db.collection as any).ensureSystemTables();
  }
}

export const contentService = {
  async fullReload(
    tenantId?: string | null,
    skipReconciliation = false,
    adapter?: IDBAdapter,
    changedFile?: string | null,
  ): Promise<void> {
    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info(
        `[RECONCILE] fullReload triggered. Tenant: ${tenantId}, target: ${changedFile || "ALL"}`,
      );
    }

    const dbAdapter = adapter || (await (await import("@src/databases/db")).getDb());
    if (!dbAdapter) return;

    await cacheService.invalidateByCategory(CacheCategory.SCHEMA, tenantId);

    if (changedFile && changedFile.endsWith(".js")) {
      await this.handleIncrementalReload(changedFile, tenantId, dbAdapter);
      return;
    }

    const schemas = await scanCompiledCollections();

    if (skipReconciliation) {
      await this.fastSyncStore(schemas, tenantId);
      return;
    }

    // 1. Fetch
    const [dbResult, categoryNodes] = await Promise.all([
      dbAdapter.content.nodes.getStructure("flat", {
        tenantId: tenantId as any,
        bypassTenantCheck: true,
      }),
      generateCategoryNodesFromPaths(schemas, tenantId),
    ]);
    const dbNodes = dbResult.success ? dbResult.data : [];

    // 2. Calculate
    const { operations, prunedPaths } = this.calculateReconciledOperations(
      schemas,
      dbNodes,
      categoryNodes,
      tenantId,
    );

    // 3. Persist
    await Promise.all([
      ensurePhysicalModels(schemas, dbAdapter),
      this.syncStoreAndDatabase(operations, prunedPaths, tenantId ?? null, dbAdapter),
    ]);

    // 4. Broadcast
    eventBus.broadcast(SystemEvents.CONTENT_UPDATE, {
      version: Date.now(),
      tenantId: tenantId || "all",
    });
  },

  async fastSyncStore(schemas: Schema[], tenantId?: string | null) {
    const nodes = schemas.map((s) => ({
      ...s,
      nodeType: "collection",
      collectionDef: s,
      path:
        s.path ||
        `/collection/${((s as any).slug || (s as any).name || (s as any)._id || "").toLowerCase()}`,
      tenantId: tenantId || "global",
    })) as any;
    contentStore.sync(nodes);
  },

  calculateReconciledOperations(
    schemas: Schema[],
    dbNodes: ContentNode[],
    categoryNodes: ContentNode[],
    tenantId?: string | null,
  ) {
    const operations: ContentNode[] = [];
    const processedPaths = new Set<string>();
    const dbMapByPath = new Map(dbNodes.map((n) => [n.path!, n]));
    const categoryIdMap = new Map(categoryNodes.map((c) => [c.path!, c._id]));

    operations.push(...categoryNodes);
    for (const cat of categoryNodes) processedPaths.add(cat.path!);

    const now = dateToISODateString(new Date());

    for (const schema of schemas) {
      let existing = dbMapByPath.get(schema.path!);
      if (!existing && schema.name) {
        const potentialDuplicates = Array.from(dbMapByPath.values()).filter(
          (n) => n.name === schema.name,
        );
        existing = potentialDuplicates[0];
        if (potentialDuplicates.length > 1) {
          for (let i = 1; i < potentialDuplicates.length; i++) {
            if (potentialDuplicates[i].path) dbMapByPath.delete(potentialDuplicates[i].path!);
          }
        }
      }

      const parentId =
        categoryIdMap.get(schema.path!.split("/").slice(0, -1).join("/")) || undefined;
      const hasChanged =
        !existing ||
        existing.source !== "filesystem" ||
        existing.name !== String(schema.name) ||
        existing.parentId !== parentId;

      const node: ContentNode = {
        ...existing,
        _id: (schema._id || existing?._id || schema.name || "unknown") as DatabaseId,
        path: schema.path,
        name: String(schema.name),
        icon: schema.icon || "bi:file",
        nodeType: "collection",
        collectionDef: schema,
        tenantId: tenantId as any,
        parentId: parentId,
        createdAt: existing?.createdAt || now,
        updatedAt: hasChanged ? now : existing?.updatedAt || now,
        order: existing?.order || 999,
        translations: schema.translations || [],
        source: "filesystem",
      };

      operations.push(node);
      processedPaths.add(node.path!);
      if (existing?.path) dbMapByPath.delete(existing.path);
    }

    const preservedNodes: ContentNode[] = [];
    const prunedPaths: string[] = [];
    for (const [path, dbNode] of dbMapByPath.entries()) {
      if (processedPaths.has(path)) continue;
      if (dbNode.source === "filesystem" || (!dbNode.source && dbNode.nodeType === "collection")) {
        if (process.env.BENCHMARK_DEBUG === "true") {
          console.log(
            `[Reconcile] Pruning node: ${path} (source: ${dbNode.source}, type: ${dbNode.nodeType})`,
          );
        }
        prunedPaths.push(path);
      } else {
        if (process.env.BENCHMARK_DEBUG === "true") {
          console.log(`[Reconcile] Preserving node: ${path} (source: ${dbNode.source})`);
        }
        preservedNodes.push(dbNode);
      }
    }

    operations.push(...preservedNodes);
    return { operations, prunedPaths };
  },

  async syncStoreAndDatabase(
    operations: ContentNode[],
    prunedPaths: string[],
    tenantId: string | null,
    dbAdapter: IDBAdapter,
  ) {
    contentStore.clear(tenantId as string);
    contentStore.sync(operations);

    if (operations.length > 0) {
      const validUpdates = operations
        .filter((op) => {
          if (!op.path && process.env.BENCHMARK_DEBUG === "true") {
            logger.warn(`[RECONCILE] Skipping DB update for node without path: ${op._id}`);
          }
          return !!op.path;
        })
        .map((op) => ({ path: op.path!, id: op._id, changes: op }));

      if (validUpdates.length > 0) {
        await dbAdapter.content.nodes.bulkUpdate(validUpdates, {
          tenantId: tenantId as any,
        });
      }
    }
    if (prunedPaths.length > 0) {
      await dbAdapter.content.nodes.deleteMany(prunedPaths, { tenantId: tenantId as any });
    }
  },

  async handleIncrementalReload(
    filePath: string,
    tenantId: string | null | undefined,
    dbAdapter: IDBAdapter,
  ): Promise<void> {
    const fullPath = path.resolve(filePath);
    const stats = await fsPromises.stat(fullPath).catch(() => null);
    if (!stats) return;

    const cacheKey = `schema:${fullPath}`;
    const cached = await cacheService.get<{ mtime: number; hash: string; schema: Schema }>(
      cacheKey,
      null,
      CacheCategory.SCHEMA,
    );

    const moduleData = await loadSchemaNative(fullPath);
    const schema = moduleData?.schema;
    if (!schema) return;

    const hash = generateSchemaHash(schema);
    if (cached && cached.hash === hash) {
      await cacheService.set(
        cacheKey,
        { ...cached, mtime: stats.mtimeMs },
        3600,
        null,
        CacheCategory.SCHEMA,
      );
      return;
    }

    const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");
    enrichSchemaWithMetadata(schema, fullPath, collectionsDir);

    await cacheService.set(
      cacheKey,
      { mtime: stats.mtimeMs, hash, schema },
      3600,
      null,
      CacheCategory.SCHEMA,
    );

    const now = dateToISODateString(new Date());
    const existingResult = await dbAdapter.content.nodes.getStructure("flat", {
      filter: { path: schema.path } as any,
      tenantId: tenantId as any,
    });
    const existing =
      existingResult.success && existingResult.data.length > 0 ? existingResult.data[0] : null;

    const node: ContentNode = {
      ...existing,
      _id: (schema._id || existing?._id || schema.name || "unknown") as DatabaseId,
      path: schema.path,
      name: String(schema.name),
      icon: schema.icon || "bi:file",
      nodeType: "collection",
      collectionDef: schema,
      tenantId: tenantId as any,
      order: existing?.order ?? 999,
      translations: schema.translations || [],
      source: "filesystem",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await dbAdapter.content.nodes.bulkUpdate([{ path: node.path!, id: node._id, changes: node }], {
      tenantId: tenantId as any,
    });
    contentStore.upsert(node);
    eventBus.broadcast(SystemEvents.CONTENT_UPDATE, {
      version: Date.now(),
      tenantId: tenantId || "all",
    });
  },

  async getContentStructureFromDatabase(
    format: "flat" | "tree" = "flat",
    tenantId?: string | null,
  ): Promise<any[]> {
    const db = await (await import("@src/databases/db")).getDb();
    if (!db) return [];
    const res = await db.content.nodes.getStructure(format as any, {
      tenantId: tenantId as any,
      bypassTenantCheck: true,
    });
    return res.success ? res.data : [];
  },

  async reorderNodes(items: any[], tenantId?: string | null): Promise<void> {
    const db = await (await import("@src/databases/db")).getDb();
    await db!.content.nodes.reorderStructure(items);
    if (tenantId) logger.debug("Reordering nodes for tenant", { tenantId });
  },

  async upsertContentNodes(operations: any[], tenantId?: string | null) {
    const { dbAdapter } = await import("@src/databases/db");
    if (!dbAdapter || operations.length === 0) return;

    const upsertOps = operations.filter(
      (op) => op.type === "create" || op.type === "update" || !op.type,
    );
    const deleteOps = operations.filter((op) => op.type === "delete");

    if (upsertOps.length > 0) {
      const updates = upsertOps
        .map((op) => {
          const id = (op.node as any).id || op.node._id?.toString();
          if (!op.node.path) return null;
          return { path: op.node.path, id, changes: op.node };
        })
        .filter((u): u is any => u !== null);
      if (updates.length > 0)
        await dbAdapter.content.nodes.bulkUpdate(updates, { tenantId: tenantId as any });
    }

    if (deleteOps.length > 0) {
      const pathsToDelete = deleteOps.map((op) => op.node.path).filter((p): p is string => !!p);
      if (pathsToDelete.length > 0)
        await dbAdapter.content.nodes.deleteMany(pathsToDelete, { tenantId: tenantId as any });
    }
    contentStore.updateVersion();
  },

  async find(collection: string, query: any, options?: any) {
    const { getDb } = await import("@src/databases/db");
    const db = options?.adapter || (await getDb());
    if (!db) throw new Error("Database not initialized");
    return db.crud.findMany(collection, query, options);
  },

  async findOne(collection: string, query: any, options?: any) {
    const { getDb } = await import("@src/databases/db");
    const db = options?.adapter || (await getDb());
    if (!db) throw new Error("Database not initialized");
    return db.crud.findOne(collection, query, options);
  },

  async insert(collection: string, data: any, options?: any) {
    const { getDb } = await import("@src/databases/db");
    const db = options?.adapter || (await getDb());
    if (!db) throw new Error("Database not initialized");
    return db.crud.insert(collection, data, options);
  },

  async update(collection: string, query: any, data: any, options?: any) {
    const { getDb } = await import("@src/databases/db");
    const db = options?.adapter || (await getDb());
    if (!db) throw new Error("Database not initialized");
    return (db.crud as any).update(collection, query, data, options);
  },

  async delete(collection: string, query: any, options?: any) {
    const { getDb } = await import("@src/databases/db");
    const db = options?.adapter || (await getDb());
    if (!db) throw new Error("Database not initialized");
    return (db.crud as any).delete(collection, query, options);
  },

  async search(query: string, options?: any) {
    logger.debug(`[RECONCILE] search: ${query}`, { options });
    return { success: true, items: [], total: 0 };
  },

  async scanCompiledCollections() {
    return scanCompiledCollections();
  },
};
