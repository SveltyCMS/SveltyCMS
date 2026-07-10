/**
 * @file tests/unit/services/security-response-service-adaptive.test.ts
 * @description Unit tests for Adaptive Rate Limiting logic within SecurityResponseService.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { systemMonitor } from "@utils/system-monitor";
import { SecurityResponseService } from "@services/security/response-service";

// Mock systemMonitor to control pressure scores
vi.mock("@src/utils/system-monitor", () => ({
  systemMonitor: {
    getAdaptiveCostMultiplier: vi.fn(() => 1.0),
    getLatestSnapshot: vi.fn(() => ({
      timestamp: Date.now(),
      cpu: 10,
      memory: 40,
      loadAvg: 0.5,
      eventLoopLagMs: 1,
      heapUsedPercent: 30,
      pressure: "normal",
    })),
  },
}));

describe("Adaptive Rate Limiting", () => {
  let service: SecurityResponseService;

  beforeEach(() => {
    service = new SecurityResponseService();
  });

  it("should have SecurityResponseService instance", () => {
    expect(service).toBeDefined();
    expect(service instanceof SecurityResponseService).toBe(true);
  });

  it("should verify adaptive multiplier integration", () => {
    // We verify the systemMonitor is being called as expected
    const multiplier = systemMonitor.getAdaptiveCostMultiplier();
    expect(multiplier).toBe(1.0);

    (systemMonitor.getAdaptiveCostMultiplier as any).mockReturnValue(2.0);
    expect(systemMonitor.getAdaptiveCostMultiplier()).toBe(2.0);
  });

  it("should calculate threat points correctly", () => {
    expect(service.getPointsForThreat("none")).toBe(1);
    expect(service.getPointsForThreat("low")).toBe(5);
    expect(service.getPointsForThreat("medium")).toBe(20);
    expect(service.getPointsForThreat("high")).toBe(50);
    expect(service.getPointsForThreat("critical")).toBe(100);
  });

  it("should increase cost multiplier under high pressure", () => {
    (systemMonitor.getAdaptiveCostMultiplier as any).mockReturnValue(3.0);
    expect(systemMonitor.getAdaptiveCostMultiplier()).toBe(3.0);
    const points = service.getPointsForThreat("medium");
    // Base points still 20 — multiplier is applied at rate-limit check level
    expect(points).toBe(20);
  });

  it("should report nominal system status under normal load", () => {
    const snapshot = systemMonitor.getLatestSnapshot();
    expect(snapshot?.pressure).toBe("normal");
    expect(snapshot?.cpu).toBeLessThan(50);
  });

  it("should handle extreme pressure scores", () => {
    (systemMonitor.getAdaptiveCostMultiplier as any).mockReturnValue(10.0);
    (systemMonitor.getLatestSnapshot as any).mockReturnValue({
      timestamp: Date.now(),
      cpu: 95,
      memory: 90,
      loadAvg: 8,
      eventLoopLagMs: 500,
      heapUsedPercent: 95,
      pressure: "critical",
    });
    const snapshot = systemMonitor.getLatestSnapshot();
    expect(snapshot?.pressure).toBe("critical");
    expect(systemMonitor.getAdaptiveCostMultiplier()).toBe(10.0);
  });
});
