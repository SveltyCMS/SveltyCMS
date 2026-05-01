/**
 * @file src/plugins/redirect-manager/index.server.ts
 * @description Server-side logic for Redirect Manager.
 */

import type { DatabaseId, IDBAdapter } from "@src/databases/db-interface";
import { invalidateRedirectCache } from "@src/hooks/handle-redirects";
import { invalidateSitemapCache } from "@src/services/seo/sitemap-cache";
import type { PluginContext, PluginLifecycleHooks, PluginMigration } from "../types";
import { logger } from "@utils/logger.server";
import { getPrivateEnv } from "@src/databases/config-state";

export const migrations: PluginMigration[] = [
  {
    id: "create_redirects_collection",
    pluginId: "redirect-manager",
    version: 1,
    description: "Creates the redirects collection",
    up: async (dbAdapter: IDBAdapter) => {
      const table = "redirects";
      try {
        const count = await dbAdapter.crud.count(table, undefined, {
          bypassTenantCheck: true,
        });
        if (count.success) return;
      } catch {}

      logger.info(`[RedirectManager] Creating ${table} collection...`);
      await dbAdapter.crud.insert(
        table,
        {
          from: "__INIT__",
          to: "__INIT__",
          tenantId: "system",
          active: false,
        } as any,
        { bypassTenantCheck: true },
      );
      await dbAdapter.crud.deleteMany(table, { from: "__INIT__" } as any, {
        bypassTenantCheck: true,
      });
    },
  },
  {
    id: "create_404_logs_collection",
    pluginId: "redirect-manager",
    version: 2,
    description: "Creates the 404 logs collection",
    up: async (dbAdapter: IDBAdapter) => {
      const table = "404_logs";
      try {
        const count = await dbAdapter.crud.count(table, undefined, {
          bypassTenantCheck: true,
        });
        if (count.success) return;
      } catch {}

      logger.info(`[RedirectManager] Creating ${table} collection...`);
      await dbAdapter.crud.insert(
        table,
        {
          path: "__INIT__",
          tenantId: "system",
          hits: 0,
        } as any,
        { bypassTenantCheck: true },
      );
      await dbAdapter.crud.deleteMany(table, { path: "__INIT__" } as any, {
        bypassTenantCheck: true,
      });
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
          from: oldPath,
          to: newPath,
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
    }
  },

  afterDelete: async (context: PluginContext, collection: string, _id: string) => {
    if (collection === "redirects") {
      invalidateRedirectCache(context.tenantId);
      invalidateSitemapCache(context.tenantId);
      await syncToEdgeKV(context.tenantId);
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
        from: r.from,
        to: r.to,
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
