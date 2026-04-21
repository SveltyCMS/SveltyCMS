/**
 * @file src/content/content-service.server.ts
 * @description High-performance content reconciliation and schema management.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@utils/logger";
import { CacheCategory } from "@src/databases/cache/types";
import { dateToISODateString } from "@utils/date-utils";
import { widgetRegistryService } from "@src/services/widget-registry-service";
import { contentStore } from "@src/stores/content-store.svelte";
import type { ContentNode, Schema, DatabaseId } from "./types";
import type { IDBAdapter } from "@src/databases/db-interface";
import { generateCategoryNodesFromPaths } from "./content-utils";
import { eventBus, SystemEvents } from "@utils/event-bus";
import { cacheService } from "@src/databases/cache/cache-service";

/**
 * Safely parses a compiled schema file using scoped evaluation.
 */
async function safelyParseSchema(content: string, filePath: string): Promise<Schema | null> {
  try {
    const exportMatch = content.match(/export\s+(?:const\s+schema\s*[:=]|default\s*[:=]?)\s*/);
    if (!exportMatch) {
      console.warn("[SCAN] No valid export match found in content.");
      return null;
    }

    const start = exportMatch.index! + exportMatch[0].length;
    let schemaStr = extractObjectLiteral(content, start);

    // Fallback: If no object literal found after export (e.g. export default Authors),
    // search for the first top-level object literal in the file.
    if (!schemaStr) {
      const firstCurly = content.indexOf("{");
      if (firstCurly !== -1) {
        schemaStr = extractObjectLiteral(content, firstCurly);
      }
    }

    if (!schemaStr) {
      console.error("[SCAN] No schema string extracted from content.");
      return null;
    }

    const widgetsMap = await widgetRegistryService.getAllWidgets();
    if (widgetsMap.size === 0) {
      await widgetRegistryService.initialize();
    }

    const widgetsProxy = new Proxy(widgetsMap, {
      get(target, prop) {
        if (typeof prop !== "string") return undefined;

        // 1. Direct hit
        if (target.has(prop)) return target.get(prop);

        // 2. Capitalized hit (Input -> Input)
        const capitalized = prop.charAt(0).toUpperCase() + prop.slice(1);
        if (target.has(capitalized)) return target.get(capitalized);

        // 3. Lower hit (Input -> input)
        const lowered = prop.toLowerCase();
        if (target.has(lowered)) return target.get(lowered);

        // 4. Kebab hit (RichText -> rich-text)
        const kebab = prop.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
        if (target.has(kebab)) return target.get(kebab);

        // 5. Exhaustive case-insensitive search
        const entries = Array.from(target.entries());
        const found = entries.find(([k]) => {
          const kLow = k.toLowerCase();
          return (
            kLow === lowered || kLow === kebab || kLow === prop.toLowerCase().replace(/-/g, "")
          );
        });

        return found ? found[1] : undefined;
      },
    });

    const previousGlobalWidgets = (globalThis as any).widgets;
    (globalThis as any).widgets = widgetsProxy;

    let result;
    try {
      const sanitizedSchema = schemaStr.replace(/globalThis\.widgets\./g, "widgets.");

      const fn = new Function(
        "widgets",
        `
        try {
          const w = widgets || globalThis.widgets;
          return (${sanitizedSchema});
        } catch (e) {
          throw new Error("Eval internal error: " + e.message);
        }
      `,
      );
      result = fn(widgetsProxy);

      if (previousGlobalWidgets) (globalThis as any).widgets = previousGlobalWidgets;

      if (result && typeof result === "object") {
        return result as Schema;
      }
    } catch (evalErr) {
      console.error(`[SCAN] Failed to evaluate schema at ${filePath}:`, evalErr);
    }

    if (previousGlobalWidgets) (globalThis as any).widgets = previousGlobalWidgets;
    return null;
  } catch (err) {
    console.error(`[SCAN] Error processing schema file ${filePath}:`, err);
    return null;
  }
}

/**
 * Extracts a complete object literal by tracking balanced braces.
 */
function extractObjectLiteral(content: string, start: number): string | null {
  let depth = 0;
  let firstBrace = -1;
  let inString: string | null = null;
  let isEscaped = false;

  for (let i = start; i < content.length; i++) {
    const char = content[i];

    if (inString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === "\\") {
        isEscaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }

    if (char === "{") {
      if (depth === 0) firstBrace = i;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && firstBrace !== -1) {
        return content.substring(firstBrace, i + 1);
      }
    }
  }
  return null;
}

/**
 * Scans the .compiledCollections directory for compiled schema files.
 */
export async function scanCompiledCollections(): Promise<Schema[]> {
  const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");
  const schemas: Schema[] = [];

  async function walk(dir: string) {
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

        const cached = await cacheService.get<{ mtime: number; schema: Schema }>(
          cacheKey,
          null,
          CacheCategory.SCHEMA,
        );

        if (cached && cached.mtime === stats.mtimeMs) {
          schemas.push(cached.schema);
          continue;
        }

        const content = await fs.readFile(fullPath, "utf-8");
        const schema = await safelyParseSchema(content, fullPath);

        if (schema) {
          // ✨ Preserve relative path from .compiledCollections for hierarchical grouping
          const relativePath = path.relative(collectionsDir, fullPath);
          const relativeDir = path.dirname(relativePath);

          // Generate deterministic ID based on relative path if not explicitly provided
          const autoId = relativePath.replace(/\.js$/, "").replace(/[\\/]/g, "_").toLowerCase();

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

          await cacheService.set(
            cacheKey,
            { mtime: stats.mtimeMs, schema },
            3600,
            null,
            CacheCategory.SCHEMA,
          );
          schemas.push(schema);
        }
      }
    } catch (err) {
      logger.debug("Content structure scan failed or directory missing", { err });
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
    incremental: boolean = false,
  ): Promise<void> {
    console.log(
      `[RECONCILE] fullReload triggered. Tenant: ${tenantId}, skip: ${skipReconciliation}`,
    );

    const processedPaths = new Set<string>();

    if (incremental) {
      logger.debug("Incremental content reload requested (Shim)", { tenantId });
    }
    const dbAdapter = adapter || (await (await import("@src/databases/db")).getDb());
    if (!dbAdapter) return;

    const schemas = await scanCompiledCollections();

    // Invalidate node-level caches
    await dbAdapter.monitoring?.cache?.invalidateCategory?.(CacheCategory.CONTENT, tenantId as any);

    if (skipReconciliation) {
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

    const dbResult = await dbAdapter.content.nodes.getStructure("flat", {
      tenantId: tenantId as any,
      bypassTenantCheck: true,
    });
    const dbNodes = dbResult.success ? dbResult.data : [];

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
    console.error(`[RECONCILE] Sync complete for ${tenantId}`);

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
};
