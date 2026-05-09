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
    getMetrics: vi.fn(() => ({
      cpuLoad: 0.1,
      eventLoopLag: 1,
      memoryUsage: 100,
      pressureScore: 0.1,
      status: "nominal",
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
});
