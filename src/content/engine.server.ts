/**
 * @file src/content/engine.server.ts
 * @description
 * Unified content engine: scanner, reconciliation, cache invalidation, watcher, and CRUD.
 *
 * ### Features:
 * - Mtime-tree filesystem scanner with L2 schema cache
 * - FS ↔ DB navigation tree reconciliation
 * - Incremental hot-reload for dev watcher
 * - Schema-only fast path for benchmarks
 */

import { existsSync, watch, type FSWatcher } from "node:fs";
import * as fsPromises from "node:fs/promises";
import path from "node:path";
import { logger } from "@utils/logger";
import { CacheCategory } from "@src/databases/cache/types";
import { dateToISODateString } from "@utils/date";
import { contentStore } from "@src/stores/content-registry.svelte";
import type { ContentNode, Schema, DatabaseId } from "./types";
import type { IDBAdapter } from "@src/databases/db-interface";
import { generateCategoryNodesFromPaths } from "./content-utils";
import { cacheService } from "@src/databases/cache/cache-service";
import { eventBus, SystemEvents } from "@utils/event-bus";
import { generateSchemaHash, isSafeCollectionPath, loadSchema } from "./loader.server";

// ─── Cache helpers ───────────────────────────────────────────────────────────

export const SCHEMA_CACHE_TTL_S = 3600;
export const NAVIGATION_CACHE_TTL_S = 300;

export function schemaCacheTags(schema: Schema): string[] {
  const id = String(schema._id || schema.name || "unknown").toLowerCase();
  return ["schema", `schema:${id}`];
}

export function navigationCacheTags(tenantId?: string | null): string[] {
  const tid = tenantId || "global";
  return ["navigation", "navigation:tree", `navigation:tree:${tid}`];
}

export async function setSchemaCacheEntry(
  cacheKey: string,
  value: Record<string, unknown>,
  schema: Schema,
  tenantId: string | null = null,
): Promise<void> {
  await cacheService.set(
    cacheKey,
    value,
    SCHEMA_CACHE_TTL_S,
    tenantId,
    CacheCategory.SCHEMA,
    schemaCacheTags(schema),
  );
}

export async function invalidateSchemaCache(tenantId: string | null = null): Promise<void> {
  await cacheService.clearByPattern("schema:", tenantId);
}

export async function invalidateNavigationCache(tenantId: string | null = null): Promise<void> {
  await cacheService.clearByPattern("navigation:tree:", tenantId);
}

export async function notifyContentUpdate(
  tenantId?: string | null,
  options?: { invalidateSchema?: boolean; batchSize?: number },
): Promise<void> {
  const tid = tenantId ?? null;

  if (options?.invalidateSchema) {
    await invalidateSchemaCache(tid);
  }

  await invalidateNavigationCache(tid);

  eventBus.broadcast(SystemEvents.CONTENT_UPDATE, {
    version: Date.now(),
    tenantId: tenantId || null,
    ...(options?.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
  });
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
const _mtimeTree = new Map<string, number>();
const _schemaCache = new Map<string, Schema>();
/** Track changed files for incremental reconciliation */
const _changedFiles = new Set<string>();

/**
 * Flags the content system that a file has changed.
 */
export function markFileDirty(filePath?: string | null) {
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

const _scanPromises = new Map<string, Promise<Schema[]>>();

/**
 * Scans the .compiledCollections directory for compiled schema files.
 */
export async function scanCompiledCollections(targetDir?: string): Promise<Schema[]> {
  const collectionsDir = targetDir || path.resolve(process.cwd(), ".compiledCollections");

  let promise = _scanPromises.get(collectionsDir);
  if (promise) return promise;

  promise = (async () => {
    if (!existsSync(collectionsDir)) {
      await fsPromises.mkdir(collectionsDir, { recursive: true });
    }
    const fileList: { fullPath: string; mtime: number }[] = [];

    const { isBenchmarkArtifact, isBenchmarkRuntime } =
      await import("@src/routes/setup/preset-collections.server");
    const skipBenchmarks = !isBenchmarkRuntime();

    async function walk(dir: string) {
      try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        if (process.env.BENCHMARK_DEBUG === "true") {
          logger.info(`[Scanner] readdir ${dir} found ${entries.length} entries`);
        }
        await Promise.all(
          entries.map(async (entry) => {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) return; // DO NOT walk subdirectories to prevent tenant leakage
            if (!entry.isFile() || !entry.name.endsWith(".js")) return;
            if (skipBenchmarks && isBenchmarkArtifact(entry.name)) return;
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

      if (scanList.length === 0) {
        return fileList
          .map((f) => _schemaCache.get(f.fullPath))
          .filter((s): s is Schema => s !== undefined);
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

          if (!schema) {
            // Compiled file is broken — delete it and touch source to trigger recompilation
            logger.warn("[Scanner] Broken compiled schema, triggering recompilation", {
              path: file.fullPath,
            });
            _schemaCache.delete(file.fullPath);
            _mtimeTree.delete(file.fullPath);
            await fsPromises.unlink(file.fullPath).catch(() => {});
            // Touch the source .ts file to trigger Vite HMR recompilation
            const tsPath = file.fullPath
              .replace(".compiledCollections", "config/collections")
              .replace(/\.js$/, ".ts");
            try {
              const now = new Date();
              await fsPromises.utimes(tsPath, now, now);
            } catch {
              /* source may not exist */
            }
            return;
          }

          // Always enrich before cache checks — ensures path is set regardless of hit/miss
          enrichSchemaWithMetadata(schema, file.fullPath, collectionsDir);

          // Validate schema structure before caching
          if (!validateSchemaFields(schema)) {
            logger.error("[Scanner] Skipping invalid schema, triggering recompilation", {
              path: file.fullPath,
              name: schema.name,
            });
            _schemaCache.delete(file.fullPath);
            _mtimeTree.delete(file.fullPath);
            await fsPromises.unlink(file.fullPath).catch(() => {});
            const tsPath = file.fullPath
              .replace(".compiledCollections", "config/collections")
              .replace(/\.js$/, ".ts");
            try {
              const now = new Date();
              await fsPromises.utimes(tsPath, now, now);
            } catch {
              /* source may not exist */
            }
            return;
          }

          const hash = generateSchemaHash(schema);
          if (cached && cached.hash === hash) {
            await setSchemaCacheEntry(cacheKey, { ...cached, mtime: file.mtime }, schema);
            _schemaCache.set(file.fullPath, schema);
          } else {
            await setSchemaCacheEntry(cacheKey, { mtime: file.mtime, hash, schema }, schema);
            _schemaCache.set(file.fullPath, schema);
          }
          _mtimeTree.set(file.fullPath, file.mtime);
        }),
      );

      const currentPaths = new Set(fileList.map((f) => f.fullPath));
      // Only delete orphaned files that belong to the current collectionsDir!
      for (const path of _schemaCache.keys()) {
        if (path.startsWith(collectionsDir) && !currentPaths.has(path)) {
          _schemaCache.delete(path);
          _mtimeTree.delete(path);
        }
      }
    } finally {
      _scanPromises.delete(collectionsDir);
    }
    return fileList
      .map((f) => _schemaCache.get(f.fullPath))
      .filter((s): s is Schema => s !== undefined);
  })();

  _scanPromises.set(collectionsDir, promise);
  return promise;
}

/**
 * 🚀 Fast-path for benchmarks.
 */
export async function refreshCollectionsCache(tenantId?: string | null, db?: IDBAdapter) {
  markFileDirty();
  const { getCompiledCollectionsPath } = await import("@utils/tenant.server");
  const targetDir = getCompiledCollectionsPath(tenantId);
  const fileSchemas = await scanCompiledCollections(targetDir);
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

  // Bootstrap: if no file schemas exist but DB has schemas, regenerate .ts source files
  if (fileSchemas.length === 0 && dbSchemas.length > 0) {
    await bootstrapCollectionFilesFromDb(dbSchemas);
    // Re-scan to pick up the newly generated files
    markFileDirty();
    const regenerated = await scanCompiledCollections(targetDir);
    for (const s of regenerated) {
      if (s._id) schemaMap.set(s._id.toLowerCase(), s);
    }
  }

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

/**
 * Bootstrap: regenerates .ts collection files from database schemas when
 * config/collections/ is empty. Prevents blank state after cache clears.
 */
async function bootstrapCollectionFilesFromDb(dbSchemas: Schema[]): Promise<void> {
  const { isLocalBenchmarkSandbox } = await import("@utils/benchmark-sandbox");
  if (isLocalBenchmarkSandbox()) {
    return;
  }

  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const baseDir = path.resolve(process.cwd(), "config", "collections");
  await fs.mkdir(baseDir, { recursive: true });
  const testDir = path.join(baseDir, "test");
  let testDirEnsured = false;

  const SYSTEM_COLLECTIONS = new Set(["redirects", "404_logs", "redirects_mv", "benchmarkstable"]);
  const { isBenchmarkArtifact, isBenchmarkRuntime } =
    await import("@src/routes/setup/preset-collections.server");
  const skipBenchmarks = !isBenchmarkRuntime();

  for (const schema of dbSchemas) {
    const slug = String((schema as any).slug || schema._id || schema.name || "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    if (!slug || SYSTEM_COLLECTIONS.has(slug)) continue;
    if (skipBenchmarks && isBenchmarkArtifact(`${slug}.ts`)) continue;
    if (!Array.isArray(schema.fields) || schema.fields.length === 0) continue;

    const fileName = `${slug}.ts`;
    // 🧪 Route bench/test/mock collections to test/ subdirectory
    // These are created by the benchmark matrix and should not pollute config/collections/
    const isTestCollection =
      slug.startsWith("bench") || slug.startsWith("mock") || slug.startsWith("test");
    const targetDir = isTestCollection ? testDir : baseDir;
    // Only create test/ dir when a test collection actually needs to be written
    if (isTestCollection && !testDirEnsured) {
      await fs.mkdir(testDir, { recursive: true });
      testDirEnsured = true;
    }
    const filePath = path.join(targetDir, fileName);

    // Skip if file already exists
    try {
      await fs.access(filePath);
      continue;
    } catch {}

    const content = `/**
 * @file ${isTestCollection ? "config/collections/test/" : "config/collections/"}${fileName}
 * @description ${schema.name || slug} — regenerated from database.
 */
import type { Schema } from '@src/content/types';

export const schema: Schema = ${JSON.stringify({ name: schema.name, slug, icon: (schema as any).icon || "mdi:database", description: (schema as any).description || "", fields: schema.fields || [] }, null, 2)};
`;
    const { assertLiveDataWriteAllowed } = await import("@utils/benchmark-sandbox");
    assertLiveDataWriteAllowed(filePath);
    await fs.writeFile(filePath, content, "utf-8");
    logger.info(
      `[Bootstrap] Regenerated collection file: ${isTestCollection ? "config/collections/test/" : "config/collections/"}${fileName}`,
    );
  }

  // Trigger compilation
  try {
    const { compile } = await import("@src/utils/compilation/compile");
    const { getCompiledCollectionsPath } = await import("@utils/tenant.server");
    await compile({
      userCollections: baseDir,
      compiledCollections: getCompiledCollectionsPath(null),
    });
  } catch (e) {
    logger.warn("[Bootstrap] Compilation after regeneration failed:", e);
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

    const { getCompiledCollectionsPath } = await import("@utils/tenant.server");
    const targetDir = getCompiledCollectionsPath(tenantId);
    const schemas = await scanCompiledCollections(targetDir);

    if (skipReconciliation) {
      await this.fastSyncStore(schemas, tenantId);
      return;
    }

    // 1. Fetch DB nodes, filesystem categories, and GUI manifest overrides
    const { getCollectionOrder, getStructureNodes } =
      await import("@utils/collection-order.server");
    const [dbResult, categoryNodes, manifestOrder, manifestStructure] = await Promise.all([
      dbAdapter.content.nodes.getStructure("flat", {
        tenantId: tenantId as any,
        bypassTenantCheck: true,
      }),
      generateCategoryNodesFromPaths(schemas, tenantId),
      getCollectionOrder(tenantId ?? null),
      getStructureNodes(tenantId ?? null),
    ]);
    const dbNodes = dbResult.success ? [...dbResult.data] : [];

    // Merge GUI categories from manifest when missing in DB (e.g. after cache clear)
    const knownIds = new Set(dbNodes.map((n) => n._id?.toString()));
    for (const snap of manifestStructure) {
      if (knownIds.has(snap._id)) continue;
      dbNodes.push({
        _id: snap._id as DatabaseId,
        name: snap.name,
        path: snap.path,
        nodeType: snap.nodeType,
        parentId: snap.parentId as DatabaseId | undefined,
        order: snap.order ?? 999,
        icon: snap.icon ?? "mdi:folder",
        source: snap.source ?? "builder",
        translations: [],
        tenantId: tenantId as any,
      } as unknown as ContentNode);
      knownIds.add(snap._id);
    }

    // 2. Calculate
    const { operations, prunedPaths } = this.calculateReconciledOperations(
      schemas,
      dbNodes,
      categoryNodes,
      tenantId,
      manifestOrder,
    );

    // 3. Persist
    await Promise.all([
      ensurePhysicalModels(schemas, dbAdapter),
      this.syncStoreAndDatabase(operations, prunedPaths, tenantId ?? null, dbAdapter),
    ]);

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
    manifestOrder: Record<string, number> = {},
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

      const parentId =
        existing?.parentId ??
        categoryIdMap.get(schemaPath.split("/").slice(0, -1).join("/")) ??
        undefined;
      const schemaId = String(schema._id || existing?._id || schema.name || "unknown");
      const manifestSort =
        manifestOrder[schemaId] ?? manifestOrder[schemaId.toLowerCase()] ?? existing?.order ?? 999;
      const hasChanged =
        !existing ||
        existing.source !== "filesystem" ||
        existing.name !== String(schema.name) ||
        existing.parentId !== parentId ||
        existing.order !== manifestSort;

      const node: ContentNode = {
        ...existing,
        _id: schemaId as DatabaseId,
        path: schemaPath,
        name: String(schema.name),
        icon: schema.icon || "bi:file",
        nodeType: "collection",
        collectionDef: schema,
        tenantId: tenantId as any,
        parentId: parentId,
        createdAt: existing?.createdAt || now,
        updatedAt: hasChanged ? now : existing?.updatedAt || now,
        order: manifestSort,
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

      // 🚀 SMART PRUNING: Only prune filesystem-backed nodes no longer on disk.
      // Builder/API categories and organizational nodes are preserved.
      const source = dbNode.source || "filesystem";

      if (source === "filesystem" && dbNode.nodeType !== "category") {
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
      logger.error("[Incremental] Blocked unsafe schema path", {
        path: fullPath,
      });
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

    // Always enrich before cache checks — ensures path is set regardless of hit/miss
    const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");
    enrichSchemaWithMetadata(schema, fullPath, collectionsDir);

    const hash = generateSchemaHash(schema);
    if (cached && cached.hash === hash) {
      await setSchemaCacheEntry(cacheKey, { ...cached, mtime: stats.mtimeMs }, schema);
      return null;
    }

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
        this.handleIncrementalReload(filePath, tenantId, dbAdapter, {
          broadcast: false,
        }),
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
    adapter?: IDBAdapter,
  ): Promise<any[]> {
    const db = adapter || (await (await import("@src/databases/db")).getDb());
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

  async upsertContentNodes(operations: any[], tenantId?: string | null, adapter?: IDBAdapter) {
    const dbAdapter = adapter || (await import("@src/databases/db")).dbAdapter;
    if (!dbAdapter || operations.length === 0) return;

    const upsertOps = operations.filter((op) => op.type !== "delete");
    const deleteOps = operations.filter((op) => op.type === "delete");

    if (upsertOps.length > 0) {
      const updates = upsertOps
        .map((op) => {
          const id = (op.node as any).id || op.node._id?.toString();
          if (!op.node.path) return null;
          return { path: op.node.path, id, changes: op.node };
        })
        .filter((u): u is any => u !== null);
      if (updates.length > 0) {
        const bulkResult = await dbAdapter.content.nodes.bulkUpdate(updates, {
          tenantId: tenantId as any,
        });
        if (!bulkResult.success) {
          throw new Error(
            bulkResult.message ||
              bulkResult.error?.message ||
              "[ContentService] bulkUpdate failed for structure nodes",
          );
        }
      }
    }

    if (deleteOps.length > 0) {
      const pathsToDelete = deleteOps.map((op) => op.node.path).filter((p): p is string => !!p);
      if (pathsToDelete.length > 0) {
        const deleteResult = await dbAdapter.content.nodes.deleteMany(pathsToDelete, {
          tenantId: tenantId as any,
        });
        if (!deleteResult.success) {
          throw new Error(
            deleteResult.message ||
              deleteResult.error?.message ||
              "[ContentService] deleteMany failed for structure nodes",
          );
        }
      }
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

export type RefreshMode = "full" | "schemas" | "incremental";

export interface RefreshOptions {
  mode?: RefreshMode;
  adapter?: IDBAdapter;
  skipReconciliation?: boolean;
  changedFile?: string | null;
  requireFullReload?: boolean;
}

/** Unified refresh entry point — replaces scattered fullReload / refreshCollectionsCache paths. */
export async function refreshContent(
  tenantId?: string | null,
  options: RefreshOptions = {},
): Promise<void> {
  const mode =
    options.mode ??
    (process.env.BENCHMARK === "true" || process.env.TEST_MODE === "true" ? "schemas" : "full");

  if (mode === "schemas") {
    return refreshCollectionsCache(tenantId, options.adapter);
  }

  if (mode === "incremental") {
    if (options.changedFile) {
      const dbAdapter = options.adapter || (await (await import("@src/databases/db")).getDb());
      if (!dbAdapter) return;
      await contentService.handleIncrementalReload(options.changedFile, tenantId, dbAdapter);
      return;
    }
    return contentService.processChangedFiles(tenantId, options.adapter, {
      requireFullReload: options.requireFullReload,
    });
  }

  const dbAdapter = options.adapter || (await (await import("@src/databases/db")).getDb());
  if (!dbAdapter) return;
  await contentService.fullReload(
    tenantId,
    options.skipReconciliation ?? false,
    dbAdapter,
    options.changedFile ?? null,
  );
}

// ─── Dev filesystem watcher ────────────────────────────────────────────────────

let _watcher: FSWatcher | null = null;
let _debounceTimer: NodeJS.Timeout | null = null;
let _isReloading = false;
let _pendingFullReload = false;

/** Initializes the file system watcher for the compiled collections directory. */
export function startContentWatcher() {
  const targetDir = path.resolve(process.cwd(), ".compiledCollections");

  if (process.env.BENCHMARK_DEBUG === "true") {
    logger.info(`[Watcher] Monitoring collections at: ${targetDir}`);
  }

  if (!existsSync(targetDir)) {
    logger.warn(`[Watcher] Target directory does not exist: ${targetDir}`);
    return () => {};
  }

  _watcher = watch(targetDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith(".js")) return;

    const filePath = path.join(targetDir, filename);
    const fileExists = existsSync(filePath);
    const isDelete = eventType === "rename" && !fileExists;

    markFileDirty(filePath);
    if (isDelete) _pendingFullReload = true;

    if (_debounceTimer) clearTimeout(_debounceTimer);

    _debounceTimer = setTimeout(async () => {
      if (_isReloading) return;

      try {
        _isReloading = true;
        await contentService.processChangedFiles(null, undefined, {
          requireFullReload: _pendingFullReload,
        });
        logger.info(`[Watcher] Content system re-synchronized (batched)`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        // Gracefully ignore — Vite module runner closes during dev server shutdown
        if (error.message?.includes("Vite module runner has been closed")) {
          return;
        }
        logger.error("[Watcher] Failed to reload content system", {
          filename,
          message: error.message,
          stack: error.stack,
        });
      } finally {
        _pendingFullReload = false;
        _isReloading = false;
      }
    }, 400);
  });

  return () => {
    if (_watcher) {
      _watcher.close();
      _watcher = null;
    }
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
    }
    _pendingFullReload = false;
  };
}
