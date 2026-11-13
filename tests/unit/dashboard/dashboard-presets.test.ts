/**
 * @file tests/unit/dashboard/dashboard-presets.test.ts
 * @description Unit tests for curated dashboard presets and builder functions.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildPresetWidgets,
  DASHBOARD_PRESETS,
  resolvePresetWidgets,
} from "@src/routes/(app)/dashboard/widget-presets";

/**
 * The shipped widget registry, read from the package folders on disk.
 * `dashboard-manifest-registry` uses `import.meta.glob`, which the unit harness
 * shims to `{}`, so a filesystem scan is the only way to pin preset ↔ package
 * ids without mocking the thing under test.
 */
const WIDGET_ROOT = join(process.cwd(), "src", "routes", "(app)", "dashboard", "widgets");
const shippedWidgetIds = new Set(
  readdirSync(WIDGET_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => {
      try {
        const manifest = JSON.parse(
          readFileSync(join(WIDGET_ROOT, entry.name, "widget.json"), "utf8"),
        );
        return typeof manifest?.id === "string" && manifest.id.length > 0;
      } catch {
        return false;
      }
    })
    .map((entry) => entry.name),
);

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

describe("preset ↔ shipped widget registry", () => {
  for (const preset of DASHBOARD_PRESETS) {
    it(`resolves "${preset.id}" to at least one installed widget`, () => {
      const { widgets, unavailable } = resolvePresetWidgets(preset, shippedWidgetIds);

      // A non-empty `unavailable` list means the preset ids drifted from the
      // widget.json package ids (folder names) — fix the preset, not the test.
      expect(unavailable).toEqual([]);
      expect(widgets.length).toBeGreaterThan(0);
      expect(widgets[0].order).toBe(0);
    });
  }

  it("reports every package as unavailable for a gated (empty) registry", () => {
    const preset = DASHBOARD_PRESETS.find((p) => p.id === "governance")!;
    const { widgets, unavailable } = resolvePresetWidgets(preset, new Set());

    expect(widgets).toEqual([]);
    expect(unavailable).toEqual(preset.widgets.map((w) => w.component));
  });
});
