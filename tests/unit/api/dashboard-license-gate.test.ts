/**
 * @file tests/unit/api/dashboard-license-gate.test.ts
 * @description Unit tests for the dashboard widget server-side license gate.
 *
 * Covers the endpoint → widget-id map, the free-endpoint pass-through, and the
 * 403 LICENSE_REQUIRED path when the trial expired without a license.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Only mock the license manager seam — use real raise/AppError + logger from core.
vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: vi.fn(),
}));

import { checkExtensionLicense } from "@src/utils/license-manager";
import {
  DASHBOARD_ENDPOINT_LICENSE,
  getDashboardEndpointLicense,
  checkDashboardEndpointLicense,
  requireDashboardWidgetLicense,
} from "../../../src/routes/api/[...path]/handlers/dashboard-license";

const mockedCheck = vi.mocked(checkExtensionLicense);

describe("dashboard license gate — endpoint map", () => {
  it("maps every premium endpoint to its gating widget id", () => {
    expect(DASHBOARD_ENDPOINT_LICENSE).toEqual({
      audit: "audit-log",
      logs: "logs",
      security: "security",
      scim: "scim-status",
      "cache-metrics": "cache-monitor",
      "online-user": "user-online",
      metrics: "unified-metrics",
      "commerce-orders": "commerce-orders",
      "commerce-inventory": "commerce-inventory",
    });
  });

  it("exposes free endpoints as ungated", () => {
    for (const free of [
      "health",
      "stats",
      "dashboard",
      "system-info",
      "last5-content",
      "last5media",
      "system-messages",
      "tenant-analytics",
      "pool-diagnostics",
      "unknown-action",
    ]) {
      expect(getDashboardEndpointLicense(free)).toBeUndefined();
    }
  });

  it("is case-insensitive", () => {
    expect(getDashboardEndpointLicense("Cache-Metrics")).toBe("cache-monitor");
    expect(getDashboardEndpointLicense("AUDIT")).toBe("audit-log");
  });
});

describe("checkDashboardEndpointLicense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not check licenses for free endpoints", async () => {
    await checkDashboardEndpointLicense("health");
    await checkDashboardEndpointLicense("last5-content");
    expect(mockedCheck).not.toHaveBeenCalled();
  });

  it("passes through when the widget trial/license is active", async () => {
    mockedCheck.mockResolvedValue({ active: true, daysRemaining: 10, hasLicense: false });
    await expect(checkDashboardEndpointLicense("logs")).resolves.toBeUndefined();
    expect(mockedCheck).toHaveBeenCalledWith("dashboard", "logs");
  });

  it("passes through when a license key is configured", async () => {
    mockedCheck.mockResolvedValue({ active: true, daysRemaining: null, hasLicense: true });
    await expect(checkDashboardEndpointLicense("cache-metrics")).resolves.toBeUndefined();
    expect(mockedCheck).toHaveBeenCalledWith("dashboard", "cache-monitor");
  });

  it("throws 403 LICENSE_REQUIRED when the trial expired without a license", async () => {
    mockedCheck.mockResolvedValue({ active: false, daysRemaining: 0, hasLicense: false });
    await expect(checkDashboardEndpointLicense("security")).rejects.toMatchObject({
      status: 403,
      code: "LICENSE_REQUIRED",
    });
    expect(mockedCheck).toHaveBeenCalledWith("dashboard", "security");
  });

  it("gates commerce-orders with dashboard:commerce-orders", async () => {
    mockedCheck.mockResolvedValue({ active: false, daysRemaining: 0, hasLicense: false });
    await expect(checkDashboardEndpointLicense("commerce-orders")).rejects.toMatchObject({
      status: 403,
      code: "LICENSE_REQUIRED",
    });
    expect(mockedCheck).toHaveBeenCalledWith("dashboard", "commerce-orders");
  });

  it("gates commerce-inventory with dashboard:commerce-inventory", async () => {
    mockedCheck.mockResolvedValue({ active: true, daysRemaining: 14, hasLicense: false });
    await expect(checkDashboardEndpointLicense("commerce-inventory")).resolves.toBeUndefined();
    expect(mockedCheck).toHaveBeenCalledWith("dashboard", "commerce-inventory");
  });
});

describe("requireDashboardWidgetLicense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gates a specific widget id directly", async () => {
    mockedCheck.mockResolvedValue({ active: false, daysRemaining: 0, hasLicense: false });
    await expect(requireDashboardWidgetLicense("database-pool-diagnostics")).rejects.toMatchObject({
      status: 403,
    });
    expect(mockedCheck).toHaveBeenCalledWith("dashboard", "database-pool-diagnostics");
  });
});
