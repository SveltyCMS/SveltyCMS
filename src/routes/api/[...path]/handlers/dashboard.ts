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
import { parseSessionDuration } from "@utils/security/auth-utils";
import type { Session } from "@src/databases/auth/types";
import { rawResponse } from "./base";
import type { DatabaseId } from "@src/content/types";

interface DashboardQuery {
  method: string;
  detailed?: boolean;
  type?: string;
  limit?: number;
}

function normalizeDashboardLog(log: any) {
  const message =
    typeof log.message === "string" && log.message.length > 0
      ? log.message
      : [log.action, log.targetType, log.targetId].filter(Boolean).join(" ") ||
        log.eventType ||
        "Audit log entry";

  return {
    ...log,
    level: log.level || log.severity || "info",
    message,
    messageHtml: typeof log.messageHtml === "string" ? log.messageHtml : message,
  };
}

export async function handleDashboardRoutes(
  event: RequestEvent,
  cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { url } = event;
  const method = (segments[1] || segments[0] || "").toLowerCase();

  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    console.log(`[DashboardRoute] method=${method}, segments=${segments.join(",")}`);
  }

  try {
    const query: DashboardQuery = {
      method,
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
          userCount: usersRes?.success ? (usersRes.data?.pagination?.totalItems ?? 0) : 0,
          mediaCount: mediaRes.success ? (mediaRes.data?.total ?? 0) : 0,
          storageUsed: "0 MB", // Calculated on-demand via media collection
          healthStatus: "healthy",
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        });
      }

      case "tenant-analytics": {
        const [collectionsRes, usersRes, mediaCountRes] = await Promise.all([
          (cms.db.crud as any).listCollections(tenantId),
          cms.auth.listUsers({ tenantId, limit: 1 }),
          cms.db.crud.count("media", {}, { tenantId }),
        ]);

        const collections = collectionsRes.success ? collectionsRes.data || [] : [];
        const collectionCount = collections.length;
        const userCount = usersRes?.success ? (usersRes.data?.pagination?.totalItems ?? 0) : 0;
        const mediaCount = mediaCountRes.success ? (mediaCountRes.data ?? 0) : 0;

        // Sample media items to calculate total storage used
        let totalStorageBytes = 0;
        try {
          const mediaListRes = await cms.media.find({ tenantId, limit: 2000 });
          const mediaItems =
            mediaListRes.success && mediaListRes.data?.items ? mediaListRes.data.items : [];
          totalStorageBytes = mediaItems.reduce(
            (sum: number, item: any) => sum + (item.size || 0),
            0,
          );

          // If we got all items (less than limit), the sum is exact;
          // otherwise estimate by extrapolating from the sample.
          if (mediaCount > 2000 && mediaItems.length > 0) {
            const avgSize = totalStorageBytes / mediaItems.length;
            totalStorageBytes = Math.round(avgSize * mediaCount);
          }
        } catch {
          // Best-effort storage calculation
        }

        // Count content entries across all collection tables
        let contentEntryCount = 0;
        if (collections.length > 0) {
          const countResults = await Promise.allSettled(
            collections.map((col: any) => cms.db.crud.count(col._id || col.name, {}, { tenantId })),
          );
          for (const r of countResults) {
            if (r.status === "fulfilled" && r.value.success) {
              contentEntryCount += r.value.data ?? 0;
            }
          }
        }

        // Query recent audit activity (last 24h) for request count
        let recentRequestCount = 0;
        try {
          const auditResult = await auditLogService.queryLogs({
            limit: 1000,
            tenantId: tenantId || undefined,
          });
          if (auditResult.success && Array.isArray(auditResult.data)) {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            recentRequestCount = auditResult.data.filter(
              (log: any) => log.timestamp >= oneDayAgo,
            ).length;
          }
        } catch {
          // Best-effort request count
        }

        // Format storage for display
        const units = ["B", "KB", "MB", "GB", "TB"];
        const unitIdx =
          totalStorageBytes === 0
            ? 0
            : Math.min(Math.floor(Math.log(totalStorageBytes) / Math.log(1024)), units.length - 1);
        const formattedStorage =
          totalStorageBytes === 0
            ? "0 B"
            : `${(totalStorageBytes / 1024 ** unitIdx).toFixed(1)} ${units[unitIdx]}`;

        return rawResponse(event, {
          storage: {
            bytes: totalStorageBytes,
            formatted: formattedStorage,
          },
          users: {
            total: userCount,
          },
          media: {
            total: mediaCount,
          },
          collections: collectionCount,
          contentEntries: contentEntryCount,
          recentRequests: {
            last24h: recentRequestCount,
          },
          timestamp: new Date().toISOString(),
        });
      }

      case "health":
        return rawResponse(event, (await cms.system.getHealth()) || { status: "healthy" });

      case "metrics":
      case "unified": {
        // Coerce tenant key — branded DatabaseId objects break Map keys in metricsService
        const tid =
          tenantId == null || tenantId === ""
            ? null
            : typeof tenantId === "string"
              ? tenantId
              : String(tenantId);
        let report: ReturnType<typeof metricsService.getReport>;
        try {
          report = metricsService.getReport(tid);
        } catch (err) {
          console.error("[DashboardRoute] metrics getReport failed:", err);
          report = {
            timestamp: Date.now(),
            uptime: 0,
            requests: { total: 0, errors: 0, errorRate: 0, avgResponseTime: 0 },
            authentication: {
              validations: 0,
              failures: 0,
              successRate: 0,
              cacheHits: 0,
              cacheMisses: 0,
              cacheHitRate: 0,
            },
            api: {
              requests: 0,
              errors: 0,
              cacheHits: 0,
              l1Hits: 0,
              l2Hits: 0,
              cacheMisses: 0,
              cacheHitRate: 0,
            },
            performance: { slowRequests: 0, avgHookExecutionTime: 0, bottlenecks: [] },
            security: { rateLimitViolations: 0, cspViolations: 0, authFailures: 0 },
          };
        }

        if (query.detailed) {
          const sysInfo = await getSystemInfo().catch(() => ({}));
          return rawResponse(event, {
            ...report,
            system: {
              memory: {
                used: (sysInfo as any).memory?.usedBytes || 0,
                total: (sysInfo as any).memory?.totalBytes || 0,
              },
              uptime: (sysInfo as any).os?.uptime ?? process.uptime(),
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

          if (usersRes?.success && Array.isArray(usersRes.data?.data)) {
            const users = usersRes.data!.data;
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

      case "last5-content": {
        const searchResult = await cms.collections.search("", {
          tenantId,
          limit: query.limit,
          sortField: "updatedAt",
          sortDirection: "desc",
          isAdmin: true,
        });

        const mapped = (searchResult.items || []).map((item: any) => ({
          id: item._id || item.id,
          title: item.title || item.name || item.slug || "Untitled",
          collection: item._collection?.name || item._collection?.id || "unknown",
          createdAt: item.createdAt || item.updatedAt,
          createdBy: item.createdBy || item.author || item.updatedBy || "system",
          status: item.status || "published",
        }));

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
          filters: level ? { severity: level } : undefined,
          tenantId: tenantId || undefined,
        });

        if (!result.success) throw new AppError(result.message, 500);

        let logs = (result.data || []).map(normalizeDashboardLog);
        if (level) {
          const expectedLevel = level.toLowerCase();
          logs = logs.filter((l) => String(l.level || "").toLowerCase() === expectedLevel);
        }
        if (search) {
          const searchLower = search.toLowerCase();
          logs = logs.filter(
            (l) =>
              l.message?.toLowerCase().includes(searchLower) ||
              l.action.toLowerCase().includes(searchLower) ||
              String(l.eventType || "")
                .toLowerCase()
                .includes(searchLower),
          );
        }

        return rawResponse(event, {
          logs,
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
        const sessionDurationMs = parseSessionDuration("1d");
        const sessionsRes = await cms.auth.getAllActiveSessions({ tenantId });
        const sessions =
          sessionsRes.success && Array.isArray(sessionsRes.data) ? sessionsRes.data : [];

        const sessionByUser = new Map<string, Session>();
        for (const session of sessions) {
          const userId = String(session.user_id);
          const existing = sessionByUser.get(userId);
          if (!existing) {
            sessionByUser.set(userId, session);
            continue;
          }
          const existingStart = estimateSessionStartMs(existing, sessionDurationMs);
          const currentStart = estimateSessionStartMs(session, sessionDurationMs);
          if (currentStart < existingStart) {
            sessionByUser.set(userId, session);
          }
        }

        const userIds = [...sessionByUser.keys()];
        const userLookups = await Promise.all(
          userIds.map(async (userId) => {
            try {
              const userResult = await cms.auth.getUserById(userId, { tenantId });
              return userResult?.success ? userResult.data : null;
            } catch {
              return null;
            }
          }),
        );

        const onlineUsers = userIds
          .map((userId, index) => {
            const user = userLookups[index];
            const session = sessionByUser.get(userId)!;
            const sessionStart = estimateSessionStartMs(session, sessionDurationMs);
            const onlineMinutes = Math.max(0, Math.floor((Date.now() - sessionStart) / 60000));

            return {
              id: userId,
              name: user?.username || user?.email || "Unknown",
              email: user?.email || "",
              role: user?.role || "user",
              avatarUrl: user?.avatar || null,
              onlineTime: formatOnlineDuration(onlineMinutes),
              onlineMinutes,
            };
          })
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
        // Never let cache backend errors take down the process mid-integration suite
        let stats: Awaited<ReturnType<typeof cacheService.getStats>> | null = null;
        try {
          stats = await cacheService.getStats();
        } catch (err) {
          console.error("[DashboardRoute] cache-metrics getStats failed:", err);
        }

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

function estimateSessionStartMs(session: Session, sessionDurationMs: number): number {
  const expiresMs = new Date(session.expires).getTime();
  if (!Number.isNaN(expiresMs)) {
    return expiresMs - sessionDurationMs;
  }
  if (session.lastActiveAt) {
    return new Date(session.lastActiveAt).getTime();
  }
  return Date.now();
}

function formatOnlineDuration(minutes: number): string {
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}
