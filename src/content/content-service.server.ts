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
    } catch (e: any) {
      logger.error(`[SchemaParseError] ${e.message}`, { filePath });
      throw e;
    } finally {
      (globalThis as any).widgets = previousGlobalWidgets;
    }

    if (result && typeof result === "object") {
      const schema = result as Schema;
      return {
        ...schema,
        _id: schema._id || path.basename(filePath, ".js"),
        name: schema.name || path.basename(filePath, ".js"),
      };
    }
  } catch (err) {
    logger.error("Schema parsing failed:", { error: String(err), filePath });
  }
  return null;
}

function extractObjectLiteral(content: string, startIdx: number): string | null {
  let depth = 0;
  let inString: string | null = null;
  let escape = false;

  for (let i = startIdx; i < content.length; i++) {
    const c = content[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      continue;
    }
    if (c === "{") {
      if (depth === 0) startIdx = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) return content.substring(startIdx, i + 1);
    }
  }
  return null;
}

/**
 * Scans for compiled schema files and parses them with mtime caching.
 */
export async function scanCompiledCollections(): Promise<Schema[]> {
  const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");
  try {
    const entries = await fs.readdir(collectionsDir, { withFileTypes: true });
    const schemas: Schema[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      const fullPath = path.join(collectionsDir, entry.name);
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
        schema._id ||= path.basename(entry.name, ".js");
        schema.path ||= `/collection/${schema._id}`;
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
    return schemas;
  } catch {
    return [];
  }
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
              path: s.path || `/collection/${s._id}`,
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

    generateCategoryNodesFromPaths(schemas);
    const dbMapByPath = new Map(dbNodes.map((n: ContentNode) => [n.path!, n]));

    // Build reconciled tree
    const operations: ContentNode[] = [];
    const now = dateToISODateString(new Date());

    // 1. Process Compiled Schemas (Source of Truth for Disk-based Collections)
    for (const schema of schemas) {
      const existing = dbMapByPath.get(schema.path!);
      const node: ContentNode = {
        _id: (schema._id || existing?._id) as DatabaseId,
        path: schema.path,
        name: String(schema.name),
        icon: schema.icon || "bi:file",
        nodeType: "collection",
        collectionDef: schema,
        tenantId: tenantId as any,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        order: existing?.order || 999,
        translations: schema.translations || [],
      };
      operations.push(node);
      if (schema.path) dbMapByPath.delete(schema.path); // Mark as processed
    }

    // 2. Preserve Database-only Nodes (Dynamic collections created via API/GUI)
    const dbOnlyCount = dbMapByPath.size;
    if (dbOnlyCount > 0) {
      logger.info(`[RECONCILE] Preserving ${dbOnlyCount} database-only nodes:`, [
        ...dbMapByPath.keys(),
      ]);
    }
    for (const dbNode of dbMapByPath.values()) {
      operations.push(dbNode);
    }

    console.error(`[RECONCILE] Final operation count: ${operations.length}`);
    contentStore.sync(operations);

    // Persist reconciliation state if there are changes
    if (operations.length > 0) {
      await dbAdapter.content.nodes.bulkUpdate(
        operations.map((op) => ({ path: op.path!, id: op._id, changes: op })),
        { tenantId: tenantId as any },
      );
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
    const res = await db!.content.nodes.getStructure(format as any, { tenantId: tenantId as any });
    return res.success ? res.data : [];
  },

  async reorderNodes(items: any[], tenantId?: string | null): Promise<void> {
    const db = await (await import("@src/databases/db")).getDb();
    if (tenantId) logger.debug("Reordering nodes for tenant", { tenantId });
    await db!.content.nodes.reorderStructure(items);
  },
};
