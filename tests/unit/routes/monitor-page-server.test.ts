/**
 * @file tests/unit/routes/monitor-page-server.test.ts
 * @description Admin gate for enterprise monitor load (resilient partial failures).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn((locals: any) => {
    if (!locals?.user) {
      const err = new Error("redirect") as Error & { status: number };
      err.status = 302;
      throw err;
    }
    return locals.user;
  }),
}));

// Fail all optional services — load must still succeed for admin
vi.mock("@src/services/security/response-service", () => ({
  securityResponseService: {
    getSecurityStats: vi.fn().mockRejectedValue(new Error("unavailable")),
  },
}));

vi.mock("@src/services/background/webhook-service", () => ({
  webhookService: {
    getWebhooks: vi.fn().mockRejectedValue(new Error("unavailable")),
  },
}));

vi.mock("@src/services/observability/metrics-service", () => ({
  metricsService: {
    getSystemMetrics: vi.fn().mockRejectedValue(new Error("unavailable")),
  },
}));

vi.mock("@src/stores/system/state.svelte.ts", () => ({
  getSystemState: vi.fn(() => {
    throw new Error("unavailable");
  }),
}));

vi.mock("@src/services/security/audit-service", () => ({
  queryAuditLogs: vi.fn().mockRejectedValue(new Error("unavailable")),
}));

import { load } from "../../../src/routes/(app)/config/monitor/+page.server";

describe("monitor +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns safe defaults for admin when services fail", async () => {
    const data: any = await load({
      locals: {
        user: { _id: "u1", role: "admin" },
        isAdmin: true,
        tenantId: "t1",
      },
    } as any);

    expect(data.security.incidentCount).toBe(0);
    expect(data.webhooks.total).toBe(0);
    expect(data.systemState.overallState).toBe("unknown");
    expect(Array.isArray(data.auditLogs)).toBe(true);
  });

  it("throws 403 for non-admin", async () => {
    await expect(
      load({
        locals: {
          user: { _id: "u2", role: "editor" },
          isAdmin: false,
          tenantId: "t1",
        },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
