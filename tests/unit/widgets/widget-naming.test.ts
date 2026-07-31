/**
 * @file tests/unit/widgets/widget-naming.test.ts
 * @description Enforces the single widget naming convention (folder kebab ↔ Name PascalCase).
 */

import { describe, expect, it } from "vitest";
import {
  folderFromWidgetPath,
  folderToWidgetName,
  isValidWidgetFolder,
  isValidWidgetName,
  validateWidgetNaming,
  widgetNameToFolder,
} from "@src/widgets/widget-naming";

describe("widget naming convention", () => {
  describe("widgetNameToFolder", () => {
    it("maps factory Names to kebab folders", () => {
      expect(widgetNameToFolder("Input")).toBe("input");
      expect(widgetNameToFolder("RichText")).toBe("rich-text");
      expect(widgetNameToFolder("MediaUpload")).toBe("media-upload");
      expect(widgetNameToFolder("PhoneNumber")).toBe("phone-number");
      expect(widgetNameToFolder("SEO")).toBe("seo");
      expect(widgetNameToFolder("AIEnrichment")).toBe("ai-enrichment");
    });
  });

  describe("folderToWidgetName", () => {
    it("maps kebab folders to PascalCase", () => {
      expect(folderToWidgetName("phone-number")).toBe("PhoneNumber");
      expect(folderToWidgetName("rich-text")).toBe("RichText");
    });
  });

  describe("isValidWidgetFolder / isValidWidgetName", () => {
    it("accepts kebab folders and PascalCase names", () => {
      expect(isValidWidgetFolder("phone-number")).toBe(true);
      expect(isValidWidgetFolder("seo")).toBe(true);
      expect(isValidWidgetFolder("PhoneNumber")).toBe(false);
      expect(isValidWidgetFolder("phone_number")).toBe(false);

      expect(isValidWidgetName("PhoneNumber")).toBe(true);
      expect(isValidWidgetName("SEO")).toBe(true);
      expect(isValidWidgetName("phone-number")).toBe(false);
      expect(isValidWidgetName("phoneNumber")).toBe(false);
    });
  });

  describe("validateWidgetNaming", () => {
    it("accepts matching custom/marketplace packages", () => {
      const r = validateWidgetNaming("phone-number", "PhoneNumber", "custom");
      expect(r.ok).toBe(true);
      expect(r.name).toBe("PhoneNumber");
      expect(r.errors).toEqual([]);
    });

    it("accepts SEO / AIEnrichment edge cases", () => {
      expect(validateWidgetNaming("seo", "SEO", "custom").ok).toBe(true);
      expect(validateWidgetNaming("ai-enrichment", "AIEnrichment", "custom").ok).toBe(true);
    });

    it("rejects Name that does not map to folder (custom)", () => {
      const r = validateWidgetNaming("phone-number", "Phone", "custom");
      expect(r.ok).toBe(false);
      expect(r.errors.some((e) => e.includes("maps to folder"))).toBe(true);
    });

    it("rejects PascalCase folders", () => {
      const r = validateWidgetNaming("PhoneNumber", "PhoneNumber", "marketplace");
      expect(r.ok).toBe(false);
    });

    it("rejects kebab-case factory Names", () => {
      const r = validateWidgetNaming("phone-number", "phone-number", "custom");
      expect(r.ok).toBe(false);
    });

    it("warns core on mismatch but still fails closed only on hard errors", () => {
      // Name/folder mismatch is warning for core, error for custom
      const core = validateWidgetNaming("phone-number", "Phone", "core");
      expect(core.ok).toBe(true); // only warnings
      expect(core.warnings.length).toBeGreaterThan(0);

      const custom = validateWidgetNaming("phone-number", "Phone", "custom");
      expect(custom.ok).toBe(false);
    });
  });

  describe("folderFromWidgetPath", () => {
    it("extracts folder from module paths", () => {
      expect(folderFromWidgetPath("./custom/phone-number/index.ts")).toBe("phone-number");
      expect(folderFromWidgetPath("src/widgets/marketplace/foo-bar/index.ts")).toBe("foo-bar");
      expect(folderFromWidgetPath("./core/rich-text/input.svelte")).toBe("rich-text");
      expect(folderFromWidgetPath(".\\custom\\phone-number\\index.ts")).toBe("phone-number");
    });

    it("handles single-file modules directly under a root", () => {
      // Single-file widget: base name without extension becomes the widget segment.
      expect(folderFromWidgetPath("./custom/phone-number.ts")).toBe("phone-number");
      // Root-level shared components resolve to their own name and fail the kebab
      // check loudly instead of being misreported as the root folder.
      expect(folderFromWidgetPath("./core/Input.svelte")).toBe("Input");
      expect(folderFromWidgetPath("./core/input.svelte")).toBe("input");
    });

    it("returns null for degenerate paths", () => {
      expect(folderFromWidgetPath("")).toBeNull();
      expect(folderFromWidgetPath("index.ts")).toBeNull();
      expect(folderFromWidgetPath("./index.ts")).toBeNull();
    });
  });

  describe("shipped custom widgets", () => {
    // Regression: every first-party custom widget must obey the invariant
    const shipped: Array<[string, string]> = [
      ["address", "Address"],
      ["ai-enrichment", "AIEnrichment"],
      ["color-picker", "ColorPicker"],
      ["currency", "Currency"],
      ["date-range", "DateRange"],
      ["geolocation", "Geolocation"],
      ["json-editor", "JsonEditor"],
      ["markdown", "Markdown"],
      ["mega-menu", "MegaMenu"],
      ["phone-number", "PhoneNumber"],
      ["price", "Price"],
      ["rating", "Rating"],
      ["remote-video", "RemoteVideo"],
      ["repeater", "Repeater"],
      ["seo", "SEO"],
      ["tags", "Tags"],
    ];

    it.each(shipped)("%s / %s", (folder, name) => {
      expect(widgetNameToFolder(name)).toBe(folder);
      expect(validateWidgetNaming(folder, name, "custom").ok).toBe(true);
    });
  });
});
