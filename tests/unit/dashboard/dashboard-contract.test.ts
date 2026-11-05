/**
 * @file tests/unit/dashboard/dashboard-contract.test.ts
 * @description Unit tests for widget schema contracts and Valibot validation.
 */

import { describe, expect, it } from "vitest";
import * as v from "valibot";
import {
  DashboardWidgetConfigSchema,
  DashboardWidgetManifestSchema,
  WidgetSizeSchema,
} from "@src/routes/(app)/dashboard/widget-contract";

describe("WidgetSizeSchema", () => {
  it("accepts valid sizes within 1..4 bounds", () => {
    expect(v.safeParse(WidgetSizeSchema, { w: 1, h: 1 }).success).toBe(true);
    expect(v.safeParse(WidgetSizeSchema, { w: 4, h: 4 }).success).toBe(true);
  });

  it("rejects sizes out of bounds", () => {
    expect(v.safeParse(WidgetSizeSchema, { w: 0, h: 1 }).success).toBe(false);
    expect(v.safeParse(WidgetSizeSchema, { w: 5, h: 2 }).success).toBe(false);
  });
});

describe("DashboardWidgetConfigSchema", () => {
  it("validates a full widget configuration", () => {
    const validConfig = {
      id: "wgt-cpu-1",
      component: "cpu",
      label: "CPU Usage",
      icon: "mdi:cpu-64-bit",
      size: { w: 1, h: 2 },
      order: 0,
      settings: { threshold: 90 },
    };

    const result = v.safeParse(DashboardWidgetConfigSchema, validConfig);
    expect(result.success).toBe(true);
  });

  it("rejects configs missing required fields", () => {
    const invalidConfig = {
      id: "",
      component: "cpu",
    };

    const result = v.safeParse(DashboardWidgetConfigSchema, invalidConfig);
    expect(result.success).toBe(false);
  });
});

describe("DashboardWidgetManifestSchema", () => {
  it("validates a standard widget package manifest", () => {
    const manifest = {
      id: "system-health",
      name: "System Health",
      description: "Overall system status",
      icon: "mdi:heart-pulse",
      version: "1.0.0",
      sveltycms: ">=0.0.8",
      type: "dashboard-widget" as const,
      author: "SveltyCMS",
      license: "free" as const,
      component: "index",
      defaultSize: { w: 2, h: 2 },
      category: "monitoring" as const,
    };

    const result = v.safeParse(DashboardWidgetManifestSchema, manifest);
    expect(result.success).toBe(true);
  });
});
