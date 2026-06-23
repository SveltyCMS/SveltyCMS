/**
 * @file tests/unit/databases/resilience-integration.test.ts
 * @description Unit tests for resilience integration wiring.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/stores/system/state.svelte.ts", () => ({
  getSystemState: vi.fn(() => ({
    overallState: "READY",
    services: { database: { status: "healthy", message: "ok" } },
  })),
  updateServiceHealth: vi.fn(),
}));

vi.mock("@src/databases/database-resilience", () => ({
  getDatabaseResilience: vi.fn(() => ({
    executeWithRetry: vi.fn(async (fn: () => Promise<void>) => fn()),
    getMetrics: vi.fn(() => ({
      circuitState: "CLOSED",
      totalRetries: 1,
      successfulReconnections: 0,
      failedRetries: 0,
      totalReconnections: 0,
      successfulRetries: 0,
      averageRecoveryTime: 0,
      connectionUptime: 0,
      failureHistory: [],
      circuitBreakerTransitions: 0,
    })),
    healthCheck: vi.fn(async (ping: () => Promise<number>) => ({
      healthy: true,
      latency: await ping(),
      message: "ok",
    })),
    getPoolDiagnostics: vi.fn(async () => ({
      totalConnections: 10,
      activeConnections: 2,
      idleConnections: 8,
      waitingRequests: 0,
      poolUtilization: 20,
      avgConnectionTime: 1,
      healthStatus: "healthy",
      recommendations: [],
    })),
    attemptReconnection: vi.fn(),
  })),
  notifyAdminsOfDatabaseFailure: vi.fn(),
}));

import {
  connectDatabaseWithResilience,
  bindAdapterResilienceHooks,
  getSystemStatus,
} from "@src/databases/resilience-integration";

describe("resilience-integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connectDatabaseWithResilience should connect and bind hooks on success", async () => {
    const connect = vi.fn().mockResolvedValue({ success: true, data: undefined });
    const adapter = {
      type: "sqlite",
      connect,
      isConnected: () => true,
      _sqlite: { prepare: () => ({ get: () => 1 }) },
    } as any;

    const result = await connectDatabaseWithResilience(adapter, "test-connect");
    expect(result.success).toBe(true);
    expect(connect).toHaveBeenCalled();
    bindAdapterResilienceHooks(adapter);
    bindAdapterResilienceHooks(adapter);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("connectDatabaseWithResilience should fail when connect returns error", async () => {
    const adapter = {
      type: "sqlite",
      connect: vi.fn().mockResolvedValue({ success: false, message: "down" }),
      isConnected: () => false,
    } as any;

    const result = await connectDatabaseWithResilience(adapter, "test-fail");
    expect(result.success).toBe(false);
    expect(result.message).toContain("down");
  });

  it("getSystemStatus should return unified health payload", async () => {
    const adapter = {
      type: "sqlite",
      isConnected: () => true,
      _sqlite: { prepare: () => ({ get: () => 1 }) },
    } as any;

    const status = await getSystemStatus(adapter);
    expect(status.health.healthy).toBe(true);
    expect(status.database.connected).toBe(true);
    expect(status.metrics.circuitState).toBe("CLOSED");
    expect(status.pool?.totalConnections).toBe(10);
  });
});
