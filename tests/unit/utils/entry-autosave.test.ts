/**
 * @file tests/unit/utils/entry-autosave.test.ts
 * @description Unit tests for the navigation-guard autosave payload.
 *
 * The payload builder is the ONLY write path behind Reload/Back on the entry
 * form, so it must apply the same required-field gate as the Save button and
 * must not turn an untouched Create form into a blank draft row.
 */

import { describe, it, expect } from "vitest";
import {
  buildAutosavePayload,
  findMissingRequiredFields,
  isPristineEntry,
} from "../../../src/utils/entry-autosave";

const NOW = "2026-10-19T12:00:00.000Z";

/** Shape of the `posts` schema fields the editor seeds on create. */
const POSTS_FIELDS = [
  { label: "Title", db_fieldName: "title", required: true, widget: { Name: "Input" } },
  { label: "Content", db_fieldName: "content", required: true, widget: { Name: "RichText" } },
  { label: "Slug", db_fieldName: "slug", required: false, widget: { Name: "Input" } },
] as never;

/** A fresh `/collection/posts?create=true` form after the editor normalized it. */
function untouchedCreateForm(): Record<string, unknown> {
  return {
    title: { en: "" },
    content: { en: "" },
    slug: { en: "" },
    status: "draft",
  };
}

describe("entry-autosave - status preservation", () => {
  it("saves a new entry as draft", () => {
    const payload = buildAutosavePayload({ title: "New" }, null, NOW, []);
    expect(payload?.status).toBe("draft");
    expect(payload?.updatedAt).toBe(NOW);
  });

  it("keeps a published entry published", () => {
    const payload = buildAutosavePayload(
      { _id: "entry-1", title: "Edited", status: "draft" },
      { _id: "entry-1", title: "Live", status: "publish" },
      NOW,
      [],
    );
    expect(payload?.status).toBe("publish");
  });

  it("keeps a scheduled entry scheduled and preserves its timestamp", () => {
    const payload = buildAutosavePayload(
      { _id: "entry-1", title: "Edited", status: "publish" },
      {
        _id: "entry-1",
        title: "Live",
        status: "schedule",
        _scheduled: 1_765_000_000_000,
      },
      NOW,
      [],
    );
    expect(payload?.status).toBe("schedule");
    expect(payload?._scheduled).toBe(1_765_000_000_000);
  });

  it("drops a schedule timestamp added only in the form", () => {
    const payload = buildAutosavePayload(
      { _id: "entry-1", title: "Edited", status: "schedule", _scheduled: 1_765_000_000_000 },
      { _id: "entry-1", title: "Live", status: "draft" },
      NOW,
      [],
    );
    expect(payload?.status).toBe("draft");
    expect(Object.hasOwn(payload!, "_scheduled")).toBe(false);
  });

  it("never writes a client-supplied scheduling actor", () => {
    const payload = buildAutosavePayload(
      { _id: "entry-1", title: "Edited", _scheduledBy: "attacker" },
      { _id: "entry-1", title: "Live", status: "publish" },
      NOW,
      [],
    );
    expect(Object.hasOwn(payload!, "_scheduledBy")).toBe(false);
  });
});

describe("entry-autosave - required-field gate (Reload/Back on Create)", () => {
  it("writes nothing for an untouched Create form", () => {
    // Regression: the editor's mount-time normalization turns `null` into
    // `{ en: "" }`, which made the serialized form differ from its snapshot and
    // the navigation guard POST a row with every field empty.
    expect(buildAutosavePayload(untouchedCreateForm(), null, NOW, POSTS_FIELDS)).toBeNull();
  });

  it("writes nothing when a required field is still empty", () => {
    const halfFilled = { ...untouchedCreateForm(), title: { en: "Hello" } };
    expect(buildAutosavePayload(halfFilled, null, NOW, POSTS_FIELDS)).toBeNull();
  });

  it("writes nothing when an edit clears a required field", () => {
    expect(
      buildAutosavePayload(
        { _id: "entry-1", title: { en: "" }, content: { en: "Body" }, status: "publish" },
        { _id: "entry-1", title: { en: "Live" }, content: { en: "Body" }, status: "publish" },
        NOW,
        POSTS_FIELDS,
      ),
    ).toBeNull();
  });

  it("still saves a create form whose required fields are filled", () => {
    const filled = {
      ...untouchedCreateForm(),
      title: { en: "Hello" },
      content: { en: "Body" },
    };
    const payload = buildAutosavePayload(filled, null, NOW, POSTS_FIELDS);
    expect(payload?.status).toBe("draft");
    expect(payload?.title).toEqual({ en: "Hello" });
  });

  it("ignores a required field hidden by showIf", () => {
    const fields = [
      { label: "Title", db_fieldName: "title", required: true },
      {
        label: "Subtitle",
        db_fieldName: "subtitle",
        required: true,
        showIf: { field: "kind", operator: "equals", value: "book" },
      },
    ] as never;
    const payload = buildAutosavePayload(
      { title: "Hello", kind: "article", subtitle: "" },
      null,
      NOW,
      fields,
    );
    expect(payload?.status).toBe("draft");
  });
});

describe("entry-autosave - field predicates", () => {
  it("reports the labels of the missing required fields", () => {
    expect(findMissingRequiredFields(untouchedCreateForm(), POSTS_FIELDS)).toEqual([
      "Title",
      "Content",
    ]);
  });

  it("treats an all-empty locale record as empty", () => {
    expect(isPristineEntry({ title: { en: "", de: "  " }, status: "draft" })).toBe(true);
    expect(isPristineEntry({ title: { en: "", de: "Hallo" } })).toBe(false);
  });

  it("treats arrays of empty values as empty", () => {
    expect(isPristineEntry({ tags: [], meta: {} })).toBe(true);
    expect(isPristineEntry({ tags: ["x"] })).toBe(false);
  });
});
