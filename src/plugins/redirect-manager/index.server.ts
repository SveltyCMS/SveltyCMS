/**
 * @file src/plugins/redirect-manager/index.server.ts
 * @description Server-side logic for Redirect Manager.
 */

import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import { invalidateRedirectCache } from "@src/hooks/handle-redirects";
import { invalidateSitemapCache } from "@src/services/content/seo/sitemap-cache";
import type { PluginContext, PluginLifecycleHooks, PluginMigration } from "../types";
import { logger } from "@utils/logger";
import { getPrivateEnv } from "@src/databases/config-state";

export const migrations: PluginMigration[] = [
  {
    id: "create_redirects_collection",
    pluginId: "redirect-manager",
    version: 1,
    description: "Creates the redirects collection",
    up: async (dbAdapter: IDBAdapter) => {
      const id = "redirects";
      try {
        await dbAdapter.collection.createModel({
          _id: id,
          name: id,
          slug: id,
          fields: [
            { label: "From", name: "source", type: "text", required: true },
            { label: "To", name: "target", type: "text", required: true },
            { label: "Type", name: "type", type: "number", defaultValue: 301 },
            {
              label: "Active",
              name: "active",
              type: "boolean",
              defaultValue: true,
            },
            {
              label: "Is Regex",
              name: "isRegex",
              type: "boolean",
              defaultValue: false,
            },
          ],
          status: "publish",
        } as any);
        logger.info(`[RedirectManager] Provisioned ${id} collection.`);
      } catch (err) {
        logger.error(`[RedirectManager] Failed to provision ${id} collection:`, err);
      }
    },
  },
  {
    id: "create_404_logs_collection",
    pluginId: "redirect-manager",
    version: 2,
    description: "Creates the 404 logs collection",
    up: async (dbAdapter: IDBAdapter) => {
      const id = "404_logs";
      try {
        await dbAdapter.collection.createModel({
          _id: id,
          name: id,
          slug: id,
          fields: [
            { label: "Path", name: "path", type: "text", required: true },
            { label: "Hits", name: "hits", type: "number", defaultValue: 1 },
            { label: "Last Hit", name: "lastHit", type: "text" },
            { label: "Tenant ID", name: "tenantId", type: "text" },
          ],
          status: "publish",
        } as any);
        logger.info(`[RedirectManager] Provisioned ${id} collection.`);
      } catch (err) {
        logger.error(`[RedirectManager] Failed to provision ${id} collection:`, err);
      }
    },
  },
  {
    id: "create_redirects_mv_table",
    pluginId: "redirect-manager",
    version: 3,
    description: "Creates the redirects_mv materialized view table for SQL adapters",
    up: async (dbAdapter: IDBAdapter) => {
      if (dbAdapter.type === "mongodb") return;

      try {
        // We use raw SQL to create the high-performance MV table
        const statements: string[] = [];
        if (dbAdapter.type === "sqlite") {
          statements.push(`
            CREATE TABLE IF NOT EXISTS "redirects_mv" (
              "_id" TEXT PRIMARY KEY,
              "tenantId" TEXT NOT NULL,
              "source" TEXT NOT NULL,
              "target" TEXT NOT NULL,
              "type" INTEGER DEFAULT 301,
              "isRegex" INTEGER DEFAULT 0,
              "active" INTEGER DEFAULT 1,
              "metadata" TEXT DEFAULT '{}',
              "updatedAt" INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            );
          `);
          statements.push(
            `CREATE INDEX IF NOT EXISTS "idx_redirects_mv_lookup" ON "redirects_mv" ("tenantId", "source", "active");`,
          );
        } else if (dbAdapter.type === "mariadb" || dbAdapter.type === "mysql") {
          statements.push(`
            CREATE TABLE IF NOT EXISTS \`redirects_mv\` (
              \`_id\` VARCHAR(255) PRIMARY KEY,
              \`tenantId\` VARCHAR(255) NOT NULL,
              \`source\` TEXT NOT NULL,
              \`target\` TEXT NOT NULL,
              \`type\` INTEGER DEFAULT 301,
              \`isRegex\` TINYINT DEFAULT 0,
              \`active\` TINYINT DEFAULT 1,
              \`metadata\` JSON,
              \`updatedAt\` BIGINT DEFAULT (UNIX_TIMESTAMP() * 1000)
            );
          `);
          // MariaDB 10.5+ supports IF NOT EXISTS for indexes. For older ones, we'd need a different approach.
          // We'll wrap in try-catch at execution time.
          statements.push(
            `CREATE INDEX IF NOT EXISTS \`idx_redirects_mv_lookup\` ON \`redirects_mv\` (\`tenantId\`(50), \`source\`(100), \`active\`);`,
          );
        } else {
          // PostgreSQL
          statements.push(`
            CREATE TABLE IF NOT EXISTS "redirects_mv" (
              "_id" TEXT PRIMARY KEY,
              "tenantId" TEXT NOT NULL,
              "source" TEXT NOT NULL,
              "target" TEXT NOT NULL,
              "type" INTEGER DEFAULT 301,
              "isRegex" INTEGER DEFAULT 0,
              "active" INTEGER DEFAULT 1,
              "metadata" JSONB DEFAULT '{}',
              "updatedAt" BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
            );
          `);
          statements.push(
            `CREATE INDEX IF NOT EXISTS "idx_redirects_mv_lookup" ON "redirects_mv" ("tenantId", "source", "active");`,
          );
        }

        const client = (dbAdapter as any).getClient?.();
        if (client) {
          for (const sql of statements) {
            try {
              if (typeof client.exec === "function") {
                client.exec(sql);
              } else if (typeof client.query === "function") {
                await client.query(sql);
              }
            } catch (indexErr) {
              // Ignore "Index already exists" errors
              if (sql.includes("CREATE INDEX")) continue;
              throw indexErr;
            }
          }
        }
        logger.info(`[RedirectManager] Provisioned redirects_mv table.`);
      } catch (err) {
        logger.error(`[RedirectManager] Failed to provision redirects_mv table:`, err);
      }
    },
  },
];

export const hooks: PluginLifecycleHooks = {
  /**
   * Auto-redirect on slug change
   */
  beforeSave: async (context: PluginContext, collection: string, data: any) => {
    const { dbAdapter, tenantId, pluginConfig } = context;

    // Respect configuration
    if (pluginConfig?.autoRedirectOnSlugChange === false) return data;

    // Skip if it's the redirects collection itself to avoid recursion
    if (collection === "redirects") return data;

    // Logic: Check if slug exists and has changed
    // Requires fetching the old entry
    if (data._id && data.slug) {
      const oldEntryResult = await dbAdapter.crud.findOne(collection, {
        _id: data._id as any,
        tenantId: tenantId as DatabaseId,
      });
      const oldEntry = oldEntryResult.success ? (oldEntryResult.data as any) : null;
      if (oldEntry && oldEntry.slug !== data.slug) {
        const oldPath = `/${collection}/${oldEntry.slug}`;
        const newPath = `/${collection}/${data.slug}`;

        logger.info(
          `[RedirectManager] Slug changed for ${data._id}. Creating redirect from ${oldPath} to ${newPath}`,
        );

        await dbAdapter.crud.insert("redirects", {
          source: oldPath,
          target: newPath,
          type: 301,
          tenantId,
          active: true,
          reason: "Auto-slug change",
        } as any);

        invalidateRedirectCache(tenantId as string);
        invalidateSitemapCache(tenantId as string);
        await syncToEdgeKV(tenantId as string);
      }
    }

    return data;
  },

  afterSave: async (context: PluginContext, collection: string, _result: any) => {
    if (collection === "redirects") {
      invalidateRedirectCache(context.tenantId);
      invalidateSitemapCache(context.tenantId);
      await syncToEdgeKV(context.tenantId);
      await syncToMaterializedView(context.tenantId, context.dbAdapter);
    }
  },

  afterDelete: async (context: PluginContext, collection: string, _id: string) => {
    if (collection === "redirects") {
      invalidateRedirectCache(context.tenantId);
      invalidateSitemapCache(context.tenantId);
      await syncToEdgeKV(context.tenantId);
      await syncToMaterializedView(context.tenantId, context.dbAdapter);
    }
  },
};

/**
 * Pushes all active redirects for a tenant to an external KV store (e.g. Upstash)
 */
async function syncToEdgeKV(tenantId: string) {
  const env = getPrivateEnv();
  if (!env?.EDGE_KV_URL || !env?.EDGE_KV_TOKEN) {
    logger.warn(
      `[RedirectManager] Edge KV sync skipped for tenant ${tenantId}: EDGE_KV_URL or EDGE_KV_TOKEN not configured.`,
    );
    return;
  }

  const { dbAdapter } = await import("@src/databases/db");
  if (!dbAdapter) return;

  try {
    const result = await dbAdapter.crud.findMany("redirects", {
      tenantId: tenantId as DatabaseId,
      active: true,
    } as any);

    if (result.success && Array.isArray(result.data)) {
      const redirects = result.data.map((r: any) => ({
        from: r.source || r.from,
        to: r.target || r.to,
        type: r.type,
        isRegex: r.isRegex,
      }));

      // Push to Upstash REST API
      const response = await fetch(`${env.EDGE_KV_URL}/set/redirects:${tenantId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.EDGE_KV_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(redirects),
      });

      if (!response.ok) {
        throw new Error(`Edge KV sync failed: ${response.statusText}`);
      }

      logger.info(
        `[RedirectManager] Synced ${redirects.length} redirects to edge KV for tenant ${tenantId}`,
      );
    }
  } catch (err) {
    logger.error(`[RedirectManager] Edge KV sync error:`, err);
  }
}

const syncLocks: Record<string, Promise<void>> = {};

/**
 * Syncs redirects for a tenant to the high-performance Materialized View table.
 * 🚀  Uses a transaction and a Promise lock to ensure atomic clear-then-insert without race conditions.
 */
async function syncToMaterializedView(tenantId: string, dbAdapter: IDBAdapter) {
  // Only applicable to SQL adapters with the redirects_mv table
  const sqlAdapters = ["sqlite", "postgresql", "mariadb"];
  if (!sqlAdapters.includes(dbAdapter.type)) return;

  const key = tenantId || "global";
  if (!syncLocks[key]) {
    syncLocks[key] = Promise.resolve();
  }

  const next = syncLocks[key].then(async () => {
    try {
      const result = await dbAdapter.crud.findMany("redirects", {
        tenantId: tenantId as DatabaseId,
      } as any);

      if (!result.success) {
        throw new Error(`Failed to fetch source redirects: ${result.message}`);
      }
      if (!Array.isArray(result.data)) {
        throw new Error(`Failed to fetch source redirects: Data is not an array`);
      }

      // Atomic update via transaction
      await dbAdapter.transaction(async (tx: any) => {
        // 1. Clear existing entries for this tenant in the MV
        await dbAdapter.crud.deleteMany(
          "redirects_mv",
          { tenantId: tenantId as DatabaseId } as any,
          {
            transaction: tx,
          },
        );

        // 2. Batch insert new entries if any
        if (result.data.length > 0) {
          const mvEntries = result.data.map((r: any) => ({
            _id: r._id,
            tenantId: r.tenantId,
            source: r.source || r.from,
            target: r.target || r.to,
            type: r.type || 301,
            isRegex: r.isRegex ? 1 : 0,
            active: r.active !== false ? 1 : 0,
            metadata: JSON.stringify(r.data || {}),
          }));

          // Use the new relational core's insertMany if available, or fallback to sequential
          if (dbAdapter.crud.insertMany) {
            await dbAdapter.crud.insertMany("redirects_mv", mvEntries as any, {
              transaction: tx,
            });
          } else {
            for (const entry of mvEntries) {
              await dbAdapter.crud.insert("redirects_mv", entry as any, {
                transaction: tx,
              });
            }
          }
        }
        return { success: true, data: undefined };
      });

      logger.info(
        `[RedirectManager] Atomically synced ${result.data.length} redirects to MV for tenant ${tenantId}`,
      );
    } catch (err) {
      logger.error(`[RedirectManager] Materialized View sync error:`, err);
    }
  });

  syncLocks[key] = next.catch(() => {});
  return next;
}
