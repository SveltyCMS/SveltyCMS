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
  guardNavigationAutosave,
  isEmptyEntryValue,
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

  it("counts a Date-valued field as filled", () => {
    // `Object.values(new Date())` is `[]`, so a filled date field used to look
    // empty and blocked the write of an otherwise complete entry.
    expect(isEmptyEntryValue(new Date("2026-10-19T12:00:00.000Z"))).toBe(false);
    expect(isEmptyEntryValue(new Date(Number.NaN))).toBe(true);
    const fields = [
      { label: "Published on", db_fieldName: "publishedOn", required: true },
    ] as never;
    expect(
      findMissingRequiredFields({ publishedOn: new Date("2026-10-19T00:00:00.000Z") }, fields),
    ).toEqual([]);
    expect(
      buildAutosavePayload({ title: "x", publishedOn: new Date(NOW) }, null, NOW, fields),
    ).not.toBeNull();
  });
});

/**
 * Stand-in for SvelteKit's router: `cancel()` aborts the pending navigation,
 * so the navigation only "happens" when the guard did not cancel it. This is
 * what makes the assertion "dirty + invalid stays on the form" testable without
 * mounting the route component.
 */
function routerStub() {
  const state = { cancelled: 0, navigations: 0 };
  return {
    state,
    cancel: () => {
      state.cancelled += 1;
    },
    /** What the router does once `beforeNavigate` settles. */
    settle: () => {
      if (state.cancelled === 0) state.navigations += 1;
      return state;
    },
  };
}

function guardHarness(entryData: Record<string, unknown>, initialSnapshot: string | null) {
  const router = routerStub();
  const saves: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  return {
    router,
    saves,
    warnings,
    run: () =>
      guardNavigationAutosave({
        entryData,
        initialSnapshot,
        fields: POSTS_FIELDS,
        now: NOW,
        cancel: router.cancel,
        saveDraft: async (payload) => {
          saves.push(payload);
          return true;
        },
        notify: (level, message) => {
          if (level === "warning") warnings.push(message);
        },
      }),
  };
}

describe("entry-autosave - beforeNavigate path", () => {
  it("lets a pristine form navigate without a POST", async () => {
    // Reload/Back on an untouched Create form: the editor normalized the
    // skeleton on mount, so the store differs from the page snapshot, but there
    // is nothing to keep. The navigation must go through, silently.
    const form = untouchedCreateForm();
    const harness = guardHarness(form, JSON.stringify({ title: null, content: null }));

    const outcome = await harness.run();

    expect(outcome).toEqual({ action: "navigate", reason: "pristine" });
    expect(harness.router.state.cancelled).toBe(0);
    expect(harness.router.settle().navigations).toBe(1);
    expect(harness.saves).toHaveLength(0);
    expect(harness.warnings).toHaveLength(0);
  });

  it("cancels the navigation and keeps the edits when a required field is empty", async () => {
    // Legacy row (or a field the user just cleared) + other edits: the gate
    // refuses the payload, so the guard must NOT let the router navigate — the
    // typed changes only exist in the store.
    const form = {
      _id: "entry-1",
      title: { en: "" },
      content: { en: "Body the user just typed" },
      status: "publish",
    };
    const harness = guardHarness(
      form,
      JSON.stringify({ _id: "entry-1", title: { en: "Live" }, content: { en: "" } }),
    );

    const outcome = await harness.run();

    expect(outcome.action).toBe("blocked");
    expect(outcome).toMatchObject({ missing: ["Title"] });
    expect(harness.router.state.cancelled).toBe(1);
    // No navigation, no write.
    expect(harness.router.settle().navigations).toBe(0);
    expect(harness.saves).toHaveLength(0);
    // The typed content is still in the store, and the toast names the gap.
    expect(form.title).toEqual({ en: "" });
    expect(form.content).toEqual({ en: "Body the user just typed" });
    expect(harness.warnings[0]).toContain("Title");
  });

  it("still saves a valid dirty form and leaves the navigation to the caller", async () => {
    const form = {
      _id: "entry-1",
      title: { en: "Edited" },
      content: { en: "Body" },
      status: "publish",
    };
    const harness = guardHarness(
      form,
      JSON.stringify({ _id: "entry-1", title: { en: "Live" }, content: { en: "Body" } }),
    );

    expect(await harness.run()).toEqual({ action: "saved" });
    expect(harness.router.state.cancelled).toBe(1);
    expect(harness.saves).toHaveLength(1);
    expect(harness.saves[0].status).toBe("publish");
  });

  it("writes nothing for a form that matches its snapshot", async () => {
    const form = { _id: "entry-1", title: { en: "Live" }, status: "publish" };
    const harness = guardHarness(form, JSON.stringify(form));

    expect(await harness.run()).toEqual({ action: "skipped", reason: "clean" });
    expect(harness.router.state.cancelled).toBe(0);
    expect(harness.router.settle().navigations).toBe(1);
    expect(harness.saves).toHaveLength(0);
  });
});
