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
      const id = "redirects";
      try {
        await dbAdapter.collection.createModel({
          _id: id,
          name: id,
          slug: id,
          fields: [],
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
          fields: [],
          status: "publish",
        } as any);
        logger.info(`[RedirectManager] Provisioned ${id} collection.`);
      } catch (err) {
        logger.error(`[RedirectManager] Failed to provision ${id} collection:`, err);
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

/**
 * Syncs redirects for a tenant to the high-performance Materialized View table.
 */
async function syncToMaterializedView(tenantId: string, dbAdapter: IDBAdapter) {
  // Only applicable to SQL adapters with the redirects_mv table
  if (
    dbAdapter.type !== "sqlite" &&
    dbAdapter.type !== "postgresql" &&
    dbAdapter.type !== "mariadb"
  )
    return;

  try {
    const result = await dbAdapter.crud.findMany("redirects", {
      tenantId: tenantId as DatabaseId,
    } as any);

    if (result.success && Array.isArray(result.data)) {
      // Clear existing entries for this tenant in the MV
      await dbAdapter.crud.deleteMany("redirects_mv", { tenantId: tenantId as DatabaseId } as any);

      if (result.data.length > 0) {
        const mvEntries = result.data.map((r: any) => ({
          _id: r._id,
          tenantId: r.tenantId,
          from: r.from,
          to: r.to,
          type: r.type || 301,
          isRegex: r.isRegex ? 1 : 0,
          active: r.active !== false ? 1 : 0,
          metadata: JSON.stringify(r.data || {}),
        }));

        await dbAdapter.crud.insertMany("redirects_mv", mvEntries as any);
      }

      logger.info(
        `[RedirectManager] Synced ${result.data.length} redirects to Materialized View for tenant ${tenantId}`,
      );
    }
  } catch (err) {
    logger.error(`[RedirectManager] Materialized View sync error:`, err);
  }
}
