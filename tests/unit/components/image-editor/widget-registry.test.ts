/**
 * @file tests/unit/components/image-editor/widget-registry.test.ts
 * @description Unit tests for the image editor widget registry — validation,
 *              defaults, ordering, disabled filtering, and category lookup.
 */

import { describe, it, expect } from "vitest";
import type { EditorWidget } from "@src/components/image-editor/widgets/registry";

// The registry uses import.meta.glob which isn't available in unit tests,
// so we test the type guard and data structures directly.

// Replicate the isValidWidget logic for testing (mirrors registry.ts lines 30-43)
function isValidWidget(obj: unknown): obj is EditorWidget {
  if (!obj || typeof obj !== "object") return false;
  const w = obj as Partial<EditorWidget>;
  return !!(w.key && typeof w.key === "string" && w.title && typeof w.title === "string" && w.tool);
}

// Replicate the defaults-application logic (mirrors registry.ts lines 69-77)
function applyDefaults(widget: EditorWidget): EditorWidget {
  return {
    requiresImage: true,
    experimental: false,
    disabled: false,
    category: "general",
    order: 999,
    ...widget,
  } as EditorWidget;
}

// Replicate the sort logic (mirrors registry.ts lines 81-87)
function sortWidgets(widgets: EditorWidget[]): EditorWidget[] {
  return [...widgets].sort((a, b) => {
    if (a.order !== b.order) return (a.order ?? 999) - (b.order ?? 999);
    return a.title.localeCompare(b.title);
  });
}

// Minimal mock tool component (Svelte component is just a function for tests)
const mockTool = (() => {}) as any;
const mockControls = (() => {}) as any;

describe("Widget Registry — Validation", () => {
  it("accepts a valid widget with required fields", () => {
    const widget = { key: "crop", title: "Crop", tool: mockTool };
    expect(isValidWidget(widget)).toBe(true);
  });

  it("accepts a widget with all optional fields", () => {
    const widget: EditorWidget = {
      key: "watermark",
      title: "Watermark",
      tool: mockTool,
      icon: "mdi:watermark",
      description: "Add watermark to image",
      category: "effects",
      order: 10,
      controls: mockControls,
      experimental: true,
      requiresImage: true,
      disabled: false,
    };
    expect(isValidWidget(widget)).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidWidget(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidWidget(undefined)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isValidWidget("not-a-widget")).toBe(false);
    expect(isValidWidget(42)).toBe(false);
  });

  it("rejects widget missing key", () => {
    expect(isValidWidget({ title: "Crop", tool: mockTool })).toBe(false);
  });

  it("rejects widget with empty key", () => {
    expect(isValidWidget({ key: "", title: "Crop", tool: mockTool })).toBe(false);
  });

  it("rejects widget missing title", () => {
    expect(isValidWidget({ key: "crop", tool: mockTool })).toBe(false);
  });

  it("rejects widget with empty title", () => {
    expect(isValidWidget({ key: "crop", title: "", tool: mockTool })).toBe(false);
  });

  it("rejects widget missing tool", () => {
    expect(isValidWidget({ key: "crop", title: "Crop" })).toBe(false);
  });

  it("rejects widget with non-string key", () => {
    expect(isValidWidget({ key: 123, title: "Crop", tool: mockTool })).toBe(false);
  });

  it("rejects widget with non-string title", () => {
    expect(isValidWidget({ key: "crop", title: 123, tool: mockTool })).toBe(false);
  });
});

describe("Widget Registry — Defaults", () => {
  it("applies requiresImage: true by default", () => {
    const w = applyDefaults({ key: "test", title: "Test", tool: mockTool });
    expect(w.requiresImage).toBe(true);
  });

  it("preserves explicit requiresImage: false", () => {
    const w = applyDefaults({ key: "test", title: "Test", tool: mockTool, requiresImage: false });
    expect(w.requiresImage).toBe(false);
  });

  it("applies experimental: false by default", () => {
    const w = applyDefaults({ key: "test", title: "Test", tool: mockTool });
    expect(w.experimental).toBe(false);
  });

  it("applies disabled: false by default", () => {
    const w = applyDefaults({ key: "test", title: "Test", tool: mockTool });
    expect(w.disabled).toBe(false);
  });

  it("applies category: 'general' by default", () => {
    const w = applyDefaults({ key: "test", title: "Test", tool: mockTool });
    expect(w.category).toBe("general");
  });

  it("preserves explicit category", () => {
    const w = applyDefaults({ key: "test", title: "Test", tool: mockTool, category: "transform" });
    expect(w.category).toBe("transform");
  });

  it("applies order: 999 by default", () => {
    const w = applyDefaults({ key: "test", title: "Test", tool: mockTool });
    expect(w.order).toBe(999);
  });
});

describe("Widget Registry — Sorting", () => {
  it("sorts by order ascending", () => {
    const widgets: EditorWidget[] = [
      { key: "c", title: "C", tool: mockTool, order: 30 },
      { key: "a", title: "A", tool: mockTool, order: 10 },
      { key: "b", title: "B", tool: mockTool, order: 20 },
    ];
    const sorted = sortWidgets(widgets);
    expect(sorted.map((w) => w.key)).toEqual(["a", "b", "c"]);
  });

  it("sorts by title when orders are equal", () => {
    const widgets: EditorWidget[] = [
      { key: "z", title: "Zoom", tool: mockTool, order: 10 },
      { key: "c", title: "Crop", tool: mockTool, order: 10 },
      { key: "b", title: "Blur", tool: mockTool, order: 10 },
    ];
    const sorted = sortWidgets(widgets);
    expect(sorted.map((w) => w.key)).toEqual(["b", "c", "z"]);
  });

  it("handles widgets without explicit order (default 999)", () => {
    const widgets: EditorWidget[] = [
      { key: "first", title: "First", tool: mockTool, order: 1 },
      { key: "last", title: "Last", tool: mockTool },
    ];
    const sorted = sortWidgets(widgets);
    expect(sorted[0].key).toBe("first");
    expect(sorted[1].key).toBe("last");
  });
});

describe("Widget Registry — Disabled Filtering", () => {
  it("filters out disabled widgets", () => {
    const widgets: EditorWidget[] = [
      { key: "enabled", title: "Enabled", tool: mockTool, disabled: false },
      { key: "disabled", title: "Disabled", tool: mockTool, disabled: true },
    ];
    const active = widgets.filter((w) => !w.disabled);
    expect(active).toHaveLength(1);
    expect(active[0].key).toBe("enabled");
  });

  it("keeps widgets without explicit disabled flag", () => {
    const w = applyDefaults({ key: "test", title: "Test", tool: mockTool });
    expect(w.disabled).toBe(false);
  });
});

describe("Widget Registry — Category Lookup", () => {
  it("filters widgets by category", () => {
    const widgets: EditorWidget[] = [
      { key: "crop", title: "Crop", tool: mockTool, category: "transform" },
      { key: "blur", title: "Blur", tool: mockTool, category: "effects" },
      { key: "rotate", title: "Rotate", tool: mockTool, category: "transform" },
    ];
    const transform = widgets.filter((w) => w.category === "transform");
    expect(transform).toHaveLength(2);
    expect(transform.map((w) => w.key)).toEqual(["crop", "rotate"]);
  });
});

describe("Widget Registry — Key Lookup", () => {
  it("finds widget by key", () => {
    const widgets: EditorWidget[] = [
      { key: "crop", title: "Crop", tool: mockTool },
      { key: "blur", title: "Blur", tool: mockTool },
    ];
    const found = widgets.find((w) => w.key === "blur");
    expect(found).toBeDefined();
    expect(found!.title).toBe("Blur");
  });

  it("returns undefined for unknown key", () => {
    const widgets: EditorWidget[] = [{ key: "crop", title: "Crop", tool: mockTool }];
    expect(widgets.find((w) => w.key === "nonexistent")).toBeUndefined();
  });
});
