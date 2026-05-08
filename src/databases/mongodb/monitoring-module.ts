/**
 * @file src/databases/mongodb/modules/monitoring-module.ts
 * @description Monitoring module for MongoDB.
 */

import { DatabaseModule } from "../base-adapter";
import type { IMonitoringAdapter } from "../db-interface";
import type { MongoAdapterCore } from "./adapter-core";
import { cacheService } from "@src/databases/cache/cache-service";

export class MongoMonitoringModule
  extends DatabaseModule<MongoAdapterCore>
  implements IMonitoringAdapter
{
  cache = {
    get: <T>(key: string) =>
      cacheService.get<T>(key).then((data) => ({ success: true as const, data: data ?? null })),
    set: <T>(key: string, value: T, options?: any) =>
      cacheService
        .set(key, value, options?.ttl, undefined, options?.category, options?.tags)
        .then(() => ({ success: true as const, data: undefined as any })),
    delete: (key: string) =>
      cacheService.delete(key).then(() => ({ success: true as const, data: undefined })),
    clear: (tags?: string[]) =>
      (tags ? cacheService.clearByTags(tags) : cacheService.invalidateAll()).then(() => ({
        success: true as const,
        data: undefined,
      })),
    invalidateCollection: (collection: string, tenantId?: any) =>
      cacheService
        .invalidateCollection(collection, tenantId)
        .then(() => ({ success: true as const, data: undefined })),
    invalidateCategory: (category: string, tenantId?: any) =>
      cacheService
        .invalidateByCategory(category as any, tenantId)
        .then(() => ({ success: true as const, data: undefined })),
    getVersion: (tenantId?: any) =>
      cacheService.getGlobalVersion(tenantId).then((v) => ({ success: true as const, data: v })),
    incrementVersion: (tenantId?: any) =>
      cacheService
        .incrementGlobalVersion(tenantId)
        .then((v) => ({ success: true as const, data: v })),
  };

  performance = {
    getMetrics: async () => {
      const stats: any =
        (await (this.adapter.connection?.db as any)?.admin()?.serverStatus()) || {};
      return {
        success: true as const,
        data: {
          averageQueryTime: stats.opLatencies?.reads?.latency || 0,
          cacheHitRate: 0, // Calculated elsewhere
          connectionPoolUsage: stats.connections?.current || 0,
          queryCount: stats.opcounters?.query || 0,
          slowQueries: [],
        },
      };
    },
    clearMetrics: () => Promise.resolve({ success: true as const, data: undefined }),
    enableProfiling: (_enabled: boolean) =>
      Promise.resolve({ success: true as const, data: undefined }),
    getSlowQueries: (_limit?: number) => Promise.resolve({ success: true as const, data: [] }),
  };
}
