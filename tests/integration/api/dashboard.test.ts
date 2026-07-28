import { safeFetch } from "../helpers/server";

/**
 * @file tests/integration/api/dashboard.test.ts
 * @description Integration tests for dashboard API endpoints
 *
 * TESTED ENDPOINTS:
 * - GET /api/dashboard/health
 * - GET /api/dashboard/metrics
 * - GET /api/dashboard/system-info (alias: systemInfo)
 * - GET /api/dashboard/logs
 * - GET /api/dashboard/last5-content (alias: last5Content)
 * - GET /api/dashboard/last5media
 * - GET /api/dashboard/online-user
 * - GET /api/dashboard/system-messages
 * - GET /api/dashboard/cache-metrics
 */

import { beforeAll, describe, expect, test } from "vitest";
import { BASE_URL } from "../helpers/server";
import { prepareAuthenticatedContext } from "../helpers/test-setup";

let authCookie: string;

beforeAll(async () => {
  console.log("\n🔍 Dashboard API Integration Tests");
  console.log(`📍 Testing against: ${BASE_URL}`);

  authCookie = await prepareAuthenticatedContext();
  console.log("✅ Authentication successful\n");

  // Best-effort warmup only — never fail the whole file here.
  // Individual tests assert endpoint contracts.
  for (const path of ["/api/health", "/api/dashboard/metrics", "/api/dashboard/cache-metrics"]) {
    try {
      await safeFetch(`${BASE_URL}${path}`, { headers: { Cookie: authCookie } }, 2, 500);
    } catch (err) {
      console.warn(
        `⚠️ Warmup ${path} skipped:`,
        err instanceof Error ? err.message.slice(0, 120) : err,
      );
    }
  }
}, 120_000);

describe("System Health (via /api/health)", () => {
  // Use the public /api/health endpoint rather than /api/dashboard/health.
  // The dashboard handler delegates to this same endpoint.
  const HEALTH_URL = `${BASE_URL}/api/health`;

  test("should return system health status", async () => {
    const response = await safeFetch(HEALTH_URL);

    expect([200, 503]).toContain(response.status);
    const body = await response.json();

    // Unwrap { success, data } envelope
    const payload = body.success && body.data ? body.data : body;

    expect(payload).toHaveProperty("state");
    expect(payload).toHaveProperty("timestamp");
    expect(payload).toHaveProperty("uptime");
    expect(payload).toHaveProperty("services");

    // state should be one of the valid states
    expect([
      "READY",
      "WARMING",
      "WARMED",
      "INITIALIZING",
      "DEGRADED",
      "FAILED",
      "IDLE",
      "SETUP",
    ]).toContain(payload.state);

    // uptime should be a positive number
    expect(typeof payload.uptime).toBe("number");
    expect(payload.uptime).toBeGreaterThanOrEqual(0);
  });

  test("should return 200 for operational states", async () => {
    const response = await safeFetch(HEALTH_URL);
    await response.json();

    // The health endpoint returns 200 even during non-operational states.
    expect(response.status).toBe(200);
  });

  test("should include service health details", async () => {
    const response = await safeFetch(HEALTH_URL);
    const body = await response.json();
    const payload = body.success && body.data ? body.data : body;

    expect(typeof payload.services).toBe("object");

    const services = Object.values(payload.services);
    if (services.length > 0) {
      const svc = services[0] as Record<string, unknown>;
      expect(svc).toHaveProperty("status");
      expect(typeof svc.status).toBe("string");
    }
  });
});

describe("Dashboard API - Metrics Endpoint", () => {
  test("should return basic metrics", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/metrics`, {
      headers: { Cookie: authCookie },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `GET /api/dashboard/metrics failed (HTTP ${response.status}): ${JSON.stringify(err)}`,
      );
    }
    const data = await response.json();

    expect(data).toHaveProperty("requests");
    expect(data).toHaveProperty("authentication");
    expect(data).toHaveProperty("api");
  });

  test("should return detailed metrics when requested", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/metrics?detailed=true`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty("system");
    expect(data.system).toHaveProperty("memory");
    expect(data.system).toHaveProperty("uptime");
    expect(data.system).toHaveProperty("nodeVersion");

    expect(data.system.memory).toHaveProperty("used");
    expect(data.system.memory).toHaveProperty("total");
    expect(typeof data.system.uptime).toBe("number");
  });

  test("should have valid metric structure", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/metrics`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    expect(typeof data.requests.total).toBe("number");
    expect(typeof data.authentication.validations).toBe("number");
    expect(typeof data.api.cacheHits).toBe("number");
  });
});

describe("Dashboard API - System Info Endpoint", () => {
  test("should return all system info by default", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-info`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty("cpuInfo");
    expect(data).toHaveProperty("diskInfo");
    expect(data).toHaveProperty("memoryInfo");
    expect(data).toHaveProperty("osInfo");
  });

  test("should return only CPU info when type=cpu", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-info?type=cpu`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty("cpuInfo");
    expect(data).not.toHaveProperty("diskInfo");
    expect(data).not.toHaveProperty("memoryInfo");
  });

  test("should return only memory info when type=memory", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-info?type=memory`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty("memoryInfo");
    expect(data).not.toHaveProperty("cpuInfo");
    expect(data.memoryInfo).toHaveProperty("total");
  });

  test("should return only disk info when type=disk", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-info?type=disk`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty("diskInfo");
    expect(data.diskInfo).toHaveProperty("root");
    expect(data.diskInfo.root).toHaveProperty("totalGb");
    expect(data.diskInfo.root).toHaveProperty("usedGb");
  });

  test("should have valid CPU info structure", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-info?type=cpu`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    expect(data.cpuInfo).toHaveProperty("currentLoad");
    expect(data.cpuInfo).toHaveProperty("cores");
    expect(typeof data.cpuInfo.currentLoad).toBe("number");
    expect(typeof data.cpuInfo.cores.count).toBe("number");
  });

  test("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-info`);
    expect([401, 403]).toContain(response.status);
  });
});

describe("Dashboard API - Logs Endpoint", () => {
  test("should return paginated logs", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/logs?limit=10&page=1`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty("logs");
    expect(data).toHaveProperty("total");
    expect(data).toHaveProperty("page");
    expect(data).toHaveProperty("hasMore");
    expect(Array.isArray(data.logs)).toBe(true);
    expect(data.page).toBe(1);
  });

  test("should filter logs by level", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/logs?level=error&limit=10`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(Array.isArray(data.logs)).toBe(true);
    // All returned logs should be error level (if any)
    data.logs.forEach((log: { level: string }) => {
      expect(log.level.toLowerCase()).toBe("error");
    });
  });

  test("should support search parameter", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/logs?search=database&limit=10`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(Array.isArray(data.logs)).toBe(true);
    // If logs exist, they should contain the search term
    if (data.logs.length > 0) {
      data.logs.forEach((log: { message: string }) => {
        expect(log.message.toLowerCase()).toContain("database");
      });
    }
  });

  test("should have ANSI color support in log messages", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/logs?limit=5`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    expect(Array.isArray(data.logs)).toBe(true);
    // Each log should have both message and messageHtml
    data.logs.forEach((log: { message: string; messageHtml: string }) => {
      expect(typeof log.message).toBe("string");
      expect(typeof log.messageHtml).toBe("string");
    });
  });

  test("should validate limit parameter", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/logs?limit=200`, {
      headers: { Cookie: authCookie },
    });

    expect(response.status).toBe(400);
  });
});

describe("Dashboard API - Last 5 Content Endpoint", () => {
  test("should return recent content items", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/last5-content`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test("should have valid content item structure", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/last5-content`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    if (data.length > 0) {
      const item = data[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("title");
      expect(item).toHaveProperty("collection");
      expect(item).toHaveProperty("createdAt");
      expect(item).toHaveProperty("createdBy");
      expect(item).toHaveProperty("status");
    }
  });

  test("should respect custom limit parameter", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/last5-content?limit=3`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(3);
  });

  test("should require authentication", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/last5-content`);
    expect([401, 403]).toContain(response.status);
  });
});

describe("Dashboard API - Last 5 Media Endpoint", () => {
  test("should return recent media files", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/last5media`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(5);
  });

  test("should have valid media item structure", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/last5media`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    if (data.length > 0) {
      const item = data[0];
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("size");
      expect(item).toHaveProperty("modified");
      expect(item).toHaveProperty("type");
      expect(item).toHaveProperty("url");
      expect(typeof item.size).toBe("number");
    }
  });

  test("should return empty array when no media exists", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/last5media`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("Dashboard API - Online Users Endpoint", () => {
  test("should return online users list", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/online-user`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty("onlineUsers");
    expect(Array.isArray(data.onlineUsers)).toBe(true);
  });

  test("should have valid online user structure", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/online-user`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    if (data.onlineUsers.length > 0) {
      const user = data.onlineUsers[0];
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("name");
      expect(user).toHaveProperty("onlineTime");
      expect(user).toHaveProperty("onlineMinutes");
      expect(typeof user.onlineMinutes).toBe("number");
    }
  });

  test("should include current user in online list", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/online-user`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    // At minimum, the authenticated user should be online
    expect(data.onlineUsers.length).toBeGreaterThanOrEqual(1);
  });

  test("should sort users by online time (longest first)", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/online-user`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    if (data.onlineUsers.length > 1) {
      for (let i = 0; i < data.onlineUsers.length - 1; i++) {
        expect(data.onlineUsers[i].onlineMinutes).toBeGreaterThanOrEqual(
          data.onlineUsers[i + 1].onlineMinutes,
        );
      }
    }
  });
});

describe("Dashboard API - System Messages Endpoint", () => {
  test("should return system messages", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-messages`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
  });

  test("should have valid message structure", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-messages`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    if (data.length > 0) {
      const message = data[0];
      expect(message).toHaveProperty("id");
      expect(message).toHaveProperty("title");
      expect(message).toHaveProperty("message");
      expect(message).toHaveProperty("level");
      expect(message).toHaveProperty("timestamp");
      expect(message).toHaveProperty("type");
      expect(["error", "warning", "info"]).toContain(message.type);
    }
  });

  test("should respect limit parameter", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-messages?limit=3`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    expect(data.length).toBeLessThanOrEqual(3);
  });

  test("should return default message when no logs exist", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/system-messages`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    // Should always return at least one message (even if mock)
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Dashboard API - Cache Metrics Endpoint", () => {
  test("should return cache metrics", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
      headers: { Cookie: authCookie },
    });

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty("overall");
    expect(data).toHaveProperty("byCategory");
    expect(data).toHaveProperty("byTenant");
    expect(data).toHaveProperty("timestamp");
  });

  test("should have valid overall metrics structure", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    expect(data.overall).toHaveProperty("hits");
    expect(data.overall).toHaveProperty("misses");
    expect(data.overall).toHaveProperty("hitRate");
    expect(data.overall).toHaveProperty("totalOperations");

    expect(typeof data.overall.hits).toBe("number");
    expect(typeof data.overall.misses).toBe("number");
    expect(typeof data.overall.hitRate).toBe("number");
  });

  test("should include category breakdown", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    expect(typeof data.byCategory).toBe("object");

    // Each category should have hits, misses, hitRate
    Object.values(data.byCategory).forEach((category: unknown) => {
      const cat = category as Record<string, unknown>;
      expect(cat).toHaveProperty("hits");
      expect(cat).toHaveProperty("misses");
      expect(cat).toHaveProperty("hitRate");
    });
  });

  test("should include recent misses", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
      headers: { Cookie: authCookie },
    });

    const data = await response.json();

    expect(Array.isArray(data.recentMisses)).toBe(true);
    expect(data.recentMisses.length).toBeLessThanOrEqual(10);
  });

  test("should calculate hit rate correctly", async () => {
    const response = await safeFetch(`${BASE_URL}/api/dashboard/cache-metrics`, {
      headers: { Cookie: authCookie },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        `GET /api/dashboard/cache-metrics failed (HTTP ${response.status}): ${JSON.stringify(err)}`,
      );
    }
    const data = await response.json();

    const total = (data.overall?.hits || 0) + (data.overall?.misses || 0);
    if (total > 0) {
      const expectedHitRate = (data.overall.hits / total) * 100;
      expect(Math.abs(data.overall.hitRate - expectedHitRate)).toBeLessThan(1);
    } else {
      expect(data.overall?.hitRate || 0).toBe(0);
    }
  });
});
