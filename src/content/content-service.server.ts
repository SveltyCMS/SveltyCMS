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
import { cacheService } from "@src/databases/cache/cache-service";
import { generateSchemaHash, loadSchema } from "./module-processor.server";
import { isSafeCollectionPath } from "./collection-path-security.server";
import {
  invalidateSchemaCache,
  notifyContentUpdate,
  setSchemaCacheEntry,
} from "./content-cache.server";

// ─── Plugin System ───────────────────────────────────────────────────────────

interface ContentPlugin {
  name: string;
  onSchemaLoad?: (schema: Schema, filePath: string) => Schema | Promise<Schema>;
  onReconcile?: (operations: any[], prunedPaths: string[]) => void | Promise<void>;
  onNodeChange?: (node: ContentNode, action: "upsert" | "delete") => void | Promise<void>;
}

const _plugins: ContentPlugin[] = [];

export function registerContentPlugin(plugin: ContentPlugin): void {
  if (_plugins.find((p) => p.name === plugin.name)) {
    logger.warn(`[ContentPlugin] Duplicate plugin name: ${plugin.name}`);
    return;
  }
  _plugins.push(plugin);
  logger.info(`[ContentPlugin] Registered: ${plugin.name}`);
}

// ─── Lightweight Tracing ─────────────────────────────────────────────────────

const _traces = new Map<string, number[]>();

export function traceStart(label: string): () => number {
  const start = performance.now();
  return () => {
    const elapsed = performance.now() - start;
    const entries = _traces.get(label) || [];
    entries.push(elapsed);
    _traces.set(label, entries.slice(-100)); // Keep last 100 samples
    return elapsed;
  };
}

export function getTraceStats(): Record<string, { avg: number; p95: number; count: number }> {
  const result: Record<string, any> = {};
  for (const [label, entries] of _traces) {
    if (entries.length === 0) continue;
    const sorted = [...entries].sort((a, b) => a - b);
    const avg = entries.reduce((a, b) => a + b, 0) / entries.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || avg;
    result[label] = {
      avg: +avg.toFixed(3),
      p95: +p95.toFixed(3),
      count: entries.length,
    };
  }
  return result;
}

/**
 * Validates a collection schema for required fields and uniqueness constraints.
 * Logs warnings for recoverable issues; returns false for hard validation failures.
 */
function validateSchemaFields(schema: Schema): boolean {
  if (!schema.name || typeof schema.name !== "string") {
    logger.error("Schema validation failed: missing or invalid 'name'");
    return false;
  }
  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    logger.error(`Schema validation failed: 'fields' must be a non-empty array (${schema.name})`);
    return false;
  }

  // Check for duplicate db_fieldName values (silent data corruption risk)
  const fieldNames = new Set<string>();
  for (const field of schema.fields) {
    const name = (field as any).db_fieldName || (field as any).name;
    if (!name) continue;
    if (fieldNames.has(name)) {
      logger.error(
        `Schema validation failed: duplicate field "${name}" in collection "${schema.name}"`,
      );
      return false;
    }
    fieldNames.add(name);
  }

  return true;
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
/** Track changed files for incremental reconciliation */
const _changedFiles = new Set<string>();

/**
 * Flags the content system that a file has changed.
 */
export function markFileDirty(filePath?: string | null) {
  _isDirty = true;
  if (filePath) {
    _mtimeTree.delete(filePath);
    _schemaCache.delete(filePath);
    _changedFiles.add(filePath);
  }
}

/** Returns and clears tracked changed files for incremental reconciliation. */
export function flushChangedFiles(): string[] {
  const files = Array.from(_changedFiles);
  _changedFiles.clear();
  return files;
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
            logger.error("[Scanner] Blocked unsafe schema path", {
              path: file.fullPath,
            });
            return;
          }

          const moduleData = await loadSchema(file.fullPath, file.mtime);
          const schema = moduleData?.schema;

          if (schema) {
            // Validate schema structure before caching
            if (!validateSchemaFields(schema)) {
              logger.error("[Scanner] Skipping invalid schema", {
                path: file.fullPath,
                name: schema.name,
              });
              return;
            }

            // Run onSchemaLoad plugins (enrichment, validation, transforms)
            let enrichedSchema = schema;
            for (const plugin of _plugins) {
              if (plugin.onSchemaLoad) {
                try {
                  enrichedSchema =
                    (await plugin.onSchemaLoad(enrichedSchema, file.fullPath)) || enrichedSchema;
                } catch (err: any) {
                  logger.error(`[Plugin] ${plugin.name}.onSchemaLoad failed: ${err.message}`);
                }
              }
            }

            const hash = generateSchemaHash(enrichedSchema);
            if (cached && cached.hash === hash) {
              await setSchemaCacheEntry(cacheKey, { ...cached, mtime: file.mtime }, enrichedSchema);
              _schemaCache.set(file.fullPath, enrichedSchema);
            } else {
              enrichSchemaWithMetadata(enrichedSchema, file.fullPath, collectionsDir);
              await setSchemaCacheEntry(
                cacheKey,
                { mtime: file.mtime, hash, schema: enrichedSchema },
                enrichedSchema,
              );
              _schemaCache.set(file.fullPath, enrichedSchema);
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
      const res = await db.collection.listSchemas(tenantId as DatabaseId);
      if (res.success && res.data) {
        dbSchemas = res.data;
      }
    } catch (err) {
      logger.error("[RECONCILE] Failed to list schemas from DB:", err);
    }
  }

  // Merge schemas (file-based takes precedence, but DB-only ones are kept)
  const schemaMap = new Map<string, Schema>();

  // 🚀 Standardize mapping keys to lowercase, but PRESERVE original schema ID casing
  // to avoid breaking case-sensitive consumers like GraphQL.
  for (const s of dbSchemas) {
    if (s._id) {
      schemaMap.set(s._id.toLowerCase(), s);
    }
  }

  for (const s of fileSchemas) {
    if (s._id) {
      // 🛡️ FIELD PRESERVATION: File-based schemas always win, but also guard
      // against the DB fallback (fields: []) overwriting a richer file schema.
      const key = s._id.toLowerCase();
      const existing = schemaMap.get(key);
      if (!existing || (existing.fields?.length ?? 0) < (s.fields?.length ?? 0)) {
        schemaMap.set(key, s);
      }
    }
  }

  const finalSchemas = Array.from(schemaMap.values());

  const nodes = finalSchemas.map((schema) => ({
    ...schema,
    nodeType: "collection",
    collectionDef: schema,
    path:
      schema.path ||
      `/collection/${(schema.slug || schema.name || schema._id || "").toLowerCase()}`,
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
    markFileDirty(changedFile);
    if (process.env.BENCHMARK_DEBUG === "true") {
      logger.info(
        `[RECONCILE] fullReload triggered. Tenant: ${tenantId}, target: ${changedFile || "ALL"}`,
      );
    }

    const dbAdapter = adapter || (await (await import("@src/databases/db")).getDb());
    if (!dbAdapter) return;

    const isIncremental = !!(changedFile && changedFile.endsWith(".js"));

    // Full reload: prefix-clear schema:* in L1/L2 (invalidateByCategory pattern does not match schema keys)
    if (!isIncremental) {
      await invalidateSchemaCache(tenantId ?? null);
    }

    if (isIncremental) {
      await this.handleIncrementalReload(changedFile!, tenantId, dbAdapter);
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

    // Fire onReconcile plugin hooks (async, fire-and-forget)
    for (const plugin of _plugins) {
      if (plugin.onReconcile) {
        const result = plugin.onReconcile(operations, prunedPaths);
        if (result instanceof Promise) {
          result.catch((err: Error) =>
            logger.error(`[Plugin] ${plugin.name}.onReconcile: ${err.message}`),
          );
        }
      }
    }

    // 4. Invalidate navigation L1/L2 + broadcast
    await notifyContentUpdate(tenantId);
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

    // 🛡️ HARDENING: Ensure we only map nodes with valid paths
    const dbMapByPath = new Map(dbNodes.filter((n) => !!n.path).map((n) => [n.path!, n]));

    const categoryIdMap = new Map(
      categoryNodes.filter((c) => !!c.path).map((c) => [c.path!, c._id]),
    );

    operations.push(...categoryNodes);
    for (const cat of categoryNodes) if (cat.path) processedPaths.add(cat.path);

    const now = dateToISODateString(new Date());

    for (const schema of schemas) {
      // 🚀 PATH RECOVERY: Ensure schema has a valid path derived from ID if missing
      const schemaPath =
        schema.path ||
        `/collection/${(schema.slug || schema.name || schema._id || "").toLowerCase()}`;

      let existing = dbMapByPath.get(schemaPath);
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

      const parentId = categoryIdMap.get(schemaPath.split("/").slice(0, -1).join("/")) || undefined;
      const hasChanged =
        !existing ||
        existing.source !== "filesystem" ||
        existing.name !== String(schema.name) ||
        existing.parentId !== parentId;

      const node: ContentNode = {
        ...existing,
        _id: (schema._id || existing?._id || schema.name || "unknown") as DatabaseId,
        path: schemaPath,
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

      // 🚀 SMART PRUNING: Only prune filesystem nodes that are no longer on disk.
      const source = dbNode.source || "filesystem";

      if (source === "filesystem") {
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.info(
            `[Reconcile] Pruning stale filesystem node: ${path} (type: ${dbNode.nodeType})`,
          );
        }
        if (path) prunedPaths.push(path);
      } else {
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.info(`[Reconcile] Preserving API/Internal node: ${path} (source: ${source})`);
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
    if (process.env.BENCHMARK_DEBUG === "true" || process.env.BENCHMARK === "true") {
      logger.info(
        `[RECONCILE] Syncing ${operations.length} nodes and pruning ${prunedPaths.length} paths for tenant: ${tenantId || "global"}`,
      );
    }

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
      await dbAdapter.content.nodes.deleteMany(prunedPaths, {
        tenantId: tenantId as any,
      });
    }
  },

  async handleIncrementalReload(
    filePath: string,
    tenantId: string | null | undefined,
    dbAdapter: IDBAdapter,
    options?: { broadcast?: boolean },
  ): Promise<ContentNode | null> {
    const fullPath = path.resolve(filePath);

    if (!isSafeCollectionPath(fullPath)) {
      logger.error("[Incremental] Blocked unsafe schema path", { path: fullPath });
      return null;
    }

    const stats = await fsPromises.stat(fullPath).catch(() => null);
    if (!stats) return null;

    const cacheKey = `schema:${fullPath}`;
    const cached = await cacheService.get<{
      mtime: number;
      hash: string;
      schema: Schema;
    }>(cacheKey, null, CacheCategory.SCHEMA);

    const moduleData = await loadSchema(fullPath, stats.mtimeMs);
    const schema = moduleData?.schema;
    if (!schema) return null;

    if (!validateSchemaFields(schema)) {
      logger.error("[Incremental] Skipping invalid schema", {
        path: fullPath,
        name: schema.name,
      });
      return null;
    }

    const hash = generateSchemaHash(schema);
    if (cached && cached.hash === hash) {
      await setSchemaCacheEntry(cacheKey, { ...cached, mtime: stats.mtimeMs }, schema);
      return null;
    }

    const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");
    enrichSchemaWithMetadata(schema, fullPath, collectionsDir);

    await setSchemaCacheEntry(cacheKey, { mtime: stats.mtimeMs, hash, schema }, schema);

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

    if (options?.broadcast !== false) {
      await notifyContentUpdate(tenantId);
    }

    return node;
  },

  /**
   * Processes all files queued via markFileDirty / flushChangedFiles in one batched pass.
   * Fires a single CONTENT_UPDATE event after all surgical updates complete.
   */
  async processChangedFiles(
    tenantId?: string | null,
    adapter?: IDBAdapter,
    options?: { requireFullReload?: boolean },
  ): Promise<void> {
    const changedFiles = flushChangedFiles();
    const dbAdapter = adapter || (await (await import("@src/databases/db")).getDb());
    if (!dbAdapter) return;

    if (options?.requireFullReload || changedFiles.length === 0) {
      if (options?.requireFullReload) {
        await this.fullReload(tenantId, false, dbAdapter, null);
      }
      return;
    }

    const validFiles = changedFiles.filter((f) => f.endsWith(".js") && isSafeCollectionPath(f));

    if (validFiles.length === 0) {
      if (options?.requireFullReload) {
        await this.fullReload(tenantId, false, dbAdapter, null);
      }
      return;
    }

    if (validFiles.length === 1 && !options?.requireFullReload) {
      await this.handleIncrementalReload(validFiles[0], tenantId, dbAdapter);
      return;
    }

    await this.processBatchedIncrementalReload(validFiles, tenantId, dbAdapter);
  },

  /**
   * Parallel surgical updates for multiple changed files — one DB broadcast at the end.
   */
  async processBatchedIncrementalReload(
    filePaths: string[],
    tenantId?: string | null,
    adapter?: IDBAdapter,
  ): Promise<void> {
    const dbAdapter = adapter || (await (await import("@src/databases/db")).getDb());
    if (!dbAdapter || filePaths.length === 0) return;

    const updates = await Promise.all(
      filePaths.map((filePath) =>
        this.handleIncrementalReload(filePath, tenantId, dbAdapter, { broadcast: false }),
      ),
    );

    const nodes = updates.filter((n): n is ContentNode => !!n);
    if (nodes.length > 0) {
      await notifyContentUpdate(tenantId, { batchSize: nodes.length });
    }
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
        await dbAdapter.content.nodes.bulkUpdate(updates, {
          tenantId: tenantId as any,
        });
    }

    if (deleteOps.length > 0) {
      const pathsToDelete = deleteOps.map((op) => op.node.path).filter((p): p is string => !!p);
      if (pathsToDelete.length > 0)
        await dbAdapter.content.nodes.deleteMany(pathsToDelete, {
          tenantId: tenantId as any,
        });
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
