/**
 * @file tests/unit/dashboard/dashboard-presets.test.ts
 * @description Unit tests for curated dashboard presets and builder functions.
 */

import { describe, expect, it } from "vitest";
import { buildPresetWidgets, DASHBOARD_PRESETS } from "@src/routes/(app)/dashboard/widget-presets";

describe("DASHBOARD_PRESETS", () => {
  it("defines standard curated presets", () => {
    const ids = DASHBOARD_PRESETS.map((p) => p.id);
    expect(ids).toContain("default");
    expect(ids).toContain("monitoring");
    expect(ids).toContain("editorial");
    expect(ids).toContain("governance");
    expect(ids).toContain("minimal");
  });

  it("builds valid widget configs from a preset", () => {
    const preset = DASHBOARD_PRESETS.find((p) => p.id === "default")!;
    const widgets = buildPresetWidgets(preset);

    expect(widgets.length).toBe(preset.widgets.length);
    for (let i = 0; i < widgets.length; i++) {
      expect(widgets[i].order).toBe(i);
      expect(widgets[i].component).toBe(preset.widgets[i].component);
      expect(widgets[i].size).toEqual(preset.widgets[i].size);
      expect(widgets[i].id).toMatch(/^wgt-/);
    }
  });

  it("filters preset widgets by availability when supplied", () => {
    const preset = DASHBOARD_PRESETS.find((p) => p.id === "monitoring")!;
    const available = new Set(["cpu", "memory"]);

    const widgets = buildPresetWidgets(preset, available);
    expect(widgets.map((w) => w.component)).toEqual(["cpu", "memory"]);
  });
});
