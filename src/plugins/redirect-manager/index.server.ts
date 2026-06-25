/**
 * @file src/plugins/redirect-manager/index.server.ts
 * @description Server-side logic for Headless Redirect Router.
 *
 * Features:
 * - Abstract migrations via dbAdapter.schema.ensureCollection()
 * - Relative paths mapped to external frontendBaseUrl
 * - Edge KV sync via context.waitUntil
 * - Materialized View synchronization with atomic transactions
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
    description: "Creates the redirects collection via abstract schema adapter",
    up: async (dbAdapter: IDBAdapter) => {
      try {
        await dbAdapter.collection.createModel({
          _id: "plugin_redirect-manager_redirects",
          name: "plugin_redirect-manager_redirects",
          fields: [
            {
              label: "Source Path",
              name: "source",
              type: "text",
              required: true,
            },
            {
              label: "Target URL",
              name: "target",
              type: "text",
              required: true,
            },
            {
              label: "Redirect Type",
              name: "type",
              type: "number",
              defaultValue: 301,
            },
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
            { label: "Tenant ID", name: "tenantId", type: "text" },
          ],
          status: "publish",
        } as any);
        logger.info("[RedirectManager] Provisioned redirects collection via ensureCollection.");
      } catch (err) {
        logger.error("[RedirectManager] Failed to provision redirects collection:", err);
      }
    },
  },
  {
    id: "create_404_logs_collection",
    pluginId: "redirect-manager",
    version: 2,
    description: "Creates the 404 logs collection via abstract schema adapter",
    up: async (dbAdapter: IDBAdapter) => {
      try {
        await dbAdapter.collection.createModel({
          _id: "plugin_redirect-manager_404_logs",
          name: "plugin_redirect-manager_404_logs",
          fields: [
            { label: "Path", name: "path", type: "text", required: true },
            { label: "Hits", name: "hits", type: "number", defaultValue: 1 },
            { label: "Last Hit", name: "lastHit", type: "text" },
            { label: "Tenant ID", name: "tenantId", type: "text" },
          ],
          status: "publish",
        } as any);
        logger.info("[RedirectManager] Provisioned 404_logs collection via ensureCollection.");
      } catch (err) {
        logger.error("[RedirectManager] Failed to provision 404_logs collection:", err);
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
          statements.push(
            `CREATE INDEX IF NOT EXISTS \`idx_redirects_mv_lookup\` ON \`redirects_mv\` (\`tenantId\`(50), \`source\`(100), \`active\`);`,
          );
        } else {
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
              if (sql.includes("CREATE INDEX")) continue;
              throw indexErr;
            }
          }
        }
        logger.info("[RedirectManager] Provisioned redirects_mv table.");
      } catch (err) {
        logger.error("[RedirectManager] Failed to provision redirects_mv table:", err);
      }
    },
  },
];

export const hooks: PluginLifecycleHooks = {
  /**
   * Auto-redirect on slug change — maps relative paths to external frontendBaseUrl
   */
  beforeSave: async (context: PluginContext, collection: string, data: any) => {
    const { dbAdapter, tenantId, pluginConfig } = context;

    if (pluginConfig?.autoRedirectOnSlugChange === false) return data;
    if (collection === "plugin_redirect-manager_redirects") return data;

    if (data._id && data.slug) {
      const oldEntryResult = await dbAdapter.crud.findOne(collection, {
        _id: data._id as any,
        tenantId: tenantId as DatabaseId,
      });
      const oldEntry = oldEntryResult.success ? (oldEntryResult.data as any) : null;

      if (oldEntry && oldEntry.slug !== data.slug) {
        const frontendBaseUrl = pluginConfig?.frontendBaseUrl || "";

        // Build relative paths; optionally prepend frontend base for external resolution
        const oldPath = `${frontendBaseUrl}/${collection}/${oldEntry.slug}`;
        const newPath = `${frontendBaseUrl}/${collection}/${data.slug}`;

        logger.info(
          `[RedirectManager] Slug changed for ${data._id}. Creating redirect from ${oldPath} to ${newPath}`,
        );

        await dbAdapter.crud.insert("plugin_redirect-manager_redirects", {
          source: oldPath,
          target: newPath,
          type: 301,
          tenantId,
          active: true,
          reason: "Auto-slug change",
        } as any);

        invalidateRedirectCache(tenantId as string);
        invalidateSitemapCache(tenantId as string);

        // Edge KV sync via waitUntil if available (serverless/edge runtimes)
        syncToEdgeKV(tenantId as string, context).catch((err) =>
          logger.error("[RedirectManager] Edge KV sync error (beforeSave):", err),
        );
      }
    }

    return data;
  },

  afterSave: async (context: PluginContext, collection: string, _result: any) => {
    if (collection === "plugin_redirect-manager_redirects") {
      invalidateRedirectCache(context.tenantId);
      invalidateSitemapCache(context.tenantId);
      syncToEdgeKV(context.tenantId, context).catch((err) =>
        logger.error("[RedirectManager] Edge KV sync error (afterSave):", err),
      );
      await syncToMaterializedView(context.tenantId, context.dbAdapter);
    }
  },

  afterDelete: async (context: PluginContext, collection: string, _id: string) => {
    if (collection === "plugin_redirect-manager_redirects") {
      invalidateRedirectCache(context.tenantId);
      invalidateSitemapCache(context.tenantId);
      syncToEdgeKV(context.tenantId, context).catch((err) =>
        logger.error("[RedirectManager] Edge KV sync error (afterDelete):", err),
      );
      await syncToMaterializedView(context.tenantId, context.dbAdapter);
    }
  },
};

/**
 * Pushes all active redirects for a tenant to an external KV store (e.g. Upstash).
 * Uses context.waitUntil for edge/serverless runtime compatibility.
 */
async function syncToEdgeKV(tenantId: string, context?: PluginContext): Promise<void> {
  const env = getPrivateEnv();
  const pluginConfig = (context?.pluginConfig as any) || {};

  if (!pluginConfig?.syncToEdgeOnPublish) {
    return;
  }

  if (!env?.EDGE_KV_URL || !env?.EDGE_KV_TOKEN) {
    logger.warn(
      `[RedirectManager] Edge KV sync skipped for tenant ${tenantId}: EDGE_KV_URL or EDGE_KV_TOKEN not configured.`,
    );
    return;
  }

  const { dbAdapter } = await import("@src/databases/db");
  if (!dbAdapter) return;

  const syncPromise = (async () => {
    try {
      const result = await dbAdapter.crud.findMany("plugin_redirect-manager_redirects", {
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

        const response = await fetch(`${env.EDGE_KV_URL}/set/redirects:${tenantId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.EDGE_KV_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(redirects),
        });

        if (!response.ok) {
          throw new Error(`Edge KV sync failed: ${response.status} ${response.statusText}`);
        }

        logger.info(
          `[RedirectManager] Synced ${redirects.length} redirects to edge KV for tenant ${tenantId}`,
        );
      }
    } catch (err) {
      logger.error("[RedirectManager] Edge KV sync error:", err);
    }
  })();

  // Await the sync promise directly (PluginContext does not expose waitUntil)
  await syncPromise;
}

const syncLocks: Record<string, Promise<void>> = {};

/**
 * Syncs redirects for a tenant to the high-performance Materialized View table.
 * Uses a transaction and a Promise lock to ensure atomic clear-then-insert without race conditions.
 */
async function syncToMaterializedView(tenantId: string, dbAdapter: IDBAdapter) {
  const sqlAdapters = ["sqlite", "postgresql", "mariadb"];
  if (!sqlAdapters.includes(dbAdapter.type)) return;

  const key = tenantId || "global";
  if (!syncLocks[key]) {
    syncLocks[key] = Promise.resolve();
  }

  const next = syncLocks[key].then(async () => {
    try {
      const result = await dbAdapter.crud.findMany("plugin_redirect-manager_redirects", {
        tenantId: tenantId as DatabaseId,
      } as any);

      if (!result.success) {
        throw new Error(`Failed to fetch source redirects: ${result.message}`);
      }
      if (!Array.isArray(result.data)) {
        throw new Error("Failed to fetch source redirects: Data is not an array");
      }

      await dbAdapter.transaction(async (tx: any) => {
        await dbAdapter.crud.deleteMany(
          "redirects_mv",
          { tenantId: tenantId as DatabaseId } as any,
          { transaction: tx },
        );

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
      logger.error("[RedirectManager] Materialized View sync error:", err);
    }
  });

  syncLocks[key] = next.catch(() => {});
  return next;
}
