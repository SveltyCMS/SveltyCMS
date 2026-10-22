/**
 * @vitest-environment node
 * @file tests/unit/components/field-skeleton.test.ts
 * @description Guards the render-safe form skeleton of the collection field editor.
 *
 * A create session starts from an empty store, and the editor seeds defaults in
 * an effect — which runs *after* the first mount. Every widget therefore saw
 * `bind:value={undefined}` on mount, and any widget whose prop declares a
 * fallback (`value = $bindable([])`, e.g. Tags) threw `props_invalid_value`,
 * surfacing as a 500 "System Error" page when Create was clicked from the list.
 * `buildFieldSkeleton()` must give every declared field a value synchronously.
 */

import { describe, expect, it } from "vitest";
import { buildFieldSkeleton } from "@components/collection-display/field-skeleton";

const fields = [
  { db_fieldName: "title", label: "Title", translated: true, required: true },
  { db_fieldName: "slug", label: "Slug", widget: { Name: "Slug" } },
  { db_fieldName: "status", label: "Status", default: "draft" },
  { db_fieldName: "tags", label: "Tags", widget: { Name: "Tags" } },
];

describe("buildFieldSkeleton", () => {
  it("gives every declared field a value for a new entry", () => {
    const skeleton = buildFieldSkeleton({}, fields, { locale: "en", isNewEntry: true });

    expect(Object.keys(skeleton).sort()).toEqual(["slug", "status", "tags", "title"]);
    expect(skeleton.title).toEqual({ en: "" });
    expect(skeleton.slug).toBeNull();
    expect(skeleton.tags).toBeNull();
    expect(skeleton.status).toBe("draft");
  });

  it("honors translated defaults for a new entry", () => {
    const skeleton = buildFieldSkeleton(
      {},
      [{ db_fieldName: "summary", label: "Summary", translated: true, default: "Hello" }],
      { locale: "de", isNewEntry: true },
    );

    expect(skeleton.summary).toEqual({ de: "Hello" });
  });

  it("does not apply schema defaults to an existing entry", () => {
    const skeleton = buildFieldSkeleton({ _id: "abc", title: { en: "Existing" } }, fields, {
      locale: "en",
      isNewEntry: false,
    });

    expect(skeleton.title).toEqual({ en: "Existing" });
    expect(skeleton.status).toBeNull();
    expect(skeleton.tags).toBeNull();
  });

  it("preserves falsy values that are already present", () => {
    const skeleton = buildFieldSkeleton(
      { _id: "abc", status: "", tags: null, slug: "kept" },
      fields,
      { locale: "en", isNewEntry: false },
    );

    expect(skeleton.status).toBe("");
    expect(skeleton.tags).toBeNull();
    expect(skeleton.slug).toBe("kept");
  });

  it("migrates legacy plain strings on translated fields into locale records", () => {
    const skeleton = buildFieldSkeleton({ _id: "abc", title: "Legacy" }, fields, {
      locale: "en",
      isNewEntry: false,
    });

    expect(skeleton.title).toEqual({ en: "Legacy" });
  });

  it("ignores missing input", () => {
    expect(buildFieldSkeleton(null, null, { locale: "en", isNewEntry: true })).toEqual({});
    expect(buildFieldSkeleton(undefined, [], { locale: "en", isNewEntry: true })).toEqual({});
  });
});
