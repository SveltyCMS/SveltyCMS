/**
 * @file tests/unit/utils/form-sections.test.ts
 * @description Unit tests for collection editor field grouping, pairing, and width parsing.
 */

import { describe, expect, it } from "vitest";
import {
  canonicalizeWidgetName,
  formFieldColSpan,
  groupEntryFields,
  isFullWidthFormField,
  layoutFormSectionFields,
  parseFieldWidth,
  resolveFieldSection,
  type FormSectionField,
} from "@utils/form-sections";

function field(partial: FormSectionField): FormSectionField {
  return partial;
}

describe("parseFieldWidth", () => {
  it("returns undefined for empty values", () => {
    expect(parseFieldWidth(undefined)).toBeUndefined();
    expect(parseFieldWidth(null)).toBeUndefined();
    expect(parseFieldWidth("")).toBeUndefined();
    expect(parseFieldWidth("  ")).toBeUndefined();
  });

  it("clamps numeric widths to 1–12", () => {
    expect(parseFieldWidth(6)).toBe(6);
    expect(parseFieldWidth(0)).toBe(1);
    expect(parseFieldWidth(99)).toBe(12);
    expect(parseFieldWidth("7")).toBe(7);
  });

  it("maps fractions and aliases", () => {
    expect(parseFieldWidth("full")).toBe(12);
    expect(parseFieldWidth("1/2")).toBe(6);
    expect(parseFieldWidth("half")).toBe(6);
    expect(parseFieldWidth("1/3")).toBe(4);
    expect(parseFieldWidth("2/3")).toBe(8);
    expect(parseFieldWidth("1/4")).toBe(3);
    expect(parseFieldWidth("3/4")).toBe(9);
    expect(parseFieldWidth("1/6")).toBe(2);
    expect(parseFieldWidth("5/6")).toBe(10);
    expect(parseFieldWidth("5/12")).toBe(5);
    expect(parseFieldWidth("7/12")).toBe(7);
  });

  it("rejects unparseable strings", () => {
    expect(parseFieldWidth("wide")).toBeUndefined();
    expect(parseFieldWidth("auto")).toBeUndefined();
  });
});

describe("canonicalizeWidgetName", () => {
  it("defaults empty input to Input", () => {
    expect(canonicalizeWidgetName(undefined)).toBe("Input");
    expect(canonicalizeWidgetName("")).toBe("Input");
  });

  it("maps aliases onto factory names", () => {
    expect(canonicalizeWidgetName("text")).toBe("Input");
    expect(canonicalizeWidgetName("slug")).toBe("Slug");
    expect(canonicalizeWidgetName("rich-text")).toBe("RichText");
    expect(canonicalizeWidgetName("phone_number")).toBe("PhoneNumber");
    expect(canonicalizeWidgetName("SEO")).toBe("SEO");
  });
});

describe("resolveFieldSection", () => {
  it("honors an explicit section string", () => {
    const meta = resolveFieldSection(field({ section: "Hero", db_fieldName: "title" }));
    expect(meta).toMatchObject({ key: "hero", label: "Hero", showHeading: true });
  });

  it("infers SEO, hero, CTA, content, and details from names/widgets", () => {
    expect(resolveFieldSection(field({ db_fieldName: "seo", widget: "SEO" })).key).toBe("seo");
    expect(resolveFieldSection(field({ db_fieldName: "heroImage" })).key).toBe("hero");
    expect(resolveFieldSection(field({ db_fieldName: "ctaLabel" })).key).toBe("cta");
    expect(resolveFieldSection(field({ db_fieldName: "body", widget: "RichText" })).key).toBe(
      "content",
    );
    expect(resolveFieldSection(field({ db_fieldName: "title", widget: "Input" })).key).toBe(
      "details",
    );
  });

  it("puts unrecognized compact fields in More", () => {
    expect(resolveFieldSection(field({ db_fieldName: "subtitle", widget: "Input" })).key).toBe(
      "more",
    );
  });
});

describe("isFullWidthFormField / formFieldColSpan", () => {
  it("treats wide widgets as full width (span 12)", () => {
    const seo = field({ db_fieldName: "seo", widget: "SEO" });
    expect(isFullWidthFormField(seo)).toBe(true);
    expect(formFieldColSpan(seo)).toBe(12);
  });

  it("pairs compact widgets at span 6 unless width is set", () => {
    const title = field({ db_fieldName: "title", widget: "Input" });
    expect(isFullWidthFormField(title)).toBe(false);
    expect(formFieldColSpan(title)).toBe(6);
    expect(formFieldColSpan(field({ ...title, width: "1/3" }))).toBe(4);
  });
});

describe("groupEntryFields", () => {
  it("keeps schema order and merges consecutive fields with the same section key", () => {
    const sections = groupEntryFields([
      field({ db_fieldName: "title", widget: "Input" }),
      field({ db_fieldName: "slug", widget: "Slug" }),
      field({ db_fieldName: "body", widget: "RichText" }),
      field({ db_fieldName: "seo", widget: "SEO" }),
    ]);

    expect(sections.map((section) => section.key)).toEqual(["details", "content", "seo"]);
    expect(sections[0].fields.map((item) => item.db_fieldName)).toEqual(["title", "slug"]);
  });

  it("does not reshuffle when a later details field appears after content", () => {
    const sections = groupEntryFields([
      field({ db_fieldName: "title", widget: "Input" }),
      field({ db_fieldName: "body", widget: "RichText" }),
      field({ db_fieldName: "status", widget: "Select" }),
    ]);

    expect(sections.map((section) => section.key)).toEqual(["details", "content", "details"]);
  });
});

describe("layoutFormSectionFields", () => {
  it("pairs consecutive compact widgets and leaves wide widgets on their own row", () => {
    const rows = layoutFormSectionFields([
      field({ db_fieldName: "title", widget: "Input" }),
      field({ db_fieldName: "slug", widget: "Slug" }),
      field({ db_fieldName: "body", widget: "RichText" }),
      field({ db_fieldName: "status", widget: "Select" }),
    ]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      fullWidth: false,
      fields: [{ db_fieldName: "title" }, { db_fieldName: "slug" }],
    });
    expect(rows[1]).toMatchObject({ fullWidth: true, fields: [{ db_fieldName: "body" }] });
    expect(rows[2]).toMatchObject({ fullWidth: false, fields: [{ db_fieldName: "status" }] });
  });
});
