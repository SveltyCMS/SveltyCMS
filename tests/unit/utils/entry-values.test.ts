/**
 * @file tests/unit/utils/entry-values.test.ts
 * @description Blocker B2 regression: the list → editor handoff.
 *
 * A list row is a one-language display projection. Handing it to the editor is
 * what destroyed localized content, because the projection also carried the
 * display placeholder `"-"` and had already collapsed the rich-text payload.
 * These cases pin the shared mapping that both consumers now use.
 */

import { describe, expect, it, vi } from "vitest";
import {
  loadEntryFormValues,
  mapEntryValues,
  resolveLocalizedValue,
  type EntryReader,
} from "@utils/entry-values";

/** Schema fields for the reported collection (`posts`). */
const FIELDS = [
  { db_fieldName: "title", label: "Title", translated: true },
  { db_fieldName: "content", label: "Content", translated: true },
  { db_fieldName: "excerpt", label: "Excerpt", translated: true },
  { db_fieldName: "status", label: "Status", translated: false },
];

/** The document the audit found in the database after the destructive save. */
const STORED_DOCUMENT = {
  _id: "entry-1",
  status: "publish",
  title: { en: "Edited title", de: "Bearbeiteter Titel" },
  content: { en: "<p>Body two.</p>", de: "<p>Text zwei.</p>", fr: "" },
  excerpt: { en: "", de: "", fr: "" },
};

describe("resolveLocalizedValue", () => {
  it("reads the requested language layer", () => {
    expect(resolveLocalizedValue({ en: "<p>hi</p>", de: "<p>hallo</p>" }, "en")).toBe("<p>hi</p>");
    expect(resolveLocalizedValue({ en: "<p>hi</p>", de: "<p>hallo</p>" }, "de")).toBe(
      "<p>hallo</p>",
    );
  });

  it("keeps an empty translation empty instead of falling back to another language", () => {
    // The list and the form both must not show German in an empty English field.
    expect(resolveLocalizedValue({ en: "", de: "<p>hallo</p>" }, "en")).toBe("");
    expect(resolveLocalizedValue({ en: "", de: "" }, "en")).toBe("");
    expect(resolveLocalizedValue({ de: "<p>hallo</p>" }, "en")).toBe("");
  });

  it("never produces a display placeholder", () => {
    for (const value of [{ en: "" }, { en: null }, {}, null, undefined, ""]) {
      const resolved = resolveLocalizedValue(value, "en");
      expect(resolved).not.toBe("-");
      expect(resolved === "" || resolved === null || resolved === undefined).toBe(true);
    }
  });

  it("leaves structured payloads intact", () => {
    const richText = { title: "", content: "<p>body</p>" };
    expect(resolveLocalizedValue(richText, "en")).toEqual(richText);
    expect(resolveLocalizedValue({ en: richText, de: { title: "t", content: "c" } }, "en")).toEqual(
      richText,
    );
  });
});

describe("mapEntryValues (mode: list)", () => {
  it("projects the current language and keeps empty cells empty", () => {
    const row = mapEntryValues(STORED_DOCUMENT, FIELDS, { language: "en", mode: "list" });

    expect(row.title).toBe("Edited title");
    expect(row.content).toBe("<p>Body two.</p>");
    // The regression: this used to be "-", and that placeholder travelled into
    // the editor and back into the database.
    expect(row.excerpt).toBe("");
    expect(JSON.stringify(row)).not.toContain('"excerpt":"-"');
  });

  it("does not mutate the stored row (list rows are shared with the cache)", () => {
    const source = structuredClone(STORED_DOCUMENT);
    mapEntryValues(source, FIELDS, { language: "en", mode: "list" });
    expect(source).toEqual(STORED_DOCUMENT);
  });

  it("leaves non-translated fields alone", () => {
    const row = mapEntryValues(STORED_DOCUMENT, FIELDS, { language: "en", mode: "list" });
    expect(row.status).toBe("publish");
    expect(row._id).toBe("entry-1");
  });
});

describe("mapEntryValues (mode: form)", () => {
  it("keeps every language layer", () => {
    const values = mapEntryValues(STORED_DOCUMENT, FIELDS, { language: "en", mode: "form" });

    expect(values.content).toEqual({
      en: "<p>Body two.</p>",
      de: "<p>Text zwei.</p>",
      fr: "",
    });
    expect(values.title).toEqual({ en: "Edited title", de: "Bearbeiteter Titel" });
  });

  it("keeps empty fields empty — no placeholder of any kind", () => {
    const values = mapEntryValues(STORED_DOCUMENT, FIELDS, { language: "en", mode: "form" });
    expect(values.excerpt).toEqual({ en: "", de: "", fr: "" });
    expect(JSON.stringify(values)).not.toContain('"-"');
  });

  it("wraps a legacy plain string into a locale record without losing it", () => {
    const values = mapEntryValues(
      { _id: "e", title: { en: "t", de: "" }, content: "<p>legacy</p>", excerpt: null },
      FIELDS,
      { language: "en", mode: "form" },
    );
    expect(values.content).toEqual({ en: "<p>legacy</p>" });
    expect(values.excerpt).toEqual({ en: "" });
  });

  it("copies values so editing the form cannot mutate the source document", () => {
    const source = structuredClone(STORED_DOCUMENT);
    const values = mapEntryValues(source, FIELDS, { language: "en", mode: "form" });
    (values.content as Record<string, unknown>).en = "changed";
    expect(source.content.en).toBe("<p>Body two.</p>");
  });
});

describe("loadEntryFormValues (list row → editor handoff)", () => {
  it("reads the stored document exactly once and returns all locales", async () => {
    const readEntry = vi.fn<EntryReader>().mockResolvedValue({
      success: true,
      data: structuredClone(STORED_DOCUMENT),
    });

    const result = await loadEntryFormValues({
      collectionId: "posts",
      entryId: "entry-1",
      fields: FIELDS,
      language: "en",
      readEntry,
    });

    expect(readEntry).toHaveBeenCalledTimes(1);
    expect(readEntry).toHaveBeenCalledWith("posts", "entry-1");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.values.content).toEqual({
      en: "<p>Body two.</p>",
      de: "<p>Text zwei.</p>",
      fr: "",
    });
    expect(result.values.excerpt).toEqual({ en: "", de: "", fr: "" });
  });

  it("fails loudly instead of opening a form on a rejected read", async () => {
    const readEntry = vi.fn<EntryReader>().mockResolvedValue({
      success: false,
      message: "HTTP 404",
    });

    const result = await loadEntryFormValues({
      collectionId: "posts",
      entryId: "missing",
      fields: FIELDS,
      language: "en",
      readEntry,
    });

    expect(result).toEqual({ ok: false, error: "HTTP 404" });
  });

  it("rejects a response for a different entry (never edit the wrong row)", async () => {
    const readEntry = vi.fn<EntryReader>().mockResolvedValue({
      success: true,
      data: { _id: "someone-else", title: { en: "x" } },
    });

    const result = await loadEntryFormValues({
      collectionId: "posts",
      entryId: "entry-1",
      fields: FIELDS,
      language: "en",
      readEntry,
    });

    expect(result.ok).toBe(false);
  });

  it("does not read anything without an entry id (no request per row)", async () => {
    const readEntry = vi.fn<EntryReader>();

    const result = await loadEntryFormValues({
      collectionId: "posts",
      entryId: "",
      fields: FIELDS,
      language: "en",
      readEntry,
    });

    expect(result.ok).toBe(false);
    expect(readEntry).not.toHaveBeenCalled();
  });
});
