/**
 * @file src/routes/api/[...path]/handlers/dashboard.ts
 * @description Unified dashboard API handler for metrics, system info, and content insights.
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

interface DashboardQuery {
  method: string;
  detailed?: boolean;
  type?: string;
  limit?: number;
}

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
    const query: DashboardQuery = {
      method: method.toLowerCase(),
      detailed: url.searchParams.get("detailed") === "true",
      type: url.searchParams.get("type") || undefined,
      limit: Math.min(Number(url.searchParams.get("limit")) || 5, 50),
    };

    switch (query.method) {
      case "stats":
      case "dashboard":
      case "dashboard-stats": {
        const [collectionsRes, usersRes, mediaRes] = await Promise.all([
          (cms.db.crud as any).listCollections(tenantId),
          cms.auth.listUsers({ tenantId, limit: 1 }),
          cms.media.find({ tenantId, limit: 1 }),
        ]);

        return rawResponse(event, {
          contentCount: collectionsRes.success ? collectionsRes.data.length : 0,
          userCount: usersRes && usersRes.pagination ? (usersRes.pagination.totalItems ?? 0) : 0,
          mediaCount: mediaRes.success ? (mediaRes.data?.total ?? 0) : 0,
          storageUsed: "0 MB", // TODO: Implement real storage calculation
          healthStatus: "healthy",
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        });
      }

      case "health":
        return rawResponse(event, (await cms.system.getHealth()) || { status: "healthy" });

      case "metrics":
      case "unified": {
        const report = metricsService.getReport(tenantId);

        if (query.detailed) {
          const sysInfo = await getSystemInfo().catch(() => ({}));
          return rawResponse(event, {
            ...report,
            system: {
              memory: {
                used: (sysInfo as any).memory?.usedBytes || 0,
                total: (sysInfo as any).memory?.totalBytes || 0,
              },
              uptime: (sysInfo as any).os?.uptime,
              nodeVersion: process.version,
            },
          });
        }

        return rawResponse(event, report);
      }

      case "system-info": {
        const info = (await getSystemInfo().catch(() => ({}))) as any;

        const response = {
          osInfo: info.os,
          cpuInfo: info.cpu,
          memoryInfo: info.memory,
          diskInfo: info.disk || { root: { totalGb: 0, usedGb: 0, freeGb: 0 } },
        };

        switch (query.type) {
          case "cpu":
            return rawResponse(event, { cpuInfo: response.cpuInfo });
          case "memory":
            return rawResponse(event, { memoryInfo: response.memoryInfo });
          case "disk":
            return rawResponse(event, { diskInfo: response.diskInfo });
          case "os":
            return rawResponse(event, { osInfo: response.osInfo });
          default:
            return rawResponse(event, response);
        }
      }

      case "scim": {
        let activeUsers = 0;
        let syncedToday = 0;
        let lastSync = "Never";
        let provider = "Okta";
        let endpointsHealthy = true;

        try {
          const usersRes = await cms.auth.listUsers({
            tenantId,
            limit: 100,
          });

          if (usersRes && Array.isArray(usersRes.data)) {
            const users = usersRes.data;
            activeUsers = users.length;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            syncedToday = users.filter((u) => u.createdAt && new Date(u.createdAt) >= today).length;

            const sortedUsers = [...users].sort(
              (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
            );
            const lastUser = sortedUsers[0];
            if (lastUser && lastUser.createdAt) {
              lastSync = getRelativeTime(lastUser.createdAt);
            }

            const firstScimUser = users.find((u) => (u as any).externalId);
            if (firstScimUser) {
              provider = firstScimUser.email?.includes("okta") ? "Okta" : "Azure AD";
            }
          }
        } catch {
          endpointsHealthy = false;
        }

        return rawResponse(event, {
          status: endpointsHealthy ? "healthy" : "degraded",
          activeUsers,
          syncedToday,
          lastSync,
          provider,
          endpointsHealthy,
          lastError: null,
        });
      }

      case "last5-content":
      case "last5content": {
        const result = await cms.db.crud.findMany("auditLogs", { action: "create" } as any, {
          limit: query.limit,
          sort: { timestamp: -1 } as any,
          tenantId,
        });

        const mapped = result.success
          ? (result.data || []).map((l: any) => ({
              id: l._id,
              title: l.message || l.action,
              collection: l.collection || "System",
              createdAt: l.timestamp,
              createdBy: l.userEmail || l.createdBy || "system",
              status: l.status || "published",
            }))
          : [];

        return rawResponse(event, mapped);
      }

      case "last5media": {
        const result = await cms.media.find({
          tenantId,
          limit: query.limit,
        });
        return rawResponse(event, result.success ? result.data.items || [] : []);
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

      case "audit": {
        const auditLimit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
        const result = await auditLogService.queryLogs({
          limit: auditLimit,
          tenantId: tenantId || undefined,
        });

        if (!result.success) throw new AppError(result.message, 500);

        return rawResponse(event, result.data || []);
      }

      case "online-users":
      case "online-user": {
        const usersRes = await cms.auth.listUsers({ tenantId, limit: 10 });
        const users = usersRes && Array.isArray(usersRes.data) ? usersRes.data : [];

        const onlineUsers = users
          .map((u) => ({
            id: u._id,
            name: u.username || u.email || "Unknown",
            email: u.email || "",
            role: u.role || "user",
            avatarUrl: u.avatar || null,
            onlineTime: new Date().toISOString(),
            onlineMinutes: Math.floor(Math.random() * 60),
          }))
          .sort((a, b) => b.onlineMinutes - a.onlineMinutes);

        return rawResponse(event, { onlineUsers });
      }

      case "system-messages": {
        const limit = Number(url.searchParams.get("limit")) || 10;
        const result = await auditLogService.queryLogs({
          limit,
          tenantId: tenantId || undefined,
        });
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
        const stats = await cacheService.getStats();

        const total = (Number(stats?.hits) || 0) + (Number(stats?.misses) || 0);
        const hitRate = total > 0 ? ((Number(stats?.hits) || 0) / total) * 100 : 0;

        return rawResponse(event, {
          overall: {
            hits: Number(stats?.hits) || 0,
            misses: Number(stats?.misses) || 0,
            hitRate: Number(hitRate.toFixed(2)),
            sets: (stats as any)?.sets || 0,
            deletes: (stats as any)?.deletes || 0,
            size: stats?.size || 0,
            totalOperations: total,
          },
          byCategory: (stats as any)?.byCategory || {},
          byTenant: (stats as any)?.byTenant || {},
          timestamp: Date.now(),
          recentMisses: [],
        });
      }

      case "security": {
        const { securityResponseService } = await import("@src/services/security/response-service");
        const [statsRes, activeIncidents] = await Promise.all([
          securityResponseService.getSecurityStats(tenantId || undefined),
          securityResponseService.getActiveIncidents(tenantId || undefined),
        ]);

        const report = metricsService.getReport(tenantId as string);

        const blockedIPs = await getBlockedIpsCount(tenantId || null);
        const throttledIPs = await getThrottledIpsCount(tenantId || null);

        return rawResponse(event, {
          stats: {
            activeIncidents: statsRes.activeIncidents,
            blockedIPs,
            throttledIPs,
            cspViolations: report.security.cspViolations,
            rateLimitHits: report.security.rateLimitViolations,
            totalIncidents: statsRes.totalIncidentsLast24h,
            threatLevelDistribution: statsRes.threatDistribution,
          },
          incidents: activeIncidents.map((inc: any) => ({
            id: inc.id,
            clientIp: inc.clientIp,
            threatLevel: inc.threatLevel,
            timestamp: inc.timestamp,
            indicatorCount: inc.indicators?.length || 0,
            responseActions: inc.responseActions || [],
          })),
        });
      }

      default:
        throw new AppError(`Dashboard action '${query.method}' not implemented`, 404);
    }
  } catch (err: any) {
    console.error(`[DashboardRoute Error] ${segments.join("/")}:`, err);
    if (err instanceof AppError) throw err;
    throw new AppError(err.message || "Dashboard operation failed", 500);
  }
}

/** Helper: Retrieve blocked IP count from cache/L1 */
async function getBlockedIpsCount(_tenantId: string | null): Promise<number> {
  const redis = cacheService.getRedisClient();
  if (redis && redis.isOpen) {
    try {
      const keys = await redis.keys("svelty:sec:block:*");
      return keys.length;
    } catch {
      return 0;
    }
  }
  try {
    const l1 = (cacheService as any).l1;
    if (l1) {
      const keys = Array.from(l1.keys() as Iterable<string>);
      return keys.filter((k) => k.includes("svelty:sec:block:")).length;
    }
  } catch {}
  return 0;
}

/** Helper: Retrieve throttled IP count from cache/L1 */
async function getThrottledIpsCount(_tenantId: string | null): Promise<number> {
  const redis = cacheService.getRedisClient();
  if (redis && redis.isOpen) {
    try {
      const keys = await redis.keys("svelty:sec:throttle:*");
      return keys.length;
    } catch {
      return 0;
    }
  }
  try {
    const l1 = (cacheService as any).l1;
    if (l1) {
      const keys = Array.from(l1.keys() as Iterable<string>);
      return keys.filter((k) => k.includes("svelty:sec:throttle:")).length;
    }
  } catch {}
  return 0;
}

/** Helper: Relative time formatter */
function getRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}
