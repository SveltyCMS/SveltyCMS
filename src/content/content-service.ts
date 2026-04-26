/**
 * @file src/content/content-service.ts
 * @description High-performance content reconciliation and schema management.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@utils/logger";
import { CacheCategory } from "@src/databases/cache/types";
import { dateToISODateString } from "@utils/date-utils";
import { contentStore } from "@src/stores/content-store.svelte";
import type { ContentNode, Schema, DatabaseId } from "./types";
import type { IDBAdapter } from "@src/databases/db-interface";
import { generateCategoryNodesFromPaths } from "./content-utils";
import { eventBus, SystemEvents } from "@utils/event-bus";
import { cacheService } from "@src/databases/cache/cache-service";
import { generateSchemaHash, loadSchemaNative } from "./module-processor";

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

  // Generate deterministic ID based on relative path if not explicitly provided
  const autoId = relativePath
    .replace(/\.(js|ts)$/, "")
    .replace(/[\\/]/g, "_")
    .toLowerCase();
  schema._id ||= autoId;

  // ✨ SEO-Optimized Path Generation: Favor slug > name > _id
  const pathSuffix = (schema.slug || schema.name || schema._id).toLowerCase();

  if (relativeDir !== ".") {
    // Ensure slashes are used for the URL path even on Windows
    const webRelativeDir = relativeDir.replace(/[\\/]/g, "/").toLowerCase();
    // If in subfolder, prefix the path (e.g. /collection/blog/posts)
    schema.path ||= `/collection/${webRelativeDir}/${pathSuffix}`;
  } else {
    schema.path ||= `/collection/${pathSuffix}`;
  }

  return schema;
}

/**
 * Scans the .compiledCollections directory for compiled schema files.
 */
export async function scanCompiledCollections(): Promise<Schema[]> {
  const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");
  const schemas: Schema[] = [];
  let isReloading = false;

  async function walk(dir: string) {
    if (isReloading) return;
    isReloading = true;
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
          continue;
        }

        if (!entry.isFile() || !entry.name.endsWith(".js")) continue;

        const stats = await fs.stat(fullPath);
        const cacheKey = `schema:${fullPath}`;

        const cached = await cacheService.get<{ mtime: number; hash: string; schema: Schema }>(
          cacheKey,
          null,
          CacheCategory.SCHEMA,
        );

        if (cached && cached.mtime === stats.mtimeMs) {
          schemas.push(cached.schema);
          continue;
        }

        // 🚀 Native Load: Bypasses readFile, string parsing, and eval.
        const moduleData = await loadSchemaNative(fullPath);
        const schema = moduleData?.schema;

        if (schema) {
          const hash = generateSchemaHash(schema);

          // If mtime changed but hash is identical, update cache and skip DB workload later
          if (cached && cached.hash === hash) {
            await cacheService.set(
              cacheKey,
              { mtime: stats.mtimeMs, hash, schema: cached.schema },
              3600,
              null,
              CacheCategory.SCHEMA,
            );
            schemas.push(cached.schema);
            continue;
          }

          enrichSchemaWithMetadata(schema, fullPath, collectionsDir);

          await cacheService.set(
            cacheKey,
            { mtime: stats.mtimeMs, hash, schema },
            3600,
            null,
            CacheCategory.SCHEMA,
          );
          schemas.push(schema);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        logger.error("[Watcher] Failed to reload content system", {
          message: err.message,
          stack: err.stack,
          name: err.name,
        });
      } else {
        logger.error("[Watcher] Failed to reload content system (unknown error type)", {
          error: String(err),
        });
      }
    } finally {
      isReloading = false;
    }
  }

  await walk(collectionsDir);
  return schemas;
}

export const contentService = {
  async fullReload(
    tenantId?: string | null,
    skipReconciliation = false,
    adapter?: IDBAdapter,
    changedFile?: string | null,
  ): Promise<void> {
    logger.info(
      `[RECONCILE] fullReload triggered. Tenant: ${tenantId}, skip: ${skipReconciliation}, target: ${changedFile || "ALL"}`,
    );
    if (skipReconciliation) {
      logger.info(`[RECONCILE] skipReconciliation is TRUE, skipping reconcileSchemas`);
    } else {
      logger.info(`[RECONCILE] skipReconciliation is FALSE, proceeding to reconcileSchemas`);
    }

    const processedPaths = new Set<string>();

    const dbAdapter = adapter || (await (await import("@src/databases/db")).getDb());
    if (!dbAdapter) return;

    // 🚀 CRITICAL: Invalidate schema cache so distributed workers pick up new files
    await cacheService.invalidateByCategory(CacheCategory.SCHEMA, tenantId);

    const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");

    // 🚀 SURGICAL INCREMENTAL RELOAD: Handle single file change if provided
    if (changedFile && changedFile.endsWith(".js")) {
      await this.handleIncrementalReload(changedFile, tenantId, dbAdapter, collectionsDir);
      return;
    }

    const schemas = await scanCompiledCollections();

    logger.debug(`[RECONCILE] scanCompiledCollections finished: ${schemas.length} schemas found.`);

    // Invalidate node-level caches
    try {
      await dbAdapter.monitoring?.cache?.invalidateCategory?.(
        CacheCategory.CONTENT,
        tenantId as any,
      );
    } catch (cacheErr) {
      logger.warn(`[RECONCILE] Cache invalidation failed: ${cacheErr}`);
    }

    if (skipReconciliation) {
      logger.debug("[RECONCILE] skipReconciliation=true, syncing contentStore directly.");
      contentStore.sync(
        schemas.map(
          (s) =>
            ({
              ...s,
              nodeType: "collection",
              collectionDef: s,
              path:
                s.path ||
                `/collection/${((s as any).slug || (s as any).name || (s as any)._id || "").toLowerCase()}`,
            }) as any,
        ),
      );
      return;
    }

    logger.debug("[RECONCILE] fetching structure from DB...");
    const dbResult = await dbAdapter.content.nodes.getStructure("flat", {
      tenantId: tenantId as any,
      bypassTenantCheck: true,
    });
    if (!dbResult.success) {
      logger.error(`[RECONCILE] Failed to fetch DB structure: ${dbResult.message}`);
    }
    const dbNodes = dbResult.success ? dbResult.data : [];
    logger.debug(`[RECONCILE] DB nodes fetched: ${dbNodes.length}`);

    const categoryNodes = generateCategoryNodesFromPaths(schemas, tenantId);
    const dbMapByPath = new Map(dbNodes.map((n: ContentNode) => [n.path!, n]));

    // Build reconciled tree
    const operations: ContentNode[] = [];

    // Map to track deterministic IDs of generated categories for parent linking
    const categoryIdMap = new Map(categoryNodes.map((c) => [c.path!, c._id]));

    // Add categories to operations first
    operations.push(...categoryNodes);
    for (const cat of categoryNodes) {
      processedPaths.add(cat.path!);
    }

    const now = dateToISODateString(new Date());

    for (const schema of schemas) {
      // 🛡️ HARDEN: Prioritize matching by PATH, fallback to NAME
      // This prevents duplicate "ghost" entries if the path format changes.
      let existing = dbMapByPath.get(schema.path!);

      // If path didn't match, try matching by name
      if (!existing && schema.name) {
        const potentialDuplicates = Array.from(dbMapByPath.values()).filter(
          (n) => n.name === schema.name,
        );
        existing = potentialDuplicates[0];

        // 🔥 CRITICAL: If we found multiple nodes with the SAME name in the SAME folder (or top level), clean them up.
        // For subfolders, we check if the existing node was also at the top level.
        if (potentialDuplicates.length > 1) {
          logger.warn(
            `[RECONCILE] Detected ${potentialDuplicates.length} duplicates for '${schema.name}'. Cleaning up extras.`,
          );
          for (let i = 1; i < potentialDuplicates.length; i++) {
            const extra = potentialDuplicates[i];
            if (extra.path) dbMapByPath.delete(extra.path);
            logger.info(`[RECONCILE] Pruned duplicate ghost node: ${extra.path}`);
          }
        }
      }

      // Determine parentId based on path (look up in categoryIdMap)
      const pathParts = schema.path!.split("/");
      const parentPath = pathParts.slice(0, -1).join("/");
      const parentId = categoryIdMap.get(parentPath) || undefined;

      // ✨ Optimization: Only update if meaningful structural changes occurred
      // Now also checking cache for hash-based early exit.

      const hasChanged =
        !existing ||
        existing.source !== "filesystem" ||
        existing._id !== (schema._id || existing._id) ||
        existing.name !== String(schema.name) ||
        existing.icon !== (schema.icon || "bi:file") ||
        existing.order !== (existing?.order || 999) ||
        existing.parentId !== parentId ||
        JSON.stringify(existing.translations || []) !== JSON.stringify(schema.translations || []);

      const node: ContentNode = {
        ...existing,
        _id: (schema._id || existing?._id || schema.name || "unknown") as DatabaseId,
        path: schema.path,
        name: String(schema.name),
        icon: schema.icon || "bi:file",
        nodeType: "collection",
        collectionDef: schema,
        tenantId: tenantId as any,
        parentId: parentId, // ✨ Hierarchical linking
        createdAt: existing?.createdAt || now,
        updatedAt: hasChanged ? now : existing?.updatedAt || now,
        order: existing?.order || 999,
        translations: schema.translations || [],
        source: "filesystem", // Mark as filesystem-backed
      };

      operations.push(node);
      processedPaths.add(node.path!);

      // 🚀 ENSURE PHYSICAL TABLE: Create or update physical model in DB
      try {
        await dbAdapter.collection.createModel(schema);
      } catch (err) {
        logger.error(`[RECONCILE] Failed to create physical model for ${schema._id}: ${err}`);
      }

      if (existing?.path) dbMapByPath.delete(existing.path);
    }

    // 2. Selective Preservation of Database-only Nodes
    // We only preserve nodes that are explicitly marked as source: "database"
    // OR categories (which are currently ephemeral/built from paths but can be dynamic)
    const preservedNodes: ContentNode[] = [];
    const prunedPaths: string[] = [];

    for (const [path, dbNode] of dbMapByPath.entries()) {
      // Only prune filesystem-backed nodes that were NOT in the current scan
      if (processedPaths.has(path)) {
        continue;
      }

      if (dbNode.source === "filesystem" || (!dbNode.source && dbNode.nodeType === "collection")) {
        prunedPaths.push(path);
        continue;
      }

      // PRESERVE: Legitimate dynamic collections or categories
      preservedNodes.push(dbNode);
    }

    if (prunedPaths.length > 0) {
      logger.info(`[RECONCILE] Pruning ${prunedPaths.length} orphaned/ghost nodes:`, prunedPaths);
      // We will perform a bulk delete on these paths later or just not include them in the final operations
    }

    if (preservedNodes.length > 0) {
      logger.info(`[RECONCILE] Preserving ${preservedNodes.length} dynamic nodes.`);
      operations.push(...preservedNodes);
    }

    // 4. SYNC & PERSIST
    contentStore.sync(operations);

    // 🔥 PURE SYNC: Clear in-memory state before syncing to prevent ghost nodes from surviving in the singleton store
    contentStore.clear(tenantId as string);
    contentStore.sync(operations);

    // Persist reconciliation state
    // Step A: Sync found collections (bulkUpdate)
    if (operations.length > 0) {
      await dbAdapter.content.nodes.bulkUpdate(
        operations.map((op) => ({ path: op.path!, id: op._id, changes: op })),
        { tenantId: tenantId as any },
      );
    }

    // Step B: Explicitly DELETE pruned nodes from database
    if (prunedPaths.length > 0) {
      await dbAdapter.content.nodes.deleteMany(prunedPaths, { tenantId: tenantId as any });
    }

    // Sync Reactive Store
    contentStore.sync(operations);
    logger.info(`[RECONCILE] Sync complete for ${tenantId}`);

    eventBus.broadcast(SystemEvents.CONTENT_UPDATE, {
      version: Date.now(),
      tenantId: tenantId || "all",
    });
  },

  /**
   * Performs a high-performance surgical reload of a single schema file.
   * Bypasses full directory scanning and reconciliation pruning.
   */
  async handleIncrementalReload(
    filePath: string,
    tenantId: string | null | undefined,
    dbAdapter: IDBAdapter,
    collectionsDir: string,
  ): Promise<void> {
    const fullPath = path.resolve(filePath);
    const stats = await fs.stat(fullPath).catch(() => null);
    if (!stats) return;

    const cacheKey = `schema:${fullPath}`;
    const cached = await cacheService.get<{ mtime: number; hash: string; schema: Schema }>(
      cacheKey,
      null,
      CacheCategory.SCHEMA,
    );

    // 🚀 Native Load: Bypasses readFile, string parsing, and eval.
    const moduleData = await loadSchemaNative(fullPath);
    const schema = moduleData?.schema;

    if (!schema) return;

    const hash = generateSchemaHash(schema);

    // 🛡️ EARLY EXIT: If content hasn't actually changed, skip all logic
    if (cached && cached.hash === hash) {
      logger.debug(`[RECONCILE] Incremental: Hash match for ${path.basename(filePath)}. Skipping.`);
      // Update mtime in cache to prevent re-reading the file
      await cacheService.set(
        cacheKey,
        { ...cached, mtime: stats.mtimeMs },
        3600,
        null,
        CacheCategory.SCHEMA,
      );
      return;
    }

    logger.info(`[RECONCILE] Incremental: Updating ${path.basename(filePath)}...`);

    enrichSchemaWithMetadata(schema, fullPath, collectionsDir);

    // Update Cache
    await cacheService.set(
      cacheKey,
      { mtime: stats.mtimeMs, hash, schema },
      3600,
      null,
      CacheCategory.SCHEMA,
    );

    // Update Database Node
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

    // Sync Store & Broadcast
    contentStore.upsert(node); // Assuming upsert exists or we use sync with a partial set

    eventBus.broadcast(SystemEvents.CONTENT_UPDATE, {
      version: Date.now(),
      tenantId: tenantId || "all",
    });
  },

  scanCompiledCollections,

  async getContentStructureFromDatabase(
    format: "flat" | "tree" = "flat",
    tenantId?: string | null,
  ): Promise<any[]> {
    const db = await (await import("@src/databases/db")).getDb();
    const res = await db!.content.nodes.getStructure(format as any, {
      tenantId: tenantId as any,
      bypassTenantCheck: true, // 🔥 CRITICAL: Administrative views must see all nodes for the tenant
    });
    return res.success ? res.data : [];
  },

  async reorderNodes(items: any[], tenantId?: string | null): Promise<void> {
    const db = await (await import("@src/databases/db")).getDb();
    if (tenantId) logger.debug("Reordering nodes for tenant", { tenantId });
    await db!.content.nodes.reorderStructure(items);
  },

  async upsertContentNodes(operations: any[], tenantId?: string | null) {
    const { dbAdapter } = await import("@src/databases/db");
    if (!dbAdapter || operations.length === 0) return;

    const upsertOps = operations.filter(
      (op) => op.type === "create" || op.type === "update" || !op.type,
    );
    const deleteOps = operations.filter((op) => op.type === "delete");

    // 1. Handle Upserts/Updates
    if (upsertOps.length > 0) {
      const updates = upsertOps
        .map((op) => {
          const id = (op.node as any).id || op.node._id?.toString();
          if (!op.node.path) {
            logger.warn("[upsertContentNodes] Skipping node update due to missing path", op.node);
            return null;
          }
          return {
            path: op.node.path,
            id: id,
            changes: op.node,
          };
        })
        .filter((u): u is { path: string; id: string | undefined; changes: any } => u !== null);

      if (updates.length > 0) {
        await dbAdapter.content.nodes.bulkUpdate(updates, { tenantId: tenantId as any });
      }
    }

    // 2. Handle Deletions
    if (deleteOps.length > 0) {
      const pathsToDelete = deleteOps
        .map((op) => op.node.path)
        .filter((p): p is string => typeof p === "string" && p.length > 0);

      if (pathsToDelete.length > 0) {
        logger.info(`[upsertContentNodes] Deleting ${pathsToDelete.length} nodes by path`);
        await dbAdapter.content.nodes.deleteMany(pathsToDelete, { tenantId: tenantId as any });
      }
    }

    contentStore.updateVersion();
    logger.debug(`Content structure synced (${operations.length} operations processed)`);
  },
};
