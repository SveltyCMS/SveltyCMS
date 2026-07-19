/**
 * @file tests/unit/dashboard/widget-defaults.test.ts
 * @description Unit tests for dashboard widget category defaults (install-agnostic).
 */

import { describe, it, expect } from "vitest";
import {
  getWidgetDefaults,
  WIDGET_DEFAULTS,
  type WidgetCategory,
} from "../../../src/routes/(app)/dashboard/widgets/widget-defaults";

describe("WIDGET_DEFAULTS catalog", () => {
  const categories: WidgetCategory[] = ["monitoring", "logs", "content", "static"];

  it("defines all four categories", () => {
    for (const c of categories) {
      expect(WIDGET_DEFAULTS[c]).toBeDefined();
      expect(typeof WIDGET_DEFAULTS[c].retryCount).toBe("number");
      expect(typeof WIDGET_DEFAULTS[c].showRefreshButton).toBe("boolean");
    }
  });

  it("monitoring never caches and shows refresh", () => {
    const d = getWidgetDefaults("monitoring");
    expect(d.showRefreshButton).toBe(true);
    expect(d.cacheKey).toBeUndefined();
  });

  it("content caches with widget id", () => {
    const d = getWidgetDefaults("content", "w-123");
    expect(d.cacheKey).toBe("content-w-123");
    expect(d.cacheTTL).toBe(120_000);
  });

  it("static caches longer than content", () => {
    const content = getWidgetDefaults("content", "a");
    const stat = getWidgetDefaults("static", "a");
    expect((stat.cacheTTL ?? 0) > (content.cacheTTL ?? 0)).toBe(true);
  });

  it("logs disables refresh button", () => {
    expect(getWidgetDefaults("logs").showRefreshButton).toBe(false);
  });
});
