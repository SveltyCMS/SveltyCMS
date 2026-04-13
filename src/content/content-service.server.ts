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
async function safelyParseSchema(content: string): Promise<Schema | null> {
  try {
    const exportMatch = content.match(/export\s+(?:const\s+schema|default)\s*[:=]\s*/);
    if (!exportMatch) return null;

    const start = exportMatch.index! + exportMatch[0].length;
    const schemaStr = extractObjectLiteral(content, start);
    if (!schemaStr) return null;

    const widgetsMap = await widgetRegistryService.getAllWidgets();
    const widgetsProxy = new Proxy(Object.fromEntries(widgetsMap), {
      get(target, prop) {
        if (typeof prop !== "string") return undefined;
        return (
          target[prop] ||
          Object.entries(target).find(([k]) => k.toLowerCase() === prop.toLowerCase())?.[1]
        );
      },
    });

    const fn = new Function("widgets", `return ${schemaStr};`);
    const result = fn(widgetsProxy);

    if (result && typeof result === "object" && Array.isArray(result.fields)) {
      return result as Schema;
    }
  } catch (err) {
    logger.error("Schema parsing failed", { error: err });
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
      const schema = await safelyParseSchema(content);

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
      contentStore.sync(schemas.map((s) => ({ ...s, nodeType: "collection" }) as any));
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

    logger.debug(`[RECONCILE] Final operation count: ${operations.length}`);
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
