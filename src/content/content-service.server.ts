/**
 * @file src/content/content-service.server.ts
 * @description
 * High-performance, server-only service for content synchronization and reconciliation.
 * Consolidates file scanning, module processing, and database operations.
 * Guaranteed to be mocked on the client via .server.ts suffix.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@utils/logger";
import { CacheCategory } from "@src/databases/cache/types";
import { dateToISODateString } from "@utils/date-utils";
import { generateUUID as uuidv4 } from "@utils/native-utils";
import { widgetRegistryService } from "@src/services/widget-registry-service";
import { contentStore } from "@stores/content-store.svelte";
import type { ContentNode, Schema, DatabaseId, MinimalContentNode } from "./types";
import type { IDBAdapter } from "@src/databases/db-interface";
import { generateCategoryNodesFromPaths } from "./content-utils";
import { eventBus, SystemEvents } from "@utils/event-bus";
import { cacheService } from "@src/databases/cache/cache-service";

// --- HELPERS ---

function schemasAreEqual(a: Schema, b: Schema | undefined): boolean {
  if (!b) return false;
  return (
    a.name === b.name &&
    a.slug === b.slug &&
    a.icon === b.icon &&
    JSON.stringify(a.fields || []) === JSON.stringify(b.fields || []) &&
    JSON.stringify(a.translations || []) === JSON.stringify(b.translations || [])
  );
}

const getDbAdapter = async () => {
  const { dbInitPromise, dbAdapter } = await import("@src/databases/db");
  await dbInitPromise;
  return dbAdapter as IDBAdapter;
};

const toDatabaseId = (id: string) => id as DatabaseId;

// --- MODULE PROCESSING ---

/**
 * Safely parses a compiled collection JS module string.
 */
export async function processModule(content: string): Promise<{ schema?: Schema } | null> {
  try {
    const schemaMatch = content.match(/export\s+const\s+schema\s*=\s*/);
    const defaultMatch = content.match(/export\s+default\s+/);
    const match = schemaMatch || defaultMatch;
    if (!match) return null;

    const startIdx = match.index! + match[0].length;
    let schemaContent = "";

    const potentialVarName = content.substring(startIdx, startIdx + 50).trim();
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*;?$/.test(potentialVarName.replace(/;$/, ""))) {
      const varName = potentialVarName.replace(/;$/, "").trim();
      const varDefMatch = content.match(
        new RegExp(`(?:const|let|var|function)\\s+${varName}(?::[^,=]*)?\\s*[=:]\\s*`),
      );
      if (varDefMatch) {
        const varStartIdx = varDefMatch.index! + varDefMatch[0].length;
        let braceCount = 0;
        let vEndIdx = varStartIdx;
        let foundStart = false;
        for (let i = varStartIdx; i < content.length; i++) {
          const c = content[i];
          if (!foundStart) {
            if (c === "{") {
              foundStart = true;
              braceCount = 1;
              vEndIdx = i + 1;
            }
            continue;
          }
          if (c === "{") braceCount++;
          else if (c === "}") {
            braceCount--;
            if (braceCount === 0) {
              vEndIdx = i + 1;
              break;
            }
          }
        }
        schemaContent = content.substring(varStartIdx, vEndIdx);
      }
    } else {
      const firstBrace = content.indexOf("{", startIdx);
      let endIdx = content.length;
      if (firstBrace !== -1) {
        let depth = 0;
        let inString: string | null = null;
        for (let i = firstBrace; i < content.length; i++) {
          const c = content[i];
          if (inString) {
            if (c === inString && content[i - 1] !== "\\") inString = null;
            continue;
          }
          if (c === '"' || c === "'" || c === "`") {
            inString = c;
            continue;
          }
          if (c === "{") depth++;
          else if (c === "}") {
            depth--;
            if (depth === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }
      }
      schemaContent = content.substring(startIdx, endIdx).trim();
    }

    if (!schemaContent) return null;

    const widgetsMap = await widgetRegistryService.getAllWidgets();
    const widgetsObject = Object.fromEntries(widgetsMap.entries());
    const widgetsProxy = new Proxy(widgetsObject, {
      get(target, prop) {
        if (typeof prop !== "string") return undefined;
        if (prop in target) return target[prop];
        const lowerProp = prop.toLowerCase();
        const entry = Object.entries(target).find(([key]) => key.toLowerCase() === lowerProp);
        return entry ? entry[1] : undefined;
      },
    });

    const globalObj = globalThis as any;
    const originalWidgets = globalObj.widgets;
    globalObj.widgets = widgetsProxy;

    try {
      const moduleContent = `return (function() { const widgets = globalThis.widgets; return ${schemaContent}; })();`;
      const result = new Function(moduleContent)();
      if (result && typeof result === "object" && "fields" in result) {
        if (!result._id) result._id = (result.name || "unknown").toLowerCase();
        return { schema: result as Schema };
      }
    } finally {
      globalObj.widgets = originalWidgets;
    }
    return null;
  } catch (err) {
    logger.error("Failed to process module:", err);
    return null;
  }
}

// --- FILE SCANNING ---

async function recursivelyGetFilesWithStats(
  dir: string,
  ext: string,
): Promise<{ path: string; mtime: number }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: { path: string; mtime: number }[] = [];

  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await recursivelyGetFilesWithStats(fullPath, ext)));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        const stats = await fs.stat(fullPath);
        results.push({ path: fullPath, mtime: stats.mtimeMs });
      }
    }),
  );
  return results;
}

export async function scanAndProcessFiles(): Promise<Schema[]> {
  const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");
  const extension = ".js";

  try {
    await fs.access(collectionsDir);
  } catch {
    return [];
  }

  const filesWithStats = await recursivelyGetFilesWithStats(collectionsDir, extension);
  logger.info(
    `[ContentService] Found ${filesWithStats.length} compiled collection files in ${collectionsDir}`,
  );

  const results = await Promise.all(
    filesWithStats.map(async ({ path: filePath, mtime }) => {
      const cacheKey = `schema_mtime:${filePath}`;
      const cachedData = await cacheService.get<{ mtime: number; schema: Schema }>(cacheKey);

      // If mtime matches, return cached schema to avoid expensive parsing/eval
      if (cachedData && cachedData.mtime === mtime) {
        return cachedData.schema;
      }

      try {
        const content = await fs.readFile(filePath, "utf-8");
        const moduleData = await processModule(content);
        if (!moduleData?.schema) {
          logger.warn(`[ContentService] Failed to extract schema from ${filePath}`);
          return null;
        }

        const schema = moduleData.schema;
        logger.info(`[ContentService] Successfully processed schema: ${schema.name || filePath}`);
        const collectionSlug =
          schema.slug ||
          (schema.name as string)?.toLowerCase() ||
          path.basename(filePath, extension).toLowerCase();

        const cleanPath = `/collection/${collectionSlug.replace(/^\//, "")}`;

        if (!schema._id) {
          schema._id = collectionSlug.replace(/[^a-z0-9]/g, "");
        }

        const finalSchema = {
          ...schema,
          path: cleanPath,
          name: schema.name || path.basename(filePath, extension),
        } as Schema;

        // Persist to cache (category CONTENT has its own TTL, but we use it as a 2nd layer structure cache)
        await cacheService.set(cacheKey, { mtime, schema: finalSchema }, 3600);

        return finalSchema;
      } catch (error) {
        logger.warn(`Failed to process collection file: ${filePath}`, error);
        return null;
      }
    }),
  );
  return results.filter((s): s is Schema => s !== null);
}

// --- RECONCILIATION LOGIC ---

export function buildReconciliationOperations(
  schemas: Schema[],
  fileCategoryNodes: Map<string, MinimalContentNode>,
  dbNodeMapByPath: Map<string, ContentNode>,
): ContentNode[] {
  const operations: ContentNode[] = [];
  const now = dateToISODateString(new Date());
  const pathToIdMap = new Map<string, DatabaseId>();
  const dbNodeMapById = new Map<string, ContentNode>();

  for (const node of dbNodeMapByPath.values()) dbNodeMapById.set(node._id.toString(), node);

  const processedPaths = new Set<string>();

  for (const schema of schemas) {
    if (!schema.path) continue;
    const dbNode = dbNodeMapById.get(schema._id as string) || dbNodeMapByPath.get(schema.path);
    const nodeId = toDatabaseId(schema._id as string);

    operations.push({
      _id: nodeId,
      parentId: undefined,
      path: schema.path,
      name: String(schema.name),
      icon: schema.icon ?? dbNode?.icon ?? "bi:file",
      slug: schema.slug ?? dbNode?.slug,
      description: schema.description ?? dbNode?.description,
      order: dbNode?.order ?? 999,
      nodeType: "collection",
      translations: schema.translations ?? dbNode?.translations ?? [],
      collectionDef: schema,
      tenantId: schema.tenantId,
      createdAt: dbNode?.createdAt ? dateToISODateString(new Date(dbNode.createdAt)) : now,
      updatedAt: now,
    });
    pathToIdMap.set(schema.path, nodeId);
    processedPaths.add(schema.path);
  }

  for (const [path, fileNode] of fileCategoryNodes.entries()) {
    if (processedPaths.has(path)) continue;
    const dbNode = dbNodeMapByPath.get(path);
    const nodeId = toDatabaseId(dbNode?._id ?? uuidv4().replace(/-/g, ""));

    operations.push({
      _id: nodeId,
      path,
      name: (dbNode?.name ?? fileNode.name) as string,
      icon: dbNode?.icon ?? "bi:folder",
      order: dbNode?.order ?? 999,
      nodeType: "category",
      translations: dbNode?.translations ?? [],
      createdAt: dbNode?.createdAt ? dateToISODateString(new Date(dbNode.createdAt)) : now,
      updatedAt: now,
    });
    pathToIdMap.set(path, nodeId);
    processedPaths.add(path);
  }

  const requiredCategoryPaths = new Set<string>();
  for (const schema of schemas) {
    if (!schema.path) continue;
    const parts = schema.path.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++)
      requiredCategoryPaths.add(`/${parts.slice(0, i).join("/")}`);
  }

  for (const [path, dbNode] of dbNodeMapByPath.entries()) {
    if (
      !processedPaths.has(path) &&
      dbNode.nodeType === "category" &&
      requiredCategoryPaths.has(path)
    ) {
      operations.push({
        ...dbNode,
        _id: toDatabaseId(dbNode._id.toString()),
        createdAt: dbNode.createdAt ? dateToISODateString(new Date(dbNode.createdAt)) : now,
        updatedAt: now,
      });
      pathToIdMap.set(path, toDatabaseId(dbNode._id.toString()));
    }
  }

  operations.sort((a, b) => (a.path?.split("/").length ?? 0) - (b.path?.split("/").length ?? 0));

  for (const op of operations) {
    if (!op.path) continue;
    const pathParts = op.path.split("/").filter(Boolean);
    if (pathParts.length > 1) {
      const parentPath = `/${pathParts.slice(0, -1).join("/")}`;
      op.parentId = pathToIdMap.get(parentPath);
    }
  }
  return operations;
}

// --- DB OPERATIONS ---

export async function registerModels(dbAdapter: IDBAdapter, schemas: Schema[]): Promise<void> {
  const collectionsToProcess = schemas.filter((s) => "fields" in s);
  for (const schema of collectionsToProcess) {
    try {
      await dbAdapter.collection.createModel(schema);
    } catch (e) {
      logger.error(`Failed to register model for ${schema.name}:`, e);
    }
  }
}

export async function bulkUpsertWithParentIds(
  dbAdapter: IDBAdapter,
  operations: ContentNode[],
  tenantId?: string | null,
  dbNodes?: ContentNode[],
): Promise<void> {
  const upsertOps = operations.map((op) => ({
    path: op.path as string,
    id: op._id.toString(),
    changes: {
      ...op,
      _id: op._id.toString() as DatabaseId,
      parentId: op.parentId ? (op.parentId.toString() as DatabaseId) : undefined,
      // L2 CACHE: Store the full collection definition (including fields) in the database
      // This allows the system to boot instantly from DB without scanning the filesystem.
      collectionDef: op.collectionDef,
    } as Partial<ContentNode>,
  }));

  await dbAdapter.content.nodes.bulkUpdate(upsertOps, {
    tenantId: tenantId as DatabaseId,
    bypassTenantCheck: true,
  });

  const currentPaths = new Set(operations.map((op) => op.path));
  const result =
    dbNodes && dbNodes.length > 0
      ? { success: true, data: dbNodes }
      : await dbAdapter.content.nodes.getStructure("flat", {
          tenantId: tenantId as DatabaseId,
          bypassCache: true,
          bypassTenantCheck: true,
        });

  const structureNodes = result.success ? result.data : [];
  const orphans = structureNodes.filter(
    (node: ContentNode) => node.path && !currentPaths.has(node.path),
  );

  if (orphans.length > 0) {
    await dbAdapter.crud.deleteMany("system_content_structure", {
      _id: { $in: orphans.map((n: ContentNode) => n._id.toString()) },
      ...(tenantId ? { tenantId } : {}),
    } as any);
  }

  if (dbAdapter.monitoring?.cache?.invalidateCategory) {
    await dbAdapter.monitoring.cache.invalidateCategory(
      CacheCategory.CONTENT,
      tenantId as DatabaseId,
    );
  }

  // Broadcast the update for real-time sync (SSE)
  const updateData = {
    version: Date.now(),
    type: "reconcile",
    tenantId: tenantId || "all",
  };

  // 1. Local Broadcast
  eventBus.broadcast(SystemEvents.CONTENT_UPDATE, updateData);

  // 2. Redis Pub/Sub Broadcast (for multi-server setup)
  const redis = cacheService.getRedisClient();
  if (redis && redis.isOpen) {
    try {
      await redis.publish("svelty:content_update", JSON.stringify(updateData));
      logger.debug(`[Redis] Published content update for tenant: ${tenantId || "all"}`);
    } catch (err) {
      logger.warn("[Redis] Failed to publish content update:", err);
    }
  }
}

// --- ORCHESTRATION ---

export const contentService = {
  async fullReload(
    tenantId?: string | null,
    skipReconciliation = false,
    adapter?: IDBAdapter,
    incremental = false, // new flag
  ): Promise<void> {
    const dbAdapter = adapter || (await getDbAdapter());

    // L2 CACHE: If not forced and setup is complete, try loading everything from DB first.
    // This avoids even the mtime check on cold starts.
    if (!incremental && !skipReconciliation && dbAdapter) {
      const result = await dbAdapter.content.nodes.getStructure("flat", {
        tenantId: tenantId as DatabaseId,
        bypassTenantCheck: true,
        bypassCache: true,
      });

      if (result.success && result.data.length > 0) {
        const schemas = result.data
          .filter((node) => node.nodeType === "collection" && node.collectionDef)
          .map((node) => node.collectionDef!);

        if (schemas.length > 0) {
          logger.info(
            `[ContentService] L2 Cache HIT: Loaded ${schemas.length} schemas from database`,
          );
          await this.reconcile(schemas, tenantId, skipReconciliation, dbAdapter, incremental);
          return;
        }
      }
    }

    const schemas = await scanAndProcessFiles();
    await this.reconcile(schemas, tenantId, skipReconciliation, dbAdapter, incremental);
  },

  async reconcile(
    allSchemas: Schema[],
    tenantId?: string | null,
    skipReconciliation = false,
    adapter?: IDBAdapter,
    incremental = false, // new flag
  ): Promise<void> {
    const dbAdapter = adapter || (await getDbAdapter());
    const schemas = allSchemas.filter((s) => !(tenantId && s.tenantId) || s.tenantId === tenantId);

    if (!dbAdapter) {
      await contentStore.sync(
        schemas.map(
          (s) =>
            ({
              _id: toDatabaseId(s._id as string),
              path: s.path || "",
              name: s.name || "",
              nodeType: "collection",
              collectionDef: s,
            }) as any,
        ),
      );
      return;
    }

    if (dbAdapter.ensureCollections) await dbAdapter.ensureCollections();
    if (dbAdapter.ensureContent) await dbAdapter.ensureContent();

    const result = await dbAdapter.content.nodes.getStructure("flat", {
      tenantId: tenantId as DatabaseId,
      bypassTenantCheck: true,
      bypassCache: true,
    });
    const dbNodes: ContentNode[] = result.success ? result.data : [];

    // --- INCREMENTAL CHECK ---
    if (incremental && dbNodes.length > 0) {
      const changed = allSchemas.filter((schema) => {
        const existing = dbNodes.find((n) => n._id === schema._id || n.path === schema.path);
        return !existing || !schemasAreEqual(schema, existing.collectionDef);
      });

      if (changed.length === 0) {
        logger.debug("✅ No schema changes — skipping reconciliation");
        return;
      }
      logger.info(`🔄 Incremental reconciliation: ${changed.length} schemas changed`);
    }

    await registerModels(dbAdapter, schemas);

    if (!skipReconciliation && dbNodes.length === 0) skipReconciliation = false;

    let operations: ContentNode[] = [];
    if (skipReconciliation) {
      operations = schemas.map(
        (s) =>
          ({
            _id: toDatabaseId(s._id as string),
            path: s.path || "",
            name: s.name || "",
            nodeType: "collection",
            collectionDef: s,
          }) as any,
      );
    } else {
      const fileCategoryNodes = generateCategoryNodesFromPaths(schemas);
      const dbNodeMap = new Map(dbNodes.filter((n) => !!n.path).map((n) => [n.path as string, n]));
      operations = buildReconciliationOperations(schemas, fileCategoryNodes, dbNodeMap);
      await bulkUpsertWithParentIds(dbAdapter, operations, tenantId, dbNodes);
    }

    contentStore.sync(dbNodes.length > 0 ? dbNodes : operations);
  },

  async getContentStructureFromDatabase(
    format: "flat" | "nested" = "nested",
    tenantId?: string | null,
  ): Promise<ContentNode[]> {
    const dbAdapter = await getDbAdapter();
    const result = await dbAdapter.content.nodes.getStructure(format, {
      tenantId: tenantId as DatabaseId,
    });
    return result.success ? result.data : [];
  },

  async reorderNodes(items: any[], tenantId?: string | null): Promise<void> {
    const dbAdapter = await getDbAdapter();
    if (!dbAdapter) return;

    if (dbAdapter.content.nodes.reorderStructure) {
      await dbAdapter.content.nodes.reorderStructure(items);
    } else {
      const updates = items.map((item) => ({
        path: item.path,
        id: item.id,
        changes: { order: item.order, parentId: item.parentId },
      }));
      await dbAdapter.content.nodes.bulkUpdate(updates, {
        tenantId: tenantId as DatabaseId,
        bypassTenantCheck: true,
      });
    }

    // Broadcast reorder event
    eventBus.broadcast(SystemEvents.CONTENT_UPDATE, {
      version: Date.now(),
      type: "reorder",
      tenantId: tenantId || "all",
    });
  },

  /**
   * Compatibility proxy for setup and migrations.
   */
  async scanCompiledCollections(): Promise<Schema[]> {
    return scanAndProcessFiles();
  },
};

export const scanCompiledCollections = contentService.scanCompiledCollections;
