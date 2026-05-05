/**
 * @file src/routes/api/[...path]/handlers/dashboard.ts
 * @description Dashboard metrics, health, system info, and log handlers for the dispatcher.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import { metricsService } from "@src/services/observability/metrics-service";
import { auditLogService } from "@src/services/security/audit-service";
import { getSystemInfo } from "@utils/system-info.server";
import { cacheService } from "@src/databases/cache/cache-service";
import { rawResponse } from "./base";
import type { DatabaseId } from "@src/content/types";

export async function handleDashboardRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { url } = event;
  const method = segments[1] || segments[0];

  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    console.log(`[DashboardRoute] method=${method}, segments=${segments.join(",")}`);
  }

  try {
    switch (method) {
      case "dashboard": // Fallthrough if segments[0] is used
      case "stats":
      case "dashboard-stats": {
        // Mock or real stats for dashboard
        const collections = await (cms.db.crud as any).listCollections(tenantId as DatabaseId);
        const users = await cms.auth.listUsers({ tenantId: tenantId as DatabaseId, limit: 1 });
        const media = await cms.media.find({ tenantId: tenantId as DatabaseId, limit: 1 });

        return rawResponse(event, {
          contentCount: collections.success ? collections.data.length : 0,
          userCount: (users as any).success ? (users as any).data.length : 0,
          mediaCount: (media as any).success ? (media as any).data.total : 0,
          storageUsed: "0 MB",
          healthStatus: "healthy",
          uptime: process.uptime(),
        });
      }

      case "health":
        return rawResponse(event, cms.system.getHealth() || { status: "unknown" });

      case "metrics": {
        const detailed = url.searchParams.get("detailed") === "true";
        const report = metricsService.getReport(tenantId || undefined);
        if (detailed) {
          const sysInfo = await getSystemInfo().catch(() => ({}));
          return rawResponse(event, {
            ...report,
            system: {
              memory: (sysInfo as any).memory,
              uptime: (sysInfo as any).os?.uptime,
              nodeVersion: process.version,
            },
          });
        }
        return rawResponse(event, report);
      }

      case "system-info": {
        const type = url.searchParams.get("type");
        const info = await getSystemInfo().catch(() => ({}));
        const response: any = {
          osInfo: (info as any).os,
          cpuInfo: (info as any).cpu,
          memoryInfo: (info as any).memory,
          diskInfo: (info as any).disk || { root: { totalGb: 0, usedGb: 0 } },
        };

        if (type === "cpu") return rawResponse(event, { cpuInfo: response.cpuInfo });
        if (type === "memory") return rawResponse(event, { memoryInfo: response.memoryInfo });
        if (type === "os") return rawResponse(event, { osInfo: response.osInfo });
        if (type === "disk") return rawResponse(event, { diskInfo: response.diskInfo });

        return rawResponse(event, response);
      }

      case "logs": {
        const limitParam = Number(url.searchParams.get("limit"));
        if (limitParam > 100) throw new AppError("Limit exceeds maximum of 100", 400);

        const limit = Math.min(limitParam || 100, 100);
        const page = Number(url.searchParams.get("page")) || 1;
        const level = url.searchParams.get("level");
        const search = url.searchParams.get("search");

        const result = await auditLogService.queryLogs({
          limit,
          offset: (page - 1) * limit,
          severity: level as any,
          tenantId: tenantId || undefined,
        });

        if (!result.success) throw new AppError(result.message, 500);

        let logs = result.data || [];
        if (search) {
          const searchLower = search.toLowerCase();
          logs = logs.filter(
            (l) =>
              l.message?.toLowerCase().includes(searchLower) ||
              l.action.toLowerCase().includes(searchLower),
          );
        }

        return rawResponse(event, {
          logs: logs.map((l) => ({ ...l, messageHtml: l.message })),
          total: logs.length,
          page,
          hasMore: logs.length === limit,
        });
      }

      case "last5-content": {
        const limit = Number(url.searchParams.get("limit")) || 5;
        const result = await cms.db.crud.findMany("auditLogs", { action: "create" } as any, {
          limit,
          sort: { timestamp: -1 } as any,
          tenantId: tenantId as DatabaseId,
        });
        return rawResponse(event, result.success ? result.data : []);
      }

      case "last5media": {
        const result = await cms.media.find({ tenantId: tenantId as DatabaseId, limit: 5 });
        return rawResponse(event, result.success ? result.data.items : []);
      }

      case "online-user": {
        const users = await cms.auth.listUsers({ tenantId: tenantId as DatabaseId, limit: 10 });
        const onlineUsers = (users.data || [])
          .map((u) => ({
            id: u._id,
            name: u.username || u.email,
            onlineTime: new Date().toISOString(),
            onlineMinutes: Math.floor(Math.random() * 60),
          }))
          .sort((a, b) => b.onlineMinutes - a.onlineMinutes);

        return rawResponse(event, { onlineUsers });
      }

      case "system-messages": {
        const limit = Number(url.searchParams.get("limit")) || 10;
        const result = await auditLogService.queryLogs({ limit, tenantId: tenantId || undefined });
        const messages = result.success
          ? result.data.map((l) => ({
              id: l._id,
              title: l.action,
              message: l.message || l.action,
              level: l.severity,
              timestamp: l.timestamp,
              type:
                l.severity === "critical" || l.severity === "high"
                  ? "error"
                  : l.severity === "medium"
                    ? "warning"
                    : "info",
            }))
          : [];

        return rawResponse(
          event,
          messages.length
            ? messages
            : [
                {
                  id: "mock-1",
                  title: "System Healthy",
                  message: "All services are operating normally.",
                  level: "info",
                  timestamp: new Date().toISOString(),
                  type: "info",
                },
              ],
        );
      }

      case "cache-metrics": {
        const stats = (await cacheService.getStats()) || {
          hits: 0,
          misses: 0,
          sets: 0,
          deletes: 0,
          size: 0,
        };
        const total = (Number(stats.hits) || 0) + (Number(stats.misses) || 0);
        const hitRate = total > 0 ? (Number(stats.hits) / total) * 100 : 0;

        return rawResponse(event, {
          overall: {
            hits: Number(stats.hits) || 0,
            misses: Number(stats.misses) || 0,
            hitRate: Number(hitRate.toFixed(2)),
            sets: (stats as any).sets || 0,
            deletes: (stats as any).deletes || 0,
            size: stats.size || 0,
            totalOperations: total,
          },
          byCategory: (stats as any).byCategory || {},
          byTenant: (stats as any).byTenant || {},
          timestamp: Date.now(),
          recentMisses: [],
        });
      }

      default:
        throw new AppError(`Dashboard action '${method}' not implemented`, 404);
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "Dashboard operation failed", 500);
  }
}
